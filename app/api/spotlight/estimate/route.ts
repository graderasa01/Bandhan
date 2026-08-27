import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { estimateCampaign, validateSpec } from "@/lib/services/spotlight/audience";
import { loadAdvertiserFacts } from "@/lib/services/spotlight/eligibility";
import { getItemCatalog, itemOf } from "@/lib/services/items/itemCatalog";
import type { SpotlightCampaignConfig } from "@/lib/constants/serviceItems";

export const runtime = "nodejs";

/**
 * "If I bought this pack with this targeting, what would actually happen?"
 *
 * Answered from the same query the delivery selector will use, so the number
 * the buyer sees before paying is the number the app can keep afterwards. It
 * writes nothing and grants nothing — it exists so that a pack the app cannot
 * deliver is refused on the buy screen rather than refunded a week later.
 */
const BodySchema = z.object({
  itemCode: z.string().trim().min(2).max(40),
  cities: z.array(z.string()).optional(),
  minAge: z.number(),
  maxAge: z.number(),
  targetGender: z.string(),
});

export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "Targeting sahi se bharein." }, { status: 422 });
  }

  const spec = validateSpec(parsed.data);
  if (!spec.ok) return NextResponse.json({ ok: false, message: spec.message }, { status: 422 });

  const item = itemOf(await getItemCatalog(), parsed.data.itemCode.toUpperCase());
  if (!item || item.kind !== "SPOTLIGHT_CAMPAIGN" || !item.isActive || !item.configValid) {
    return NextResponse.json({ ok: false, message: "Ye pack abhi available nahi hai." }, { status: 422 });
  }

  const advertiser = await loadAdvertiserFacts(user.id);
  if (!advertiser) {
    return NextResponse.json(
      { ok: false, message: "Apni umar aur gender profile me bharein — uske bina audience nahi nikalti." },
      { status: 422 },
    );
  }

  const config = item.config as SpotlightCampaignConfig;
  const estimate = await estimateCampaign(advertiser, spec.spec, config.reach, config.maxDays);

  return NextResponse.json({ ok: true, estimate, reach: config.reach, maxDays: config.maxDays });
}
