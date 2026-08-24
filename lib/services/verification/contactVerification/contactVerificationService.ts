import "server-only";
import crypto from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import type { VerificationChannel } from "@prisma/client";
import { liveTwilioVerifyAdapter, toE164Indian, type TwilioVerifyAdapter } from "./twilioVerifyAdapter";
import { liveEmailOtpAdapter, type EmailOtpAdapter } from "./emailOtpAdapter";

/**
 * Phone + email verification — the workflow around the two columns Trust
 * Score has always scored (`User.mobileVerifiedAt`/`emailVerifiedAt`, 10/5
 * points) but that nothing ever actually set outside Google Sign-In.
 *
 * ## The one door
 *
 * `sendCode`/`confirmCode` only ever act on the contact **already stored on
 * the signed-in user** — `channel` selects PHONE or EMAIL, never a
 * destination. There is no "verify this number" endpoint that takes a number;
 * changing a contact and re-verifying it is a different, not-yet-built flow
 * (see the schema note on `ContactVerificationChallenge`), and keeping that
 * door shut is what makes an authenticated user unable to burn someone else's
 * phone bill on OTP sends.
 *
 * ## Rate limiting, without a second counter table
 *
 * At most one *bucket* row per (userId, channel) is live at a time. A resend
 * inside the same rolling hour updates that row (`sendCount++`, code reset,
 * `expiresAt` pushed out); a bucket older than an hour starts a fresh row.
 * That single row is therefore both the cooldown clock (`lastSentAt`) and the
 * hourly cap (`sendCount`) — see the schema docstring.
 *
 * ## Never a live call from a test
 *
 * Every function takes its adapter as an optional last argument, defaulting
 * to the live one. `scripts/*-check.ts` passes a mock and never touches
 * Twilio or Resend.
 */

export const OTP_EXPIRY_MINUTES = 10;
export const RESEND_COOLDOWN_SECONDS = 60;
export const MAX_CONFIRM_ATTEMPTS = 5;
export const MAX_SENDS_PER_HOUR = 5;
const SEND_BUCKET_MS = 60 * 60 * 1000;

export interface VerificationAdapters {
  twilio: TwilioVerifyAdapter;
  email: EmailOtpAdapter;
}

export const LIVE_ADAPTERS: VerificationAdapters = {
  twilio: liveTwilioVerifyAdapter,
  email: liveEmailOtpAdapter,
};

/* ------------------------------------------------------------------ */
/* Masking + hashing — exported so the check script can assert on them */
/* ------------------------------------------------------------------ */

export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const visible = local.slice(0, 1) || "*";
  return `${visible}***@${domain}`;
}

export function maskPhone(e164: string): string {
  const digits = e164.replace(/\D/g, "");
  const last3 = digits.slice(-3);
  return `+${digits.slice(0, 2)}${"*".repeat(Math.max(0, digits.length - 5))}${last3}`;
}

function hashDestination(normalized: string): string {
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

function generateOtp(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

function hashOtp(code: string): Promise<string> {
  return hashPassword(code);
}

/* ------------------------------------------------------------------ */
/* Status                                                              */
/* ------------------------------------------------------------------ */

export interface ContactChannelStatus {
  available: boolean;
  masked: string | null;
  verified: boolean;
  cooldownSecondsRemaining: number;
}

export interface ContactVerificationStatus {
  phone: ContactChannelStatus;
  email: ContactChannelStatus;
}

export async function getVerificationStatus(userId: string): Promise<ContactVerificationStatus> {
  const [user, latestPhone, latestEmail] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { mobile: true, email: true, mobileVerifiedAt: true, emailVerifiedAt: true },
    }),
    latestChallenge(userId, "PHONE"),
    latestChallenge(userId, "EMAIL"),
  ]);
  if (!user) {
    return {
      phone: { available: false, masked: null, verified: false, cooldownSecondsRemaining: 0 },
      email: { available: false, masked: null, verified: false, cooldownSecondsRemaining: 0 },
    };
  }

  return {
    phone: {
      available: Boolean(user.mobile),
      masked: user.mobile ? maskPhone(toE164Indian(user.mobile)) : null,
      verified: Boolean(user.mobileVerifiedAt),
      cooldownSecondsRemaining: cooldownRemaining(latestPhone),
    },
    email: {
      available: Boolean(user.email),
      masked: user.email ? maskEmail(user.email) : null,
      verified: Boolean(user.emailVerifiedAt),
      cooldownSecondsRemaining: cooldownRemaining(latestEmail),
    },
  };
}

