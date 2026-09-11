import "server-only";
import crypto from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { JWT_ALG, jwtSecretKey } from "@/lib/auth/jwt";
import { prisma } from "@/lib/db/prisma";
import { checkRate } from "@/lib/services/security/requestRateLimit";
import {
  LIVE_ADAPTERS,
  maskEmail,
  maskPhone,
  verificationProviderStatus,
  type VerificationAdapters,
} from "@/lib/services/verification/contactVerification/contactVerificationService";
import { toE164Indian } from "@/lib/services/verification/contactVerification/twilioVerifyAdapter";

/**
 * One-time codes for a contact that is *not yet tied to a signed-in user* —
 * the two moments the app has no session to hang a challenge on:
 *
 *   - `/bolo`, where a visitor has just spoken their whole profile and only
 *     now gives a number so an account can be created around it;
 *   - `/login`, where a member wants in with a code instead of a password.
 *
 * `contactVerificationService` deliberately refuses both: its one door is
 * "prove the contact already stored on the row you are signed in as", which is
 * what stops an authenticated user from spending OTP sends on a stranger's
 * number. This service is the *other* door and carries its own brakes instead:
 * a per-contact hourly cap, a per-IP cap, a resend cooldown, and five attempts
 * per code — the same numbers, enforced here because the rows in
 * `ContactVerificationChallenge` need a `userId` there is none of yet.
 *
 * ## What "verified" produces
 *
 * Not a session. A short-lived, signed **contact proof** (`purpose:
 * "contact-proof"`, 15 minutes) that says "this contact answered its code".
 * Whoever holds it can then create an account on that contact
 * (`/api/bolo/complete`) or open a session on an existing one
 * (`/api/auth/otp/verify` does that itself). Splitting "proved" from "logged
 * in" is what lets the bolo page prove a number *before* it decides whether
 * that number is a new member or a returning one.
 *
 * ## State
 *
 * In-process, keyed by the normalised contact. Twilio keeps the SMS code on
 * its side; only email codes are hashed here (bcrypt, never stored raw, never
 * logged). A restart forgets pending codes — the visitor just taps "resend",
 * which the cooldown allows after a minute. Same single-container honesty as
 * `requestRateLimit.ts`.
 */

export const OTP_EXPIRY_MS = 10 * 60 * 1000;
export const RESEND_COOLDOWN_MS = 60 * 1000;
export const MAX_ATTEMPTS = 5;
const SENDS_PER_CONTACT_PER_HOUR = 5;
const SENDS_PER_IP_PER_HOUR = 12;
const PROOF_TTL_SECONDS = 15 * 60;
const PROOF_PURPOSE = "contact-proof";

export type Contact = { kind: "mobile"; value: string } | { kind: "email"; value: string };

/** "98765 43210", "+91 9876543210", "09876543210" → mobile; anything with @ → email. */
export function parseContact(raw: string): Contact | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if (s.includes("@")) {
    const email = s.toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? { kind: "email", value: email } : null;
  }
  let digits = s.replace(/[०-९]/g, (d) => String("०१२३४५६७८९".indexOf(d))).replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? { kind: "mobile", value: digits } : null;
}

export function maskContact(contact: Contact): string {
  return contact.kind === "mobile" ? maskPhone(toE164Indian(contact.value)) : maskEmail(contact.value);
}

function contactKey(contact: Contact): string {
  return `${contact.kind}:${contact.value}`;
}

interface Challenge {
  contact: Contact;
  /** Email only — Twilio Verify holds the SMS code itself. */
  codeHash: string | null;
  expiresAt: number;
  attempts: number;
  lastSentAt: number;
}

const challenges = new Map<string, Challenge>();

/** Which channels can actually deliver a code on this deployment. */
export function otpChannelStatus(): { mobile: boolean; email: boolean } {
  const s = verificationProviderStatus();
  return { mobile: s.phone, email: s.email };
}

export function isOtpConfiguredFor(contact: Contact): boolean {
  const s = otpChannelStatus();
  return contact.kind === "mobile" ? s.mobile : s.email;
}

/** Whether an account already owns this contact — the send result tells the caller, so the UI can say "login" instead of "create". */
export async function findUserByContact(contact: Contact) {
  return prisma.user.findFirst({
    where: contact.kind === "mobile" ? { mobile: contact.value, deletedAt: null } : { email: contact.value, deletedAt: null },
    select: { id: true, role: true, status: true, fullName: true },
  });
}

export type SendOtpError = "invalid" | "not_configured" | "cooldown" | "rate_limited" | "provider_error";

export type SendOtpResult =
  | { ok: true; masked: string; existingUser: boolean; expiresInSeconds: number }
  | { ok: false; error: SendOtpError; message: string; retryAfterSeconds?: number; existingUser?: boolean };

