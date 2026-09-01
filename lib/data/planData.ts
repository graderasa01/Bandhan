// Real Prisma-backed plan pricing — shared by every marketing/subscription
// surface (home, /pricing, /user/subscription) so an /admin/pricing change
// shows up everywhere without another code change. Same precedent as
// lib/data/partnerData.ts: this domain is real now, mock/api toggle doesn't
// apply to it.
import { getAllPlans, getCommissionConfig } from "@/lib/services/plans/planService";
import { resolveOffers } from "@/lib/services/plans/planOfferService";
import { PARTNER_FIRST_MONTH_DISCOUNT_PAISE } from "@/lib/constants/plans";
import { paiseToRupees, paiseToRupeeDisplay } from "@/lib/utils/money";
import { applyBps, bpsToPercentDisplay } from "@/lib/partner/tier";
import type { PartnerEarningsViewModel, PlanPreviewViewModel } from "@/lib/contracts/publicPages";
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

/**
 * ₹200 / ₹199.90 — paise shown only when there are any, and never as a lone
 * "₹199.9". `toLocaleString` drops a trailing zero on its own, which reads as
 * a typo on a money figure, so the fraction digits are pinned both ways.
 */
function rupeeAmountDisplay(paise: number): string {
  const rupees = paiseToRupees(paise);
  const decimals = Number.isInteger(rupees) ? 0 : 2;
  return `₹${rupees.toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

/**
 * D-12 earnings illustration for the home page's partner section.
 *
 * Commission is a percentage of what the member actually paid, uniform across
 * plans (D-12 as revised 2026-08-06), so there is no single rupee figure that
 * is true for every plan — the card names the plan its headline is computed on
 * and lists the rest underneath. Both halves come from the live catalogue and
 * the live rate; the section printed a hardcoded "flat ₹100" before this, which
 * was a number the payout ledger had stopped producing.
 *
 * Returns null when nothing is sellable — an empty catalogue has no honest
 * number to show, and "₹0 har mahine" is worse than no card at all.
 */
export async function getPartnerEarningsPreview(
  t: Translate = noopT,
): Promise<PartnerEarningsViewModel | null> {
  const [plans, config] = await Promise.all([getAllPlans(t), getCommissionConfig()]);

  const sellable = plans
    .filter((p) => p.code !== "FREE" && p.isActive && p.isPublic && p.priceInPaise > 0)
    .sort((a, b) => a.priceInPaise - b.priceInPaise);
  if (sellable.length === 0) return null;

  /*
   * The headline quotes the recommended plan — the same one `getPlanPreviews`
   * marks `isRecommended` — rather than the cheapest or the dearest: the
   * cheapest undersells the programme and the dearest oversells it, and the
   * month rows below have to repeat one plan's number, not a range. Median is
   * the fallback for a catalogue an admin has rebuilt without a STANDARD.
   */
  const headlinePlan =
    sellable.find((p) => p.code === "STANDARD") ?? sellable[Math.floor((sellable.length - 1) / 2)];
  const headlinePaise = applyBps(headlinePlan.priceInPaise, config.baseBps);
  const headlineRupees = paiseToRupees(headlinePaise);

  const base = bpsToPercentDisplay(config.baseBps);
  const top = bpsToPercentDisplay(config.baseBps + config.goldBonusBps);

  /*
   * The first-month line is suppressed when a live admin offer already beats
   * the D-13 discount — the same rule, and the same reason, as the pricing
   * card's `offerBeatsPartner`: two sections of one page must not quote the
   * referred user two different prices.
   */
  const basic = sellable.find((p) => p.code === "BASIC");
  let firstMonthPart = "";
  if (basic) {
    const offer = (await resolveOffers(new Map([[basic.code, basic.priceInPaise]]))).get(basic.code);
    if (!offer || offer.discountPaise < PARTNER_FIRST_MONTH_DISCOUNT_PAISE) {
      const firstMonth = rupeeAmountDisplay(basic.priceInPaise - PARTNER_FIRST_MONTH_DISCOUNT_PAISE);
      firstMonthPart = ` ${t(
        "plan.partnerEarnings.firstMonthPrefix",
        "Aur aapke refer kiye user ko pehla mahina sirf",
      )} ${firstMonth}.`;
    }
  }

  const goldPart =
    top === base
      ? ""
      : ` — ${t("plan.partnerEarnings.goldPrefix", "Gold partner ko")} ${top} ${t(
          "plan.partnerEarnings.goldSuffix",
          "tak",
        )}`;

  return {
    rateDisplay: base,
    headlinePlanName: headlinePlan.name,
    headlineRupees,
    headlineDecimals: Number.isInteger(headlineRupees) ? 0 : 2,
    headlineDisplay: rupeeAmountDisplay(headlinePaise),
    basisLine: `${headlinePlan.name} ${t(
      "plan.partnerEarnings.basisMid",
      "plan par",
    )} ${base} ${t("plan.partnerEarnings.basisTrail", "commission")}`,
    perPlan: sellable.map((p) => ({
      name: p.name,
      priceDisplay: paiseToRupeeDisplay(p.priceInPaise),
      commissionDisplay: rupeeAmountDisplay(applyBps(p.priceInPaise, config.baseBps)),
    })),
    note:
      `${t("plan.partnerEarnings.notePrefix", "Commission plan ki price ka")} ${base} ${t(
        "plan.partnerEarnings.noteSuffix",
        "hai",
      )}${goldPart}.` + firstMonthPart,
  };
}
