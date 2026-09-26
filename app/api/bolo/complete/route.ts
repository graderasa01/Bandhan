import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { getCurrentUser, sessionTokenForNative } from "@/lib/auth/session";
import { postLoginPath } from "@/lib/auth/postLoginPath";
import { PASSWORD_MAX_LENGTH } from "@/lib/auth/passwordPolicy";
import { parseContact } from "@/lib/services/auth/contactOtpService";
import { completeGuestProfile, completeMemberProfile } from "@/lib/services/bolo/completeService";
import { checkRate, clientIp } from "@/lib/services/security/requestRateLimit";

export const runtime = "nodejs";

/**
 * `/bolo`'s one write, for its two kinds of caller:
 *
 *   - a guest → account + profile (+ live, when the minimum eight are in) +
 *     session, in one call (`completeGuestProfile`);
 *   - a signed-in member finishing an unfinished profile → the confirmed card
 *     onto the profile they already have (`completeMemberProfile`).
 *
 * Which one is read from the session, never from the body — a guest page left
 * open in a tab that has since logged in cannot mint a second account; it
 * finishes the profile of the account that is actually signed in. See
 * `completeService` for the rules; this file only parses and rate-limits.
 */
const BodySchema = z.object({
  fillingFor: z.string().optional(),
  values: z.record(z.string(), z.unknown()),
  contact: z.string().trim().min(3).max(120).optional(),
  accountName: z.string().trim().max(80).optional(),
  proof: z.string().optional(),
  /** Only for a contact no code can reach — the person's own, never generated. */
  password: z.string().max(PASSWORD_MAX_LENGTH).optional(),
});

const COMPLETES_PER_HOUR = { limit: 10, windowMs: 60 * 60 * 1000 };

export async function POST(req: Request) {
  const current = await getCurrentUser().catch(() => null);

  const rate = checkRate(current ? `bolo:complete:u:${current.id}` : `bolo:complete:${clientIp(req)}`, COMPLETES_PER_HOUR);
  if (!rate.ok) {
    return NextResponse.json(
      { ok: false, error: "RATE_LIMITED", message: "Thodi der baad try karein." },
      { status: 429, headers: { "retry-after": String(rate.retryAfterSeconds) } },
    );
  }

  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;
  const parsed = BodySchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "VALIDATION_FAILED", message: "Form sahi se bharein." }, { status: 422 });
  }

  if (current) {
    // A partner, admin or support account: this page is not their door, and a
    // member profile must never be written onto their account.
    if (current.role !== "USER") {
      return NextResponse.json(
        {
          ok: false,
          error: "WRONG_ACCOUNT",
          message: "Is account se member profile nahi banti.",
          landing: await postLoginPath(current),
        },
        { status: 409 },
      );
    }
    const result = await completeMemberProfile({
      user: current,
      fillingFor: parsed.data.fillingFor,
      values: parsed.data.values,
      req,
    });
    if (!result.ok) {
      const { status, ...body } = result;
      return NextResponse.json(body, { status });
    }
    return NextResponse.json(result);
  }

  const contact = parseContact(parsed.data.contact ?? "");
  if (!contact) {
    return NextResponse.json(
      { ok: false, error: "CONTACT_REQUIRED", message: "Valid 10-digit mobile number ya email daaliye." },
      { status: 422 },
    );
  }

  const result = await completeGuestProfile({
    fillingFor: parsed.data.fillingFor,
    values: parsed.data.values,
    accountName: parsed.data.accountName,
    contact,
    proof: parsed.data.proof,
    password: parsed.data.password,
    jar: await cookies(),
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  if (!result.ok) {
    const { status, ...body } = result;
    return NextResponse.json(body, { status });
  }
  // The new session travels as a cookie to a browser and in the body only to
  // the native app — never both, never the body to a page script.
  const { sessionToken, ...body } = result;
  return NextResponse.json({ ...body, ...(await sessionTokenForNative(sessionToken)) }, { status: 201 });
}
