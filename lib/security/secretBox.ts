import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

/**
 * Symmetric encryption for secrets this app has to be able to read back —
 * third-party API keys (ProviderCredential) and partner payout account numbers
 * (PartnerPayoutAccount).
 *
 * Deliberately *not* hashing: a password is verified, so it gets bcrypt (see
 * lib/auth/password.ts) and is never recoverable. These values have to be sent
 * back out — to Anthropic, to a bank file — so they need a cipher, and the
 * whole security of that rests on the key living somewhere the database dump
 * doesn't.
 *
 * AES-256-GCM, not CBC: GCM authenticates as well as encrypts, so a tampered
 * ciphertext fails loudly at `decrypt` instead of quietly producing garbage
 * that some downstream call then treats as a real key.
 *
 * ## The key
 *
 * `SECRETS_ENCRYPTION_KEY` — 32 bytes, base64 or hex. Generate one with:
 *
 *     node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 *
 * **If this value is lost, every stored secret is unrecoverable.** They are not
 * derivable from anything else. Losing it isn't fatal in practice — an admin
 * re-enters the keys — but it must be treated as a real credential and kept
 * out of the repo.
 */

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12; // GCM's standard nonce length

export interface SealedSecret {
  cipherText: string;
  iv: string;
  authTag: string;
}

let cachedKey: Buffer | null = null;

/**
 * Reads and validates the key. Throws rather than falling back to a hardcoded
 * default — a "working" encryption path with a known key is worse than a
 * loud failure, because it looks fine right up until the dump leaks.
 */
function encryptionKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = process.env.SECRETS_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "SECRETS_ENCRYPTION_KEY set nahi hai — encrypted secrets (API keys, payout accounts) ke liye zaroori hai. See .env.example.",
    );
  }

  // Accept base64 or hex so whichever way the operator generated it works.
  const key = /^[0-9a-fA-F]{64}$/.test(raw.trim())
    ? Buffer.from(raw.trim(), "hex")
    : Buffer.from(raw.trim(), "base64");

  if (key.length !== KEY_BYTES) {
    throw new Error(
      `SECRETS_ENCRYPTION_KEY ${KEY_BYTES} bytes ka hona chahiye (base64 ya hex), mila ${key.length}.`,
    );
  }

  cachedKey = key;
  return key;
}

/** True when a usable key is configured — lets callers degrade politely instead of throwing at the user. */
export function isSecretBoxConfigured(): boolean {
  try {
    encryptionKey();
    return true;
  } catch {
    return false;
  }
}

export function seal(plainText: string): SealedSecret {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const cipherText = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  return {
    cipherText: cipherText.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

/**
 * Returns null rather than throwing when the ciphertext can't be opened — a
 * rotated `SECRETS_ENCRYPTION_KEY` leaves rows that simply can't be read, and
 * that has to degrade to "this provider isn't configured" rather than take
 * down every AI call in the app.
 */
export function open(sealed: SealedSecret): string | null {
  try {
    const decipher = createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(sealed.iv, "base64"));
    decipher.setAuthTag(Buffer.from(sealed.authTag, "base64"));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(sealed.cipherText, "base64")),
      decipher.final(),
    ]);
    return plain.toString("utf8");
  } catch {
    return null;
  }
}

/** `••••` + the last 4 characters — what the admin UI shows in place of the value. */
export function maskSecret(lastFour: string): string {
  return `••••${lastFour}`;
}

/** The 4 characters worth storing alongside the ciphertext so a key can be identified without opening it. */
export function lastFourOf(plainText: string): string {
  return plainText.slice(-4);
}

/** Test seam only — resets the memoised key after `process.env` changes. */
export function __resetSecretBoxCache() {
  cachedKey = null;
}