export async function sendContactOtp(
  contact: Contact,
  ip: string,
  adapters: VerificationAdapters = LIVE_ADAPTERS,
): Promise<SendOtpResult> {
  const existingUser = Boolean(await findUserByContact(contact));

  if (!isOtpConfiguredFor(contact)) {
    return {
      ok: false,
      error: "not_configured",
      message:
        contact.kind === "mobile"
          ? "SMS OTP is waqt uplabdh nahi hai."
          : "Email OTP is waqt uplabdh nahi hai.",
      existingUser,
    };
  }

  const key = contactKey(contact);
  const now = Date.now();
  const pending = challenges.get(key);
  if (pending && now - pending.lastSentAt < RESEND_COOLDOWN_MS) {
    const retryAfterSeconds = Math.ceil((RESEND_COOLDOWN_MS - (now - pending.lastSentAt)) / 1000);
    return { ok: false, error: "cooldown", message: `Code abhi bheja gaya hai — ${retryAfterSeconds} second baad phir try karein.`, retryAfterSeconds, existingUser };
  }

  const perContact = checkRate(`otp:contact:${key}`, { limit: SENDS_PER_CONTACT_PER_HOUR, windowMs: 60 * 60 * 1000 });
  if (!perContact.ok) {
    return { ok: false, error: "rate_limited", message: "Is contact par abhi bahut codes bheje ja chuke hain. Thodi der baad try karein.", retryAfterSeconds: perContact.retryAfterSeconds, existingUser };
  }
  const perIp = checkRate(`otp:ip:${ip}`, { limit: SENDS_PER_IP_PER_HOUR, windowMs: 60 * 60 * 1000 });
  if (!perIp.ok) {
    return { ok: false, error: "rate_limited", message: "Abhi bahut codes bheje ja chuke hain. Thodi der baad try karein.", retryAfterSeconds: perIp.retryAfterSeconds, existingUser };
  }

  let codeHash: string | null = null;
  if (contact.kind === "mobile") {
    const sent = await adapters.twilio.startVerification(toE164Indian(contact.value));
    if (!sent.ok) {
      return { ok: false, error: sent.reason, message: sent.message, existingUser };
    }
  } else {
    const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
    const sent = await adapters.email.sendOtp(contact.value, code);
    if (!sent.ok) {
      return { ok: false, error: sent.reason, message: sent.message, existingUser };
    }
    codeHash = await hashPassword(code);
  }

  challenges.set(key, { contact, codeHash, expiresAt: now + OTP_EXPIRY_MS, attempts: 0, lastSentAt: now });
  sweep(now);

  return { ok: true, masked: maskContact(contact), existingUser, expiresInSeconds: OTP_EXPIRY_MS / 1000 };
}

export type VerifyOtpError = "no_challenge" | "expired" | "wrong" | "too_many_attempts" | "provider_error";

export type VerifyOtpResult =
  | { ok: true; proof: string; contact: Contact }
  | { ok: false; error: VerifyOtpError; message: string; attemptsLeft?: number };

export async function verifyContactOtp(
  contact: Contact,
  code: string,
  adapters: VerificationAdapters = LIVE_ADAPTERS,
): Promise<VerifyOtpResult> {
  const key = contactKey(contact);
  const challenge = challenges.get(key);
  const digits = String(code ?? "").replace(/[०-९]/g, (d) => String("०१२३४५६७८९".indexOf(d))).replace(/\D/g, "");

  if (!challenge) return { ok: false, error: "no_challenge", message: "Pehle code bhejwayein." };
  if (Date.now() > challenge.expiresAt) {
    challenges.delete(key);
    return { ok: false, error: "expired", message: "Code expire ho gaya — naya code bhejwayein." };
  }
  if (challenge.attempts >= MAX_ATTEMPTS) {
    challenges.delete(key);
    return { ok: false, error: "too_many_attempts", message: "Bahut baar galat code — naya code bhejwayein." };
  }
  if (!/^\d{6}$/.test(digits)) {
    return { ok: false, error: "wrong", message: "6 digit ka code daaliye.", attemptsLeft: MAX_ATTEMPTS - challenge.attempts };
  }

  challenge.attempts += 1;

  let approved = false;
  if (contact.kind === "mobile") {
    const check = await adapters.twilio.checkVerification(toE164Indian(contact.value), digits);
    if (!check.ok) return { ok: false, error: "provider_error", message: check.message };
    approved = check.approved;
  } else {
    approved = challenge.codeHash ? await verifyPassword(digits, challenge.codeHash) : false;
  }

  if (!approved) {
    const attemptsLeft = MAX_ATTEMPTS - challenge.attempts;
    if (attemptsLeft <= 0) {
      challenges.delete(key);
      return { ok: false, error: "too_many_attempts", message: "Bahut baar galat code — naya code bhejwayein." };
    }
    return { ok: false, error: "wrong", message: "Code galat hai.", attemptsLeft };
  }

  challenges.delete(key);
  const proof = await new SignJWT({ purpose: PROOF_PURPOSE, kind: contact.kind, value: contact.value })
    .setProtectedHeader({ alg: JWT_ALG })
    .setIssuedAt()
    .setExpirationTime(`${PROOF_TTL_SECONDS}s`)
    .sign(jwtSecretKey());

  return { ok: true, proof, contact };
}

/** The contact a proof vouches for, or null for anything forged, expired, or not a proof. */
export async function readContactProof(proof: string | null | undefined): Promise<Contact | null> {
  if (!proof) return null;
  try {
    const { payload } = await jwtVerify(proof, jwtSecretKey(), { algorithms: [JWT_ALG] });
    if (payload.purpose !== PROOF_PURPOSE) return null;
    if ((payload.kind !== "mobile" && payload.kind !== "email") || typeof payload.value !== "string") return null;
    return { kind: payload.kind, value: payload.value };
  } catch {
    return null;
  }
}

export function sameContact(a: Contact, b: Contact): boolean {
  return a.kind === b.kind && a.value === b.value;
}

function sweep(now: number) {
  if (challenges.size < 500) return;
  for (const [k, c] of challenges) if (c.expiresAt < now) challenges.delete(k);
}

/** Test seam. */
export function resetContactOtpState() {
  challenges.clear();
}
