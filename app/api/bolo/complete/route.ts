import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { getCurrentUser } from "@/lib/auth/session";
import { parseContact } from "@/lib/services/auth/contactOtpService";
import { completeGuestProfile } from "@/lib/services/bolo/completeService";
import { checkRate, clientIp } from "@/lib/services/security/requestRateLimit";

export const runtime = "nodejs";

/**
 * A guest's spoken/typed draft → account + profile (+ live, when the minimum
 * eight are in) + session, in one call. See `completeService` for the rules;
 * this file only parses and rate-limits.
 */
const BodySchema = z.object({
  fillingFor: z.string().optional(),
  values: z.record(z.string(), z.unknown()),
  contact: z.string().trim().min(3).max(120),
  accountName: z.string().trim().max(80).optional(),
  proof: z.string().optional(),
});

const COMPLETES_PER_IP = { limit: 10, windowMs: 60 * 60 * 1000 };

export async function POST(req: Request) {
  // Someone already signed in has a profile builder of their own; letting this
  // route create a *second* account for them would orphan the first.
  const current = await getCurrentUser().catch(() => null);
  if (current) {
    return NextResponse.json(
      { ok: false, error: "ALREADY_SIGNED_IN", message: "Aap pehle se login hain.", landing: "/profile/build" },
      { status: 409 },
    );
  }

  const rate = checkRate(`bolo:complete:${clientIp(req)}`, COMPLETES_PER_IP);
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

  const contact = parseContact(parsed.data.contact);
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
    jar: await cookies(),
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  if (!result.ok) {
    const { status, ...body } = result;
    return NextResponse.json(body, { status });
  }
  return NextResponse.json(result, { status: 201 });
}
