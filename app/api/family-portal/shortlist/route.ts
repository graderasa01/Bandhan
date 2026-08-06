import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFamilyMember } from "@/lib/auth/requireFamilyMember";
import { addFamilyShortlist, removeFamilyShortlist } from "@/lib/services/family/familyPortalActions";
import { parseJsonBody } from "@/app/api/_shared/responses";

export const runtime = "nodejs";

const BodySchema = z.object({ profileId: z.string().min(1) });

export async function POST(req: Request) {
  const { member, response } = await requireFamilyMember();
  if (!member) return response;

  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;
  const parsed = BodySchema.safeParse(jsonResult.body);
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_FAILED", message: "Profile chahiye." }, { status: 422 });

  const result = await addFamilyShortlist(member, parsed.data.profileId);
  if (!result.ok) return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { member, response } = await requireFamilyMember();
  if (!member) return response;

  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;
  const parsed = BodySchema.safeParse(jsonResult.body);
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_FAILED", message: "Profile chahiye." }, { status: 422 });

  const result = await removeFamilyShortlist(member, parsed.data.profileId);
  if (!result.ok) return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  return NextResponse.json({ ok: true });
}
