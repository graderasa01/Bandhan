import { webcrypto } from "crypto";
import type { Prisma } from "@prisma/client";

/**
 * 0/O, 1/I/L are deliberately absent — these codes get read aloud over the
 * phone and hand-copied off printed cards, where those pairs are the classic
 * transcription failures.
 */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const PREFIX = "BT";
const DEFAULT_LENGTH = 6;
const MAX_COLLISION_RETRIES = 5;

/** Codes that must never be auto-issued or claimed as vanity codes. */
const RESERVED = new Set([
  "BANDHANTAK",
  "BANDHAN",
  "ADMIN",
  "SUPPORT",
  "HELP",
  "OFFICIAL",
  "TEAM",
  "SHAADI",
  "MATRIMONY",
  "TEST",
  "DEMO",
  "NULL",
  "UNDEFINED",
  "ROOT",
]);

/**
 * Exported so the member-referral codes (lib/services/referral/memberCode.ts)
 * are drawn from the *same* alphabet rather than a second copy of it. The
 * transcription argument above is about a human reading a code aloud, and it
 * does not stop applying because the human happens to be a member instead of
 * a partner.
 */
export function randomCodeWithPrefix(prefix: string, length: number): string {
  const bytes = new Uint32Array(length);
  webcrypto.getRandomValues(bytes);
  let out = prefix;
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

function randomCode(length: number): string {
  return randomCodeWithPrefix(PREFIX, length);
}

export function isReserved(code: string): boolean {
  return RESERVED.has(code.toUpperCase());
}

/** Codes are case-insensitive everywhere — normalise before any lookup. */
export function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * Allocates a unique code. Takes a transaction client so issuing a code and
 * flipping a partner to APPROVED are one atomic step — a partner must never
 * end up approved but code-less.
 */
export async function generateUniqueCode(tx: Prisma.TransactionClient): Promise<string> {
  for (let attempt = 0; attempt < MAX_COLLISION_RETRIES; attempt++) {
    const candidate = randomCode(DEFAULT_LENGTH);
    if (isReserved(candidate)) continue;
    const clash = await tx.referralCode.findUnique({ where: { code: candidate } });
    if (!clash) return candidate;
  }

  // Five collisions at 31^6 means the 6-char space is unexpectedly crowded;
  // widen rather than loop forever.
  for (let attempt = 0; attempt < MAX_COLLISION_RETRIES; attempt++) {
    const candidate = randomCode(DEFAULT_LENGTH + 1);
    if (isReserved(candidate)) continue;
    const clash = await tx.referralCode.findUnique({ where: { code: candidate } });
    if (!clash) return candidate;
  }

  throw new Error("Referral code allocation failed after retries.");
}
