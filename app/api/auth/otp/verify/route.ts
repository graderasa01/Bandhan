import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { createSession } from "@/lib/auth/session";
import { postLoginPathWithNext } from "@/lib/auth/postLoginPath";
import { toUserDto } from "@/lib/auth/dto";
import { prisma } from "@/lib/db/prisma";
import { findUserByContact, parseContact, verifyContactOtp } from "@/lib/services/auth/contactOtpService";
import { checkRate, clientIp } from "@/lib/services/security/requestRateLimit";

export const runtime = "nodejs";

/**
 * Check a one-time code. Two outcomes on success:
 *
 *   - `login: true` and an account owns the contact → a session is opened,
 *     the same way `/api/auth/login` does it after a password, and `landing`
 *     says where to go. No password ever existed or was needed.
 *   - otherwise → a short-lived `proof` the bolo page hands to
 *     `/api/bolo/complete`, which creates (or, for a returning member, opens)
 *     the account around the now-proven contact.
 *
 * Guesses are bounded twice: five per code inside the service, and a per-IP
 * cap here so a script cannot rotate contacts to get unlimited tries.
 */
const BodySchema = z.object({
  contact: z.string().trim().min(3).max(120),
  code: z.string().trim().min(4).max(12),
  login: z.boolean().optional().default(false),
  next: z.string().optional(),
});

const VERIFIES_PER_IP = { limit: 30, windowMs: 10 * 60 * 1000 };

export async function POST(req: Request) {
  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;
  const parsed = BodySchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid", message: "Contact aur code dono chahiye." }, { status: 422 });
  }

  const rate = checkRate(`otp:verify:${clientIp(req)}`, VERIFIES_PER_IP);
  if (!rate.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited", message: "Thodi der baad try karein." },
      { status: 429, headers: { "retry-after": String(rate.retryAfterSeconds) } },
    );
  }

  const contact = parseContact(parsed.data.contact);
  if (!contact) {
    return NextResponse.json({ ok: false, error: "invalid", message: "Valid mobile ya email daaliye." }, { status: 422 });
  }

  const result = await verifyContactOtp(contact, parsed.data.code);
  if (!result.ok) {
    const status = result.error === "provider_error" ? 502 : 400;
    return NextResponse.json(result, { status });
  }

  const existing = await findUserByContact(contact);

  if (parsed.data.login && existing) {
    if (existing.status === "BLOCKED" || existing.status === "DELETED") {
      return NextResponse.json(
        { ok: false, error: "account_blocked", message: "Ye account blocked hai. Support se sampark karein." },
        { status: 403 },
      );
    }
    if (existing.status === "SUSPENDED") {
      return NextResponse.json(
        { ok: false, error: "account_suspended", message: "Ye account abhi suspended hai. Support se sampark karein." },
        { status: 403 },
      );
    }
    // Only the member door opens here — an admin or support account keeps its
    // own unlisted login, exactly as `/api/auth/login` enforces with `portal`.
    if (existing.role === "ADMIN" || existing.role === "SUPPORT") {
      return NextResponse.json({ ok: false, error: "wrong_portal", message: "Is account ka login alag hai." }, { status: 403 });
    }

    const now = new Date();
    const user = await prisma.user.update({
      where: { id: existing.id },
      data: {
        lastLoginAt: now,
        // A code answered from this contact is exactly the verification the
        // trust score has always scored — stamp it on every OTP login.
        ...(contact.kind === "mobile" ? { mobileVerifiedAt: now } : { emailVerifiedAt: now }),
      },
    });
    await createSession({
      userId: user.id,
      role: user.role,
      status: user.status,
      ipAddress: clientIp(req),
      userAgent: req.headers.get("user-agent") ?? undefined,
      rememberMe: true,
    });
    console.info(`[auth:otp-login] user=${user.id}`);
    const landing = await postLoginPathWithNext(user, parsed.data.next);
    return NextResponse.json({ ok: true, loggedIn: true, user: toUserDto(user), landing });
  }

  return NextResponse.json({ ok: true, loggedIn: false, proof: result.proof, existingUser: Boolean(existing) });
}