function latestChallenge(userId: string, channel: VerificationChannel) {
  return prisma.contactVerificationChallenge.findFirst({
    where: { userId, channel },
    orderBy: { createdAt: "desc" },
  });
}

function cooldownRemaining(row: { lastSentAt: Date } | null): number {
  if (!row) return 0;
  const elapsedSeconds = (Date.now() - row.lastSentAt.getTime()) / 1000;
  return Math.max(0, Math.ceil(RESEND_COOLDOWN_SECONDS - elapsedSeconds));
}

/* ------------------------------------------------------------------ */
/* Send                                                                */
/* ------------------------------------------------------------------ */

export type SendCodeError =
  | "no_contact"
  | "already_verified"
  | "not_configured"
  | "cooldown"
  | "rate_limited"
  | "provider_error";

export type SendCodeResult =
  | { ok: true }
  | { ok: false; error: SendCodeError; message: string; retryAfterSeconds?: number };

export async function sendCode(
  userId: string,
  channel: VerificationChannel,
  adapters: VerificationAdapters = LIVE_ADAPTERS,
): Promise<SendCodeResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { mobile: true, email: true, mobileVerifiedAt: true, emailVerifiedAt: true },
  });
  if (!user) return { ok: false, error: "no_contact", message: "Account nahi mila." };

  const destination = channel === "PHONE" ? user.mobile : user.email;
  if (!destination) {
    return {
      ok: false,
      error: "no_contact",
      message: channel === "PHONE" ? "Aapke account me mobile number nahi hai." : "Aapke account me email nahi hai.",
    };
  }
  if (channel === "PHONE" ? user.mobileVerifiedAt : user.emailVerifiedAt) {
    return { ok: false, error: "already_verified", message: "Ye pehle se verify ho chuka hai." };
  }

  const normalized = channel === "PHONE" ? toE164Indian(destination) : destination.trim().toLowerCase();
  const existing = await latestChallenge(userId, channel);
  const now = new Date();
  const reuseBucket = Boolean(existing && now.getTime() - existing.createdAt.getTime() < SEND_BUCKET_MS);

  if (existing && reuseBucket) {
    const cd = cooldownRemaining(existing);
    if (cd > 0) return { ok: false, error: "cooldown", message: "Thoda ruk kar dobara try karein.", retryAfterSeconds: cd };
    if (existing.sendCount >= MAX_SENDS_PER_HOUR) {
      return {
        ok: false,
        error: "rate_limited",
        message: "Is ghante me bahut baar code bheja ja chuka hai. Thodi der baad try karein.",
      };
    }
  }

  let providerRef: string | null = null;
  let codeHash: string | null = null;

  if (channel === "PHONE") {
    const result = await adapters.twilio.startVerification(normalized);
    if (!result.ok) {
      return { ok: false, error: result.reason === "not_configured" ? "not_configured" : "provider_error", message: result.message };
    }
    providerRef = result.sid;
  } else {
    const code = generateOtp();
    const result = await adapters.email.sendOtp(normalized, code);
    if (!result.ok) {
      return { ok: false, error: result.reason === "not_configured" ? "not_configured" : "provider_error", message: result.message };
    }
    codeHash = await hashOtp(code);
  }

  const masked = channel === "PHONE" ? maskPhone(normalized) : maskEmail(normalized);
  const expiresAt = new Date(now.getTime() + OTP_EXPIRY_MINUTES * 60_000);

  if (existing && reuseBucket) {
    await prisma.contactVerificationChallenge.update({
      where: { id: existing.id },
      data: {
        destinationMasked: masked,
        destinationHash: hashDestination(normalized),
        providerRef,
        codeHash,
        expiresAt,
        attemptCount: 0,
        sendCount: existing.sendCount + 1,
        lastSentAt: now,
        consumedAt: null,
      },
    });
  } else {
    await prisma.contactVerificationChallenge.create({
      data: {
        userId,
        channel,
        destinationMasked: masked,
        destinationHash: hashDestination(normalized),
        providerRef,
        codeHash,
        expiresAt,
        sendCount: 1,
        lastSentAt: now,
      },
    });
  }

  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Confirm                                                             */
