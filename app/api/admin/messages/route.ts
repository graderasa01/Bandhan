import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { previewAdminMessage, sendAdminMessage } from "@/lib/services/adminMessage/adminMessageService";
import { PLAN_FEATURE_KEYS } from "@/lib/constants/plans";
import type { CapabilityKey } from "@/lib/services/plans/entitlementOverrides";

export const runtime = "nodejs";
/** A broadcast walks its recipient list one at a time and talks to real providers. */
export const maxDuration = 120;

const OfferSchema = z
  .object({
    planCode: z.string().trim().min(2).max(24).optional(),
    capabilityKey: z.string().optional(),
    value: z.union([z.boolean(), z.number(), z.null()]).optional(),
    days: z.number().int().min(1).max(365).nullable().optional(),
  })
  .refine((o) => Boolean(o.planCode) !== Boolean(o.capabilityKey), {
    message: "Ya to plan chuniye, ya ek capability — dono ek saath nahi.",
  })
  .refine((o) => !o.capabilityKey || PLAN_FEATURE_KEYS.includes(o.capabilityKey as CapabilityKey), {
    message: "Aisi koi capability nahi hai.",
  });

const BodySchema = z.object({
  /** `preview` never sends; it only counts. The UI must call it before send. */
  mode: z.enum(["preview", "send"]),
  audience: z.enum(["USER", "PARTNER"]),
  target: z.enum(["SINGLE", "SEGMENT", "ALL"]),
  targetUserId: z.string().optional().nullable(),
  segmentKey: z.string().optional().nullable(),
  title: z.string().trim().min(1, "Title likhiye.").max(120),
  body: z.string().trim().min(1, "Message likhiye.").max(1000),
  href: z.string().trim().max(300).optional().nullable(),
  channels: z.array(z.enum(["APP", "EMAIL", "WHATSAPP"])).min(1, "Kam se kam ek channel chuniye."),
  offerGrant: OfferSchema.optional().nullable(),
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

  const { mode, ...input } = parsed.data;
  const payload = {
    ...input,
    offerGrant: input.offerGrant
      ? {
          planCode: input.offerGrant.planCode,
          capabilityKey: input.offerGrant.capabilityKey as CapabilityKey | undefined,
          value: input.offerGrant.value,
          days: input.offerGrant.days ?? null,
        }
      : null,
  };

  if (mode === "preview") {
    const result = await previewAdminMessage(payload);
    if (!result.ok) {
      return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
    }
    return NextResponse.json(result);
  }

  const result = await sendAdminMessage(payload, { id: user.id, role: user.role });
  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }
  return NextResponse.json(result, { status: 201 });
}
