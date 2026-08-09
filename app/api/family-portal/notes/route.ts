import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFamilyMember } from "@/lib/auth/requireFamilyMember";
import { addFamilyNote } from "@/lib/services/family/familyPortalActions";
import { getT } from "@/lib/i18n/server";

export const runtime = "nodejs";

const BodySchema = z.object({ profileId: z.string().min(1), body: z.string().min(1).max(500) });

export async function POST(req: Request) {
  const { member, response } = await requireFamilyMember();
  if (!member) return response;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Request JSON padha nahi ja saka." }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_FAILED", message: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 422 },
    );
  }

  const t = await getT();
  const result = await addFamilyNote(member, parsed.data.profileId, parsed.data.body, t);
  if (!result.ok) return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  return NextResponse.json({ ok: true });
}
