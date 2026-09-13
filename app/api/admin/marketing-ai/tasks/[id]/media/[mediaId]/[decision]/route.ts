import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { reviewCreativeMedia } from "@/lib/services/marketing/creativeMediaService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ note: z.string().trim().max(300).optional() }).strict();

/**
 * "Approve image for Meta Ads" / reject (doc 14 §8). A separate decision
 * from the package approval, by a named admin, on one file. Approving a
 * replacement voids any pending Meta create card for the task — the
 * service does that; this route only names the decision.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string; mediaId: string; decision: string }> }) {
  const { user, response } = await requireAdmin();
  if (!user) return response;
  const { id, mediaId, decision } = await params;
  if (decision !== "approve" && decision !== "reject") return NextResponse.json({ error: "NOT_FOUND", message: "Aisa koi decision nahi hai." }, { status: 404 });

  let note: string | null = null;
  const text = await req.text().catch(() => "");
  if (text.trim()) {
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: "BAD_REQUEST", message: "Request JSON padha nahi ja saka." }, { status: 400 });
    }
    const parsed = Body.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: "VALIDATION_FAILED", message: parsed.error.issues[0]?.message ?? "Input valid nahi hai." }, { status: 422 });
    note = parsed.data.note ?? null;
  }

  const result = await reviewCreativeMedia({ mediaId, taskId: id, decision: decision === "approve" ? "APPROVE" : "REJECT", note, actorId: user.id, actorRole: user.role });
  if (!result.ok) return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  return NextResponse.json({ ok: true, media: result.media });
}
