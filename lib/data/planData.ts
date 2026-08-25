// Real Prisma-backed plan pricing — shared by every marketing/subscription
// surface (home, /pricing, /user/subscription) so an /admin/pricing change
// shows up everywhere without another code change. Same precedent as
// lib/data/partnerData.ts: this domain is real now, mock/api toggle doesn't
// apply to it.
import { getAllPlans, getCommissionConfig } from "@/lib/services/plans/planService";
import { resolveOffers } from "@/lib/services/plans/planOfferService";
import { PARTNER_FIRST_MONTH_DISCOUNT_PAISE } from "@/lib/constants/plans";
import { paiseToRupees } from "@/lib/utils/money";
import { bpsToPercentDisplay } from "@/lib/partner/tier";
import type { PlanPreviewViewModel } from "@/lib/contracts/publicPages";
import { noopT, type Translate } from "@/lib/i18n/translate";

/** FREE is intentionally excluded — it's the default, not something to "choose". */
export async function getPlanPreviews(t: Translate = noopT): Promise<PlanPreviewViewModel[]> {
  const plans = await getAllPlans(t);

  // Resolved once for the whole catalog and applied here rather than in each
  // page, because this function is already the single source every pricing
  // surface reads (see the file header). An offer added in one of them and not
  // the others is exactly the drift this file exists to prevent.
  const offers = await resolveOffers(new Map(plans.map((p) => [p.code, p.priceInPaise])));

  return plans
    .filter((p) => p.code !== "FREE" && p.isActive)
    .map((p) => {
      const listRupees = paiseToRupees(p.priceInPaise);
      // The plan's resolved feature set, already merged by getAllPlans().
      const features = p.features;
      const isBasic = p.code === "BASIC";

      const listDisplay = `₹${listRupees.toLocaleString("en-IN")}`;
      const offer = offers.get(p.code) ?? null;
      const payRupees = offer ? paiseToRupees(offer.priceAfterPaise) : listRupees;
      const payDisplay = `₹${payRupees.toLocaleString("en-IN")}`;

      /*
       * D-13 and an admin offer do not stack, and the better one wins — the
       * same rule `quoteCheckout` applies. Suppressing the partner lines when
       * an offer beats them is not cosmetic: leaving both on the card would
       * promise a first month at ₹499 that checkout is about to charge ₹0 or
       * ₹1,499 for, and the card is the thing the user believes.
       */
      const offerBeatsPartner =
        offer !== null && offer.discountPaise >= PARTNER_FIRST_MONTH_DISCOUNT_PAISE;

      return {
        id: p.code.toLowerCase(),
        name: p.name,
        price: { amount: payRupees, currency: "INR", display: payDisplay },
        originalPrice: offer ? { amount: listRupees, currency: "INR", display: listDisplay } : undefined,
        offer: offer
          ? { label: offer.label, endsAt: offer.endsAt.toISOString(), isFree: offer.isFree }
          : undefined,
        duration: p.durationLabel,
        // `getAllPlans` already resolved the admin-tunable reel count, so this
        // reads the live number rather than the ladder default.
        features: p.featureBullets,
        limitations: features.boost ? undefined : [t("plan.limitations.noBoost", "Profile boost nahi")],
        isRecommended: p.code === "STANDARD",
        // D-13: ₹500 off Basic, first month only. Both lines are emitted
        // together — the discounted price alone is a dark pattern (D-13).
        // Derived from the live price so it can't drift if Basic changes.
        partnerOffer:
          isBasic && !offerBeatsPartner
            ? {
                firstMonth: `${t("plan.partnerOffer.firstMonthPrefix", "Partner code se pehla mahina sirf")} ₹${(
                  listRupees - PARTNER_FIRST_MONTH_DISCOUNT_PAISE / 100
                ).toLocaleString("en-IN")}`,
                thereafter: `${t("plan.partnerOffer.thereafterPrefix", "Uske baad")} ${listDisplay}/month`,
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
