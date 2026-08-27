import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { createItemCheckout } from "@/lib/services/items/itemPurchaseService";
import { validateSpec } from "@/lib/services/spotlight/audience";
import { getT } from "@/lib/i18n/server";

export const runtime = "nodejs";

/**
 * Starts a one-off purchase. The sibling of /api/subscriptions/checkout, and
 * like it, grants nothing: it creates a CREATED payment and hands back a URL.
 * Access moves only when the webhook says the money moved.
 */
const BodySchema = z.object({
  // Validated against the live catalog inside `quoteItem` — an enum here would
  // silently reject any item an admin created.
  itemCode: z.string().trim().min(2).max(40),
  /**
   * Only a Spotlight pack carries one. Passed through loosely and validated
   * by `validateSpec`, which is the same function the estimate endpoint uses —
   * a quote and the purchase behind it must agree about what a legal spec is.
   */
  campaign: z
    .object({
      cities: z.array(z.string()).optional(),
      minAge: z.number().optional(),
      maxAge: z.number().optional(),
      targetGender: z.string().optional(),
    })
    .optional(),
});

export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "Invalid item." }, { status: 422 });
  }

  let campaign;
  if (parsed.data.campaign) {
    const spec = validateSpec(parsed.data.campaign);
    if (!spec.ok) return NextResponse.json({ ok: false, message: spec.message }, { status: 422 });
    campaign = spec.spec;
  }

  const t = await getT();
  const result = await createItemCheckout(user.id, parsed.data.itemCode.toUpperCase(), { campaign }, t);
  if (!result.ok) {
    return NextResponse.json({ ok: false, message: result.message }, { status: 422 });
  }

  return NextResponse.json({
    ok: true,
    checkoutUrl: result.checkoutUrl,
    itemName: result.item.name,
    isTest: result.isTest,
  });
}
