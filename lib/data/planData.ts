// Real Prisma-backed plan pricing — shared by every marketing/subscription
// surface (home, /pricing, /user/subscription) so an /admin/pricing change
// shows up everywhere without another code change. Same precedent as
// lib/data/partnerData.ts: this domain is real now, mock/api toggle doesn't
// apply to it.
import { getAllPlans, getCommissionConfig } from "@/lib/services/plans/planService";
import { PLAN_FEATURES, planFeatureBullets, PARTNER_FIRST_MONTH_DISCOUNT_PAISE } from "@/lib/constants/plans";
import { paiseToRupees, paiseToRupeeDisplay } from "@/lib/utils/money";
import type { PlanPreviewViewModel } from "@/lib/contracts/publicPages";

/** FREE is intentionally excluded — it's the default, not something to "choose". */
export async function getPlanPreviews(): Promise<PlanPreviewViewModel[]> {
  const plans = await getAllPlans();

  return plans
    .filter((p) => p.code !== "FREE" && p.isActive)
    .map((p) => {
      const priceRupees = paiseToRupees(p.priceInPaise);
      const features = PLAN_FEATURES[p.code];
      const isBasic = p.code === "BASIC";

      const priceDisplay = `₹${priceRupees.toLocaleString("en-IN")}`;

      return {
        id: p.code.toLowerCase(),
        name: p.name,
        price: { amount: priceRupees, currency: "INR", display: priceDisplay },
        duration: p.durationLabel,
        features: planFeatureBullets(p.code),
        limitations: features.boost ? undefined : ["Profile boost nahi"],
        isRecommended: p.code === "STANDARD",
        // D-13: ₹500 off Basic, first month only. Both lines are emitted
        // together — the discounted price alone is a dark pattern (D-13).
        // Derived from the live price so it can't drift if Basic changes.
        partnerOffer: isBasic
          ? {
              firstMonth: `Partner code se pehla mahina sirf ₹${(
                priceRupees - PARTNER_FIRST_MONTH_DISCOUNT_PAISE / 100
              ).toLocaleString("en-IN")}`,
              thereafter: `Uske baad ${priceDisplay}/month`,
            }
          : undefined,
      } satisfies PlanPreviewViewModel;
    });
}

/** D-12 commission text, formatted for display copy (partner-program, coming-soon cards). */
export async function getCommissionDisplayText(): Promise<string> {
  const config = await getCommissionConfig();
  return `${paiseToRupeeDisplay(config.flatAmountPaise)} flat — har renewal par bhi`;
}
