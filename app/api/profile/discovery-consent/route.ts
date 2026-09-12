import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { requireUser } from "@/lib/auth/requireUser";
import { getDiscoveryConsent, setDiscoveryConsent } from "@/lib/services/discovery/discoveryConsentService";

export const runtime = "nodejs";

/**
 * "Kya mujhe religion / caste / gotra / manglik / income se dhoondha ja sakta
 * hai?" — the owner's five switches for Advanced Discovery's sensitive
 * filters. Owner-only in both directions (the userId is the session's), no
 * plan check: consent to be *found* is not a paid feature, and gating it would
 * mean a FREE member could never take a sensitive field back out of search.
 *
 * Same shape as `/api/profile/incognito`: a plain boolean per field, the
 * service owns the row.
 */

const BodySchema = z
  .object({
    religion: z.boolean().optional(),
    caste: z.boolean().optional(),
    gotra: z.boolean().optional(),
    manglik: z.boolean().optional(),
    income: z.boolean().optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, { message: "Koi switch nahi badla." });

export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;

  const view = await getDiscoveryConsent(user.id);
  if (!view) return NextResponse.json({ ok: false, message: "Pehle apni profile banaiye." }, { status: 404 });
  return NextResponse.json({ ok: true, ...view });
}

export async function PUT(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = BodySchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: parsed.error.issues[0]?.message ?? "Value valid nahi hai." }, { status: 422 });
  }

  const result = await setDiscoveryConsent(user.id, parsed.data);
  if (!result.ok) return NextResponse.json({ ok: false, message: result.message }, { status: 404 });
  return NextResponse.json({ ok: true, consent: result.consent });
}
