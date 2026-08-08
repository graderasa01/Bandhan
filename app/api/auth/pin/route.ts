import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  PIN_LENGTH,
  PIN_LOCK_MINUTES,
  PIN_LOCK_MS,
  PIN_MAX_ATTEMPTS,
  PIN_STRENGTH_MESSAGES,
  clearPinUnlockCookie,
  isPinUnlocked,
  issuePinUnlockCookie,
  pinLockSecondsRemaining,
  validatePinStrength,
} from "@/lib/auth/pin";
import { parseJsonBody } from "@/app/api/_shared/responses";
import type { ApiErrorResponse } from "@/lib/contracts/auth";

export const runtime = "nodejs";

/**
 * Set / change / remove the quick-unlock PIN, plus a GET the settings card
 * reads its initial state from.
 *
 * Session-authenticated throughout (`getCurrentUser`) — the PIN never grants
 * access, it only withholds the screen from whoever else is holding the
 * phone, so there is nothing here a logged-in owner shouldn't be able to do.
 * See lib/auth/pin.ts for why that framing decides the rest of the design.
 */

const SetPinSchema = z.object({
  pin: z.string(),
  /** Required only when a PIN already exists — enforced below, not by zod, so the error names the real reason. */
  current_pin: z.string().optional(),
});

const RemovePinSchema = z.object({ pin: z.string() });

function bad(error: string, message: string, status: number, extra?: Record<string, unknown>) {
  const payload: ApiErrorResponse & Record<string, unknown> = { error, message, ...extra };
  return NextResponse.json(payload, { status });
}

function unauthenticated() {
  return bad("UNAUTHENTICATED", "Pehle login karein.", 401);
}

/**
 * The lockout gate, shared by every route that checks an existing PIN. Also
 * *clears* an expired lock, which is what lets the attempt counter start from
 * zero after the wait instead of re-locking on the very next typo.
 */
async function consumeLockout(user: { id: string; pinLockedUntil: Date | null }) {
  const secondsLeft = pinLockSecondsRemaining(user.pinLockedUntil);
  if (secondsLeft > 0) {
    return bad(
      "PIN_LOCKED",
      `Bahut zyada galat koshish. ${PIN_LOCK_MINUTES} minute baad dobara try karein.`,
      429,
      { locked_for_seconds: secondsLeft },
    );
  }
  if (user.pinLockedUntil) {
    await prisma.user.update({
      where: { id: user.id },
      data: { pinLockedUntil: null, pinFailedAttempts: 0 },
    });
  }
  return null;
}

/** Wrong-PIN bookkeeping, shared by change-PIN and remove-PIN. `/verify` owns its own copy — see that route. */
async function registerFailure(user: { id: string; pinFailedAttempts: number }) {
  const attempts = user.pinFailedAttempts + 1;
  const locked = attempts >= PIN_MAX_ATTEMPTS;
  await prisma.user.update({
    where: { id: user.id },
    data: {
      pinFailedAttempts: attempts,
      pinLockedUntil: locked ? new Date(Date.now() + PIN_LOCK_MS) : null,
    },
  });
  return locked;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthenticated();

  return NextResponse.json({
    ok: true,
    has_pin: Boolean(user.pinHash),
    unlocked: await isPinUnlocked(user.id, user.pinHash ? user.pinSetAt : null),
    locked_for_seconds: pinLockSecondsRemaining(user.pinLockedUntil),
  });
}

/** Set a first PIN, or change an existing one (which requires the old one). */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthenticated();

  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = SetPinSchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return bad("VALIDATION_FAILED", `PIN ${PIN_LENGTH} digits ka daaliye.`, 422);
  }
  const { pin, current_pin } = parsed.data;

  const strengthError = validatePinStrength(pin);
  if (strengthError) {
    return bad("WEAK_PIN", PIN_STRENGTH_MESSAGES[strengthError], 422);
  }

  if (user.pinHash) {
    const locked = await consumeLockout(user);
    if (locked) return locked;

    if (!current_pin) {
      return bad("CURRENT_PIN_REQUIRED", "PIN badalne ke liye purana PIN daalna zaroori hai.", 422);
    }
    const currentOk = await verifyPassword(current_pin, user.pinHash);
    if (!currentOk) {
      const nowLocked = await registerFailure(user);
      return bad(
        nowLocked ? "PIN_LOCKED" : "INVALID_PIN",
        nowLocked
          ? `Bahut zyada galat koshish. ${PIN_LOCK_MINUTES} minute baad dobara try karein.`
          : "Purana PIN galat hai.",
        nowLocked ? 429 : 401,
      );
    }
  }

  const pinSetAt = new Date();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      pinHash: await hashPassword(pin),
      pinSetAt,
      pinFailedAttempts: 0,
      pinLockedUntil: null,
    },
  });

  // Unlock immediately. Somebody who just typed the new PIN twice has proved
  // it as thoroughly as the lock screen ever would, and bouncing them into a
  // lock screen right after setting it reads as a bug, not as security.
  await issuePinUnlockCookie(user.id, pinSetAt);

  console.info(`[auth:pin] ${user.pinHash ? "changed" : "set"} user=${user.id}`);

  return NextResponse.json({ ok: true, has_pin: true });
}

/** Turn the PIN off. Needs the current PIN — otherwise the lock screen is the only thing protecting its own off-switch. */
export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthenticated();

  if (!user.pinHash) {
    return NextResponse.json({ ok: true, has_pin: false });
  }

  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = RemovePinSchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return bad("VALIDATION_FAILED", "Apna PIN daaliye.", 422);
  }

  const locked = await consumeLockout(user);
  if (locked) return locked;

  const pinOk = await verifyPassword(parsed.data.pin, user.pinHash);
  if (!pinOk) {
    const nowLocked = await registerFailure(user);
    return bad(
      nowLocked ? "PIN_LOCKED" : "INVALID_PIN",
      nowLocked
        ? `Bahut zyada galat koshish. ${PIN_LOCK_MINUTES} minute baad dobara try karein.`
        : "PIN galat hai.",
      nowLocked ? 429 : 401,
    );
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { pinHash: null, pinSetAt: null, pinFailedAttempts: 0, pinLockedUntil: null },
  });

  // The cookie is bound to the old `pinSetAt` and is already dead weight, but
  // leaving it would silently pre-unlock the *next* PIN if it happened to be
  // set in the same millisecond. Cheap to clear, so clear it.
  await clearPinUnlockCookie();

  console.info(`[auth:pin] removed user=${user.id}`);

  return NextResponse.json({ ok: true, has_pin: false });
}
