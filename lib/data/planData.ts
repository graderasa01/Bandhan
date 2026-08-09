// Real Prisma-backed plan pricing — shared by every marketing/subscription
// surface (home, /pricing, /user/subscription) so an /admin/pricing change
// shows up everywhere without another code change. Same precedent as
// lib/data/partnerData.ts: this domain is real now, mock/api toggle doesn't
// apply to it.
import { getAllPlans, getCommissionConfig } from "@/lib/services/plans/planService";
import { PARTNER_FIRST_MONTH_DISCOUNT_PAISE } from "@/lib/constants/plans";
import { paiseToRupees } from "@/lib/utils/money";
import { bpsToPercentDisplay } from "@/lib/partner/tier";
import type { PlanPreviewViewModel } from "@/lib/contracts/publicPages";
import { noopT, type Translate } from "@/lib/i18n/translate";

/** FREE is intentionally excluded — it's the default, not something to "choose". */
export async function getPlanPreviews(t: Translate = noopT): Promise<PlanPreviewViewModel[]> {
  const plans = await getAllPlans(t);

  return plans
    .filter((p) => p.code !== "FREE" && p.isActive)
    .map((p) => {
      const priceRupees = paiseToRupees(p.priceInPaise);
      // The plan's resolved feature set, already merged by getAllPlans().
      const features = p.features;
      const isBasic = p.code === "BASIC";

      const priceDisplay = `₹${priceRupees.toLocaleString("en-IN")}`;

      return {
        id: p.code.toLowerCase(),
        name: p.name,
        price: { amount: priceRupees, currency: "INR", display: priceDisplay },
        duration: p.durationLabel,
        // `getAllPlans` already resolved the admin-tunable reel count, so this
        // reads the live number rather than the ladder default.
        features: p.featureBullets,
        limitations: features.boost ? undefined : [t("plan.limitations.noBoost", "Profile boost nahi")],
        isRecommended: p.code === "STANDARD",
        // D-13: ₹500 off Basic, first month only. Both lines are emitted
        // together — the discounted price alone is a dark pattern (D-13).
        // Derived from the live price so it can't drift if Basic changes.
        partnerOffer: isBasic
          ? {
              firstMonth: `${t("plan.partnerOffer.firstMonthPrefix", "Partner code se pehla mahina sirf")} ₹${(
                priceRupees - PARTNER_FIRST_MONTH_DISCOUNT_PAISE / 100
              ).toLocaleString("en-IN")}`,
              thereafter: `${t("plan.partnerOffer.thereafterPrefix", "Uske baad")} ${priceDisplay}/month`,
            }
          : undefined,
      } satisfies PlanPreviewViewModel;
    });
}

/**
 * D-12 commission text, formatted for display copy (partner-program,
 * coming-soon cards). Names the Gold rate as the ceiling rather than quoting
 * only the base — "10%" alone would undersell the programme, and "up to 15%"
 * alone would oversell it, so both ends are said in one line.
 */
export async function getCommissionDisplayText(t: Translate = noopT): Promise<string> {
  const config = await getCommissionConfig();
  const base = bpsToPercentDisplay(config.baseBps);
  const top = bpsToPercentDisplay(config.baseBps + config.goldBonusBps);
  const prefix = t("plan.commission.prefix", "Har payment par");
  const suffix = t("plan.commission.suffix", "— har renewal par bhi");
  const goldPart =
    top === base
      ? ""
      : `, ${t("plan.commission.goldPrefix", "Gold partner ko")} ${top} ${t("plan.commission.goldSuffix", "tak")}`;
  return `${prefix} ${base}${goldPart} ${suffix}`;
}
