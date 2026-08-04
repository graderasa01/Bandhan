import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { isFeatureKey } from "@/lib/constants/features";
import { updateFeatureFlag } from "@/lib/services/flags/featureFlagService";

export const runtime = "nodejs";

const BodySchema = z.object({
  rollout: z.enum(["OFF", "ALLOWLIST", "PLAN_GATED", "ALL"]),
  note: z.string().max(300).optional().nullable(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const { key } = await params;
  if (!isFeatureKey(key)) {
    return NextResponse.json({ ok: false, message: "Aisa koi feature nahi hai." }, { status: 404 });
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "Invalid request." }, { status: 422 });
  }

  await updateFeatureFlag({
    key,
    rollout: parsed.data.rollout,
    note: parsed.data.note ?? null,
    actorId: user.id,
    actorRole: user.role,
  });

  return NextResponse.json({ ok: true });
}
