import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { attachAnswerVoiceNote } from "@/lib/services/vibe/sochBoardService";
import { getT } from "@/lib/i18n/server";

export const runtime = "nodejs";

const BodySchema = z.object({ mediaId: z.string().min(1) });

export async function PATCH(req: Request, { params }: { params: Promise<{ pollId: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const { pollId } = await params;
  const t = await getT();

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "Recording chahiye." }, { status: 422 });
  }

  const result = await attachAnswerVoiceNote(user.id, pollId, parsed.data.mediaId, t);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error, message: result.message }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
