/**
 * The half of the quick-unlock PIN feature that both sides need.
 *
 * Split out of `lib/auth/pin.ts` purely because that file is `server-only`
 * (it touches cookies and the JWT secret) while the lock screen and the
 * settings card are client components — importing the server module from them
 * is a build error, and duplicating "4" and the weak-PIN rules into the UI is
 * how the keypad and the API end up disagreeing about what a valid PIN is.
 *
 * The rules here run in *both* places on purpose: the client copy exists so a
 * user sees "1234 nahi chalega" while typing rather than after a round trip.
 * The server copy in the route is the one that decides.
 */

export const PIN_LENGTH = 4;
export const PIN_MAX_ATTEMPTS = 5;
export const PIN_LOCK_MINUTES = 15;
export const PIN_LOCK_MS = PIN_LOCK_MINUTES * 60 * 1000;

/**
 * Whole-digit sequences only — `1234`, `2345`, `9876`. Not a general
 * "guessable PIN" blocklist: the top-N lists (1122, 2580, birth years…) get
 * long, arbitrary and locale-wrong fast, and every entry is a user who typed
 * something reasonable and got told no. These two families are the ones people
 * pick *because* they are patterns, not because they mean anything.
 */
function isSequential(pin: string): boolean {
  const digits = [...pin].map(Number);
  const up = digits.every((d, i) => i === 0 || d === digits[i - 1] + 1);
  const down = digits.every((d, i) => i === 0 || d === digits[i - 1] - 1);
  return up || down;
}

export type PinStrengthError = "FORMAT" | "REPEATED" | "SEQUENTIAL";

/** Hinglish — this is body copy the user reads under the keypad, not a log line. */
export const PIN_STRENGTH_MESSAGES: Record<PinStrengthError, string> = {
  FORMAT: `PIN exactly ${PIN_LENGTH} digits ka hona chahiye (sirf 0-9).`,
  REPEATED: "Saare digit ek jaise nahi ho sakte — jaise 1111 ya 0000.",
  SEQUENTIAL: "Seedha sequence nahi chalega — jaise 1234 ya 4321.",
};

export function validatePinStrength(pin: string): PinStrengthError | null {
  if (!new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin)) return "FORMAT";
  if (new Set(pin).size === 1) return "REPEATED";
  if (isSequential(pin)) return "SEQUENTIAL";
  return null;
}

/** Seconds still to wait, or 0 when not locked. Rounded up so "0 seconds left" never shows while locked. */
export function pinLockSecondsRemaining(lockedUntil: Date | null): number {
  if (!lockedUntil) return 0;
  const ms = lockedUntil.getTime() - Date.now();
  return ms > 0 ? Math.ceil(ms / 1000) : 0;
}
