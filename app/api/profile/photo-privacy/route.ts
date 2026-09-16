import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { getPhotoPrivacy, setPhotoPrivacy } from "@/lib/services/profile/photoPrivacyService";
import { getT } from "@/lib/i18n/server";

export const runtime = "nodejs";

/**
 * The owner's photo choice — MEMBERS or MATCH_ONLY. Owner-only in both
 * directions and never plan-gated; see `photoPrivacyService`.
 */

const BodySchema = z.object({ value: z.enum(["MEMBERS", "MATCH_ONLY"]) });

export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;
  return NextResponse.json({ ok: true, value: await getPhotoPrivacy(user.id) });
}

export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "Invalid request." }, { status: 422 });
  }

  const t = await getT();
  const result = await setPhotoPrivacy(user.id, parsed.data.value, t);
  if (!result.ok) return NextResponse.json({ ok: false, message: result.message }, { status: 404 });
  return NextResponse.json({ ok: true, value: result.value });
}
