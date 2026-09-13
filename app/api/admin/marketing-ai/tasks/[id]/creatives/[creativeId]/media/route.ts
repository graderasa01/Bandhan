import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { MEDIA_ACCEPTED_MIME, MEDIA_MAX_BYTES } from "@/lib/contracts/marketingExecution";
import { attachCreativeMedia } from "@/lib/services/marketing/creativeMediaService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * "Attach image" (doc 14 §8). Admin only, one file, scoped to one task and
 * one IMAGE creative. The request is bounded by `content-length` before the
 * body is read, and the file is bounded again after; the MIME claim is a
 * courtesy check only — what the file *decodes* as is decided in the
 * service, and that is what is stored.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string; creativeId: string }> }) {
  const { user, response } = await requireAdmin();
  if (!user) return response;
  const { id, creativeId } = await params;

  const declared = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MEDIA_MAX_BYTES + 64 * 1024) {
    return NextResponse.json({ error: "TOO_LARGE", message: `File ${Math.round(MEDIA_MAX_BYTES / 1024 / 1024)}MB se badi nahi ho sakti.` }, { status: 413 });
  }
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || !(file instanceof File)) return NextResponse.json({ error: "BAD_REQUEST", message: "Image file nahi mili (field 'file')." }, { status: 400 });
  if (file.size > MEDIA_MAX_BYTES) return NextResponse.json({ error: "TOO_LARGE", message: `File ${Math.round(MEDIA_MAX_BYTES / 1024 / 1024)}MB se badi nahi ho sakti.` }, { status: 413 });
  if (file.type && !(MEDIA_ACCEPTED_MIME as readonly string[]).includes(file.type)) {
    return NextResponse.json({ error: "UNSUPPORTED_FORMAT", message: "Sirf JPG, PNG ya WebP." }, { status: 422 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await attachCreativeMedia({ taskId: id, creativeAssetId: creativeId, buffer, actorId: user.id, actorRole: user.role });
  if (!result.ok) return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  return NextResponse.json({ ok: true, media: result.media, duplicate: result.duplicate }, { status: result.duplicate ? 200 : 201 });
}
