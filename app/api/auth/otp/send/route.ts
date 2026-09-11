import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { findUserByContact, otpChannelStatus, parseContact, sendContactOtp } from "@/lib/services/auth/contactOtpService";
import { clientIp } from "@/lib/services/security/requestRateLimit";

export const runtime = "nodejs";

/**
 * Send a one-time code to a mobile or email that no session owns yet — the
 * bolo page's "ab bas aapka number" step and the login page's "OTP se login".
 *
 * Public by design; the brakes are inside `sendContactOtp` (per-contact and
 * per-IP hourly caps, a resend cooldown). The reply says whether an account
 * already exists on that contact — a matrimony sign-up is not a secret, and
 * "is number se account hai, login kar lijiye" is the honest thing to say
 * before someone re-answers eight questions for nothing.
 *
 * `not_configured` is a 200, not an error: for the caller it is a plain
 * fact about this deployment ("no SMS provider yet"), and the bolo flow
 * continues without verification exactly as `/register` does today.
 */
const BodySchema = z.object({
  contact: z.string().trim().min(3).max(120),
  /**
   * `login` refuses to send when no account owns the contact — a code to a
   * number that cannot log in is an SMS spent on a dead end, and the login
   * page would rather point that person at /bolo. The default (`signup`)
   * always sends: the bolo flow needs the code whether the number is new or
   * returning.
   */
  intent: z.enum(["signup", "login"]).optional().default("signup"),
});

export async function POST(req: Request) {
  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;
  const parsed = BodySchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid", message: "Mobile ya email daaliye." }, { status: 422 });
  }

  const contact = parseContact(parsed.data.contact);
  if (!contact) {
    return NextResponse.json(
      { ok: false, error: "invalid", message: "Valid 10-digit mobile number ya email daaliye." },
      { status: 422 },
    );
  }

  if (parsed.data.intent === "login" && !(await findUserByContact(contact))) {
    return NextResponse.json(
      { ok: false, error: "no_account", message: "Is mobile/email se koi account nahi hai.", kind: contact.kind },
      { status: 404 },
    );
  }

  const result = await sendContactOtp(contact, clientIp(req));
  if (!result.ok) {
    const status =
      result.error === "not_configured" ? 200 : result.error === "cooldown" || result.error === "rate_limited" ? 429 : 502;
    return NextResponse.json({ ...result, kind: contact.kind, channels: otpChannelStatus() }, { status });
  }
  return NextResponse.json({ ...result, kind: contact.kind });
}
