import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { setPhotoVerificationRequired } from "@/lib/services/verification/verificationSettingsService";

export const runtime = "nodejs";

const PatchSchema = z.object({
  photoVerificationRequired: z.boolean(),
});

export async function PATCH(req: Request) {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_FAILED", message: "Invalid request." }, { status: 422 });
  }

  const settings = await setPhotoVerificationRequired({
    required: parsed.data.photoVerificationRequired,
    actorId: user.id,
    actorRole: user.role,
  });

  return NextResponse.json({ ok: true, photoVerificationRequired: settings.photoVerificationRequired });
}