/* ------------------------------------------------------------------ */

export type ConfirmCodeError =
  | "invalid_or_expired"
  | "too_many_attempts"
  | "not_configured"
  | "provider_error";

export type ConfirmCodeResult = { ok: true } | { ok: false; error: ConfirmCodeError; message: string };

const GENERIC_INVALID = "Code sahi nahi hai ya expire ho gaya hai. Dobara try karein ya naya code mangwayein.";

export async function confirmCode(
  userId: string,
  channel: VerificationChannel,
  code: string,
  adapters: VerificationAdapters = LIVE_ADAPTERS,
): Promise<ConfirmCodeResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { mobile: true, email: true, mobileVerifiedAt: true, emailVerifiedAt: true },
  });
  if (!user) return { ok: false, error: "invalid_or_expired", message: GENERIC_INVALID };

  // Idempotent — a second confirm after success (double-tap, stale tab) is a
  // no-op success, not an error.
  if (channel === "PHONE" ? user.mobileVerifiedAt : user.emailVerifiedAt) return { ok: true };

  const destination = channel === "PHONE" ? user.mobile : user.email;
  if (!destination) return { ok: false, error: "invalid_or_expired", message: GENERIC_INVALID };
  const normalized = channel === "PHONE" ? toE164Indian(destination) : destination.trim().toLowerCase();

  const challenge = await latestChallenge(userId, channel);
  const now = new Date();

  if (
    !challenge ||
    challenge.consumedAt !== null ||
    challenge.expiresAt.getTime() < now.getTime() ||
    // The destination on file changed since this code was sent — treat as
    // stale rather than confirming a code for a contact that no longer
    // matches. See the "verify only the contact currently stored on that
    // signed-in user" requirement.
    challenge.destinationHash !== hashDestination(normalized)
  ) {
    return { ok: false, error: "invalid_or_expired", message: GENERIC_INVALID };
  }

  if (challenge.attemptCount >= MAX_CONFIRM_ATTEMPTS) {
    return { ok: false, error: "too_many_attempts", message: "Bahut galat attempts ho gaye. Naya code mangwayein." };
  }

  let approved: boolean;

  if (channel === "PHONE") {
    const result = await adapters.twilio.checkVerification(normalized, code);
    if (!result.ok) {
      return { ok: false, error: result.reason === "not_configured" ? "not_configured" : "provider_error", message: result.message };
    }
    approved = result.approved;
  } else {
    approved = challenge.codeHash !== null && (await verifyPassword(code, challenge.codeHash));
  }

  if (!approved) {
    await prisma.contactVerificationChallenge.update({
      where: { id: challenge.id },
      data: { attemptCount: { increment: 1 } },
    });
    return { ok: false, error: "invalid_or_expired", message: GENERIC_INVALID };
  }

  await prisma.$transaction([
    prisma.contactVerificationChallenge.update({
      where: { id: challenge.id },
      data: { consumedAt: now },
    }),
    prisma.user.update({
      where: { id: userId },
      data: channel === "PHONE" ? { mobileVerifiedAt: now } : { emailVerifiedAt: now },
    }),
  ]);

  return { ok: true };
}
