import { NextResponse } from "next/server";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import {
  NOTE_MAX,
  deleteOwnPhoto,
  setPhotoFocalY,
  setPhotoInReel,
  setPhotoNote,
  setPrimaryPhoto,
} from "@/lib/services/profile/photoSlides";
import { getT } from "@/lib/i18n/server";

export const runtime = "nodejs";

const PatchSchema = z
  .object({
    note: z.string().max(NOTE_MAX + 40).nullable().optional(), // service does the real trim+length check; +40 just bounds payload size
    inReel: z.boolean().optional(),
    focalY: z.number().int().min(0).max(100).optional(),
    // Only `true` is accepted: "this one is the main photo" is a choice, but
    // "this one is no longer the main photo" is not — it would leave the
    // profile with no primary at all. Picking a different one is the way out.
    isPrimary: z.literal(true).optional(),
  })
  .refine(
    (v) => v.note !== undefined || v.inReel !== undefined || v.focalY !== undefined || v.isPrimary !== undefined,
    { message: "note, inReel, focalY ya isPrimary me se kam se kam ek chahiye." },
  );

/** Owner-only. Each field is applied independently so a note edit and a slide toggle never race each other's error. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const { id } = await params;

  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = PatchSchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_FAILED", message: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 422 },
    );
  }

  const t = await getT();

  if (parsed.data.note !== undefined) {
    const result = await setPhotoNote(user.id, id, parsed.data.note, t);
    if (!result.ok) return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }

  if (parsed.data.inReel !== undefined) {
    const result = await setPhotoInReel(user.id, id, parsed.data.inReel, t);
    if (!result.ok) return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }

  if (parsed.data.focalY !== undefined) {
    const result = await setPhotoFocalY(user.id, id, parsed.data.focalY, t);
    if (!result.ok) return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }

  if (parsed.data.isPrimary !== undefined) {
    const result = await setPrimaryPhoto(user.id, id, t);
    if (!result.ok) return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }

  return NextResponse.json({ ok: true });
}

/**
 * Owner removes one of their own photos.
 *
 * There was no way to do this at all before — six uploads was a one-way door,
 * and the only escape from a bad photo was to leave it up. `deleteOwnPhoto`
 * soft-deletes and repairs both invariants the removal can break (reel slot
 * ordering, and which photo is primary).
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const { id } = await params;

  const result = await deleteOwnPhoto(user.id, id, await getT());
  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
