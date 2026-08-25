import "server-only";
import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/db/prisma";
import { hashPassword } from "@/lib/auth/password";
import { revokeAllSessions } from "@/lib/auth/session";
import { livePasswordResetEmailAdapter, type PasswordResetEmailAdapter } from "./passwordResetEmailAdapter";

/**
 * "Forgot password?" — the link the login page's dead `href="#"` never went
 * anywhere for.
 *
 * ## The response never says whether the account exists
 *
 * `requestPasswordReset` always returns the same `{ ok: true }` — whether the
 * mobile/email matched nobody, matched a Google-only account, or matched a
 * real one that just got emailed a link. `POST /api/auth/login` already
 * treats "no such account" and "wrong password" as one indistinguishable
 * message for the same reason: telling an attacker probing addresses which
 * ones are real accounts is a bigger leak than the inconvenience of a generic
 * confirmation.
 *
 * ## A reset works on any account with an email, not just password ones
 *
 * A Google-only account has no `passwordHash` to change *from*, but it can
 * still gain one — this becomes the account's first password rather than a
 * replacement. Restricting resets to already-password accounts would protect
 * nothing (Google Sign-In stays available either way) and would just leave a
 * Google user with no way to also sign in with a password if they ever wanted
 * one.
 *
 * ## What consuming a token does, besides the obvious
 *
 * It also calls `revokeAllSessions` — see that function for why: a reset
 * happens because a password was lost or compromised, and either way every
 * *other* device should be signed out, not just the one that reset it.
 */

const TOKEN_TTL_MS = 30 * 60_000;
const COOLDOWN_MS = 60_000;
const MAX_REQUESTS_PER_HOUR = 5;
const HOUR_MS = 60 * 60_000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface RequestResetDeps {
  email: PasswordResetEmailAdapter;
  now: () => Date;
}

const LIVE_DEPS: RequestResetDeps = {
  email: livePasswordResetEmailAdapter,
  now: () => new Date(),
};

/**
 * `resetUrlOrigin` comes from the request that hit the API route (`new
 * URL(req.url).origin`), not from `APP_URL`/`NEXT_PUBLIC_APP_URL` — both are
 * unset in production today, and deriving the link from whatever host the
 * request actually arrived on means it works regardless.
 */
export async function requestPasswordReset(
  mobileOrEmail: string,
  resetUrlOrigin: string,
  deps: RequestResetDeps = LIVE_DEPS,
): Promise<{ ok: true }> {
  const trimmed = mobileOrEmail.trim();
  const user = await prisma.user.findFirst({
    where: { OR: [{ mobile: trimmed }, { email: trimmed }], deletedAt: null },
    select: { id: true, email: true, status: true },
  });

  // Every branch below falls through to the same `{ ok: true }` — no account,
  // no email on file, blocked/deleted, rate-limited, or provider failure all
  // look identical from the caller's side. Logged, not surfaced.
  if (!user || !user.email) return { ok: true };
  if (user.status === "BLOCKED" || user.status === "DELETED") return { ok: true };

  const now = deps.now();
  const recent = await prisma.passwordResetToken.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });
  if (recent && now.getTime() - recent.createdAt.getTime() < COOLDOWN_MS) return { ok: true };

  const requestsThisHour = await prisma.passwordResetToken.count({
    where: { userId: user.id, createdAt: { gt: new Date(now.getTime() - HOUR_MS) } },
  });
  if (requestsThisHour >= MAX_REQUESTS_PER_HOUR) return { ok: true };

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + TOKEN_TTL_MS);

  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash: hashToken(token), expiresAt },
  });

  const resetUrl = `${resetUrlOrigin}/reset-password?token=${token}`;
  const result = await deps.email.send(user.email, resetUrl);
  if (!result.ok) {
    // Same "degrade loudly" rule as `pickPoolPoll`'s empty poll bank: the user
    // sees the identical generic confirmation either way, so this line is the
    // only place a missing RESEND_API_KEY becomes visible at all. Logging the
    // URL itself — not just that sending failed — is deliberate: it is what
    // lets an admin actually finish a reset for someone while Resend still
    // isn't configured, rather than the feature being silently unusable.
    console.error(`[password-reset] send failed for user ${user.id}: ${result.message}. Link: ${resetUrl}`);
  }

  return { ok: true };
}

export type ConsumeResetError = "invalid_or_expired" | "too_short";

export type ConsumeResetResult = { ok: true } | { ok: false; error: ConsumeResetError; message: string };

export async function consumePasswordReset(token: string, newPassword: string): Promise<ConsumeResetResult> {
  if (newPassword.length < 8) {
    return { ok: false, error: "too_short", message: "Password kam se kam 8 characters ka hona chahiye." };
  }

  const tokenHash = hashToken(token);
  const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!row || row.consumedAt || row.expiresAt < new Date()) {
    return {
      ok: false,
      error: "invalid_or_expired",
      message: "Ye link kaam nahi kar raha ya expire ho gaya hai — dobara reset request karein.",
    };
  }

  const passwordHash = await hashPassword(newPassword);

  await prisma.$transaction([
    prisma.user.update({ where: { id: row.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: row.id }, data: { consumedAt: new Date() } }),
    // Tidy rather than load-bearing: the consumed token above is already
    // unusable, this just stops any other still-live link for the same
    // request-storm from also working.
    prisma.passwordResetToken.updateMany({
      where: { userId: row.userId, consumedAt: null, id: { not: row.id } },
      data: { consumedAt: new Date() },
    }),
  ]);

  await revokeAllSessions(row.userId);

  return { ok: true };
}
