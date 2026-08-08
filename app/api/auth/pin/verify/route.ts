import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import {
  PIN_LOCK_MINUTES,
  PIN_LOCK_MS,
  PIN_MAX_ATTEMPTS,
  issuePinUnlockCookie,
  pinLockSecondsRemaining,
} from "@/lib/auth/pin";
import { parseJsonBody } from "@/app/api/_shared/responses";
import type { ApiErrorResponse } from "@/lib/contracts/auth";

export const runtime = "nodejs";

/**
 * The lock screen's one endpoint.
 *
 * Throttled even though the PIN is not an auth boundary: 4 digits is 10,000
 * possibilities, which a script clears in seconds and a determined relative
 * clears over a lunch break. Five tries then a 15-minute wait turns that into
 * roughly two days of continuous tapping — long past the point where anyone
 * borrowing the phone gives up, which is the bar this feature is actually
 * held to.
 *
 * The counter lives on `User` rather than in memory so it survives the server
 * restarts and multi-instance deploys that would otherwise reset it for free.
 */

const VerifySchema = z.object({ pin: z.string() });

function bad(error: string, message: string, status: number, extra?: Record<string, unknown>) {
  const payload: ApiErrorResponse & Record<string, unknown> = { error, message, ...extra };
  return NextResponse.json(payload, { status });
}

const lockedMessage = `Bahut zyada galat koshish. ${PIN_LOCK_MINUTES} minute baad dobara try karein.`;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return bad("UNAUTHENTICATED", "Pehle login karein.", 401);

  // No PIN set → nothing to verify. Reported as a normal outcome, not an
  // error: the lock screen only renders when a PIN exists, so the only way
  // here is a race against the user turning it off in another tab.
  if (!user.pinHash || !user.pinSetAt) {
    return NextResponse.json({ ok: true, has_pin: false });
  }

  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = VerifySchema.safeParse(jsonResult.body);
  if (!parsed.success) return bad("VALIDATION_FAILED", "PIN daaliye.", 422);

  // Checked before the bcrypt compare — a locked account shouldn't be paying
  // for hashes, and shouldn't be leaking timing about whether the guess was
  // close either.
  const secondsLeft = pinLockSecondsRemaining(user.pinLockedUntil);
  if (secondsLeft > 0) {
    return bad("PIN_LOCKED", lockedMessage, 429, { locked_for_seconds: secondsLeft });
  }

  const ok = await verifyPassword(parsed.data.pin, user.pinHash);

  if (!ok) {
    // The lock has expired if we got here, so a stale counter from the last
    // lockout would otherwise re-lock on this single wrong digit.
    const previous = user.pinLockedUntil ? 0 : user.pinFailedAttempts;
    const attempts = previous + 1;
    const nowLocked = attempts >= PIN_MAX_ATTEMPTS;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        pinFailedAttempts: attempts,
        pinLockedUntil: nowLocked ? new Date(Date.now() + PIN_LOCK_MS) : null,
      },
    });

    if (nowLocked) {
      return bad("PIN_LOCKED", lockedMessage, 429, { locked_for_seconds: PIN_LOCK_MS / 1000 });
    }

    // The remaining count is told to the user on purpose. Silently locking
    // someone out on a shared family phone — where the wrong person tapping
    // is the *expected* case, not an attack — is how a privacy feature turns
    // into a support ticket.
    return bad("INVALID_PIN", "PIN galat hai.", 401, {
      attempts_left: PIN_MAX_ATTEMPTS - attempts,
    });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { pinFailedAttempts: 0, pinLockedUntil: null },
  });

  await issuePinUnlockCookie(user.id, user.pinSetAt);

  return NextResponse.json({ ok: true, has_pin: true });
}
