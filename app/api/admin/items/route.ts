import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { upsertItem } from "@/lib/services/items/itemAdminService";
import { rupeesToPaise } from "@/lib/utils/money";

export const runtime = "nodejs";

/**
 * Create or edit one à-la-carte item.
 *
 * One endpoint rather than POST-create plus PATCH-update, because a built-in
 * item has no row until its first edit — see `upsertItem`. The config arrives
 * as a free-form object and is validated against the kind server-side; the
 * client's own validation is a convenience, never the boundary.
 */
const BodySchema = z.object({
  code: z.string().trim().min(2).max(40),
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().min(4).max(300),
  priceRupees: z.number().min(0),
  kind: z.enum(["ENTITLEMENT_WINDOW", "SPOTLIGHT_CAMPAIGN", "AI_DELIVERABLE"]),
  config: z.record(z.string(), z.unknown()),
  isActive: z.boolean(),
  isPublic: z.boolean(),
  displayOrder: z.number().int().min(0).max(999),
});

export async function POST(req: Request) {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = BodySchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_FAILED", message: parsed.error.issues[0]?.message ?? "Form sahi se bharein." },
      { status: 422 },
    );
  }

  const result = await upsertItem({
    code: parsed.data.code,
    name: parsed.data.name,
    description: parsed.data.description,
    priceInPaise: rupeesToPaise(parsed.data.priceRupees),
    kind: parsed.data.kind,
    config: parsed.data.config,
    isActive: parsed.data.isActive,
    isPublic: parsed.data.isPublic,
    displayOrder: parsed.data.displayOrder,
    actorId: user.id,
    actorRole: user.role,
  });

  if (!result.ok) {
    return NextResponse.json({ error: "REJECTED", message: result.message }, { status: result.status });
  }
  return NextResponse.json({ ok: true, code: result.code });
}
