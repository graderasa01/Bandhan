// Real Prisma-backed pricing — shared by every marketing/subscription surface
// (home, /pricing, /user/subscription) so an /admin/pricing or /admin/items
// change shows up everywhere without another code change. Same precedent as
// lib/data/partnerData.ts: this domain is real now, mock/api toggle doesn't
// apply to it.
//
// D-90 (2026-09-15): what is sold is the Rishta Pass (a plan) and the Chat
// Unlock (an item). Both are read from their live catalogs here, and nothing
// on any pricing surface names a price or a limit this file did not read.
import { getAllPlans, getCommissionConfig } from "@/lib/services/plans/planService";
import { getPlanCatalog, planFeaturesOf } from "@/lib/services/plans/planCatalog";
import { resolveOffers } from "@/lib/services/plans/planOfferService";
import { getItemCatalog, itemOf } from "@/lib/services/items/itemCatalog";
import {
  CHAT_UNLOCK_ITEM_CODE,
  NO_REPLY_CAP_WINDOW_DAYS,
  NO_REPLY_CREDIT_CAP,
} from "@/lib/services/chat/chatUnlockService";
import { getRollout, resolveAccess } from "@/lib/services/flags/featureFlagService";
import { NO_REPLY_GUARANTEE_HOURS } from "@/lib/contracts/chatUnlock";
import type { PlanFeatureSet } from "@/lib/constants/plans";
import { paiseToRupees, paiseToRupeeDisplay } from "@/lib/utils/money";
import { applyBps, bpsToPercentDisplay } from "@/lib/partner/tier";
import type {
  PartnerEarningsViewModel,
  PlanPreviewViewModel,
  PricingPageViewModel,
} from "@/lib/contracts/publicPages";
import { noopT, type Translate } from "@/lib/i18n/translate";

function rupees(paise: number): string {
  return `₹${paiseToRupees(paise).toLocaleString("en-IN")}`;
}

/**
 * Every plan on sale — active, public and paid. Since D-90 that is the Rishta
 * Pass; the retired tiers are private, so they never reach a buy card.
 */
export async function getPlanPreviews(t: Translate = noopT): Promise<PlanPreviewViewModel[]> {
  const plans = await getAllPlans(t);

  // Resolved once for the whole catalog and applied here rather than in each
  // page, because this function is the single source every pricing surface
  // reads. An offer added in one of them and not the others is exactly the
  // drift this file exists to prevent.
  const offers = await resolveOffers(new Map(plans.map((p) => [p.code, p.priceInPaise])));

  return plans
    .filter((p) => p.code !== "FREE" && p.isActive && p.isPublic)
    .map((p) => {
      const listRupees = paiseToRupees(p.priceInPaise);
      const listDisplay = `₹${listRupees.toLocaleString("en-IN")}`;
      const offer = offers.get(p.code) ?? null;
      const payRupees = offer ? paiseToRupees(offer.priceAfterPaise) : listRupees;

      return {
        id: p.code.toLowerCase(),
        name: p.name,
        price: { amount: payRupees, currency: "INR", display: `₹${payRupees.toLocaleString("en-IN")}` },
        originalPrice: offer ? { amount: listRupees, currency: "INR", display: listDisplay } : undefined,
        offer: offer ? { label: offer.label, endsAt: offer.endsAt.toISOString(), isFree: offer.isFree } : undefined,
        duration: p.durationLabel,
        features: p.featureBullets,
        // One plan on sale has nothing to be "most popular" against.
        isRecommended: false,
      } satisfies PlanPreviewViewModel;
    });
}

/**
 * The Chat Unlock as a pricing page quotes it — its live price and the live
 * numbers of its no-reply refund rule — or null when it is not on sale.
 */
export async function getChatUnlockOffer(): Promise<PricingPageViewModel["chatUnlock"]> {
  const item = itemOf(await getItemCatalog(), CHAT_UNLOCK_ITEM_CODE);
  if (!item || !item.isActive || !item.isPublic || !item.configValid || item.priceInPaise <= 0) return null;
  return {
    priceDisplay: rupees(item.priceInPaise),
    guaranteeHours: NO_REPLY_GUARANTEE_HOURS,
    refundCap: NO_REPLY_CREDIT_CAP,
    refundWindowDays: NO_REPLY_CAP_WINDOW_DAYS,
  };
}

/**
 * What FREE includes, one honest line each, built from a feature set — so an
 * admin who moves a number moves it on the pricing page too, and a capability
 * FREE does not have simply produces no line.
 *
 * `open` carries the two features an admin can still hold back by rollout
 * (Grio, Advanced Search): a plan flag alone is not a promise when the feature
 * itself is switched off.
 */
export function freePlanLines(
  f: PlanFeatureSet,
  t: Translate = noopT,
  open: { grio: boolean; search: boolean } = { grio: true, search: true },
): string[] {
  const lines: string[] = [
    // D-91: no number here on purpose. The reel runs until the pool does, so
    // any figure would be smaller than the truth — and this list is the one
    // the pricing page prints verbatim.
    t("pricing.free.reelUnlimited", "Jitne rishtey aapse match karte hain — sab, bina roz ki limit ke"),
    f.interestsPerMonth === null
      ? t("pricing.free.interestUnlimited", "Jitne chahein interest bhejein")
      : `${f.interestsPerMonth} ${t("pricing.free.interestSuffix", "interest har mahine bhej sakte hain")}`,
    t("pricing.free.interestsReceived", "Aane wale interest kitne bhi — unka kabhi paisa nahi"),
  ];
  if (f.advancedDiscovery && open.search) {
    lines.push(t("pricing.free.search", "Advanced Search — apne filters se dhoondhein"));
  }
  // Photo reciprocity is not a plan capability — any live member with an
  // approved photo of their own sees other members' photos (photoAccess.ts).
  lines.push(t("pricing.free.photos", "Apni photo lagayein, doosron ki photo dekhein"));
  if (f.voiceUnlock) lines.push(t("pricing.free.voice", "Aayi hui voice note sunna"));
  if (f.admirerIdentity) lines.push(t("pricing.free.admirers", "Kisne shortlist kiya — naam ke saath"));
  // Guna milan is free on every plan; only the PDF is a plan capability.
  lines.push(
    f.kundliPdfExport
      ? t("pricing.free.kundli", "Kundli, guna milan aur kundli PDF")
      : t("pricing.free.kundliNoPdf", "Kundli aur guna milan"),
  );
  if (f.familySeats > 0) {
    lines.push(`${f.familySeats} ${t("pricing.free.familySuffix", "ghar walon ko jod sakte hain")}`);
  }
  if (f.deepDimensions >= 13) lines.push(t("pricing.free.deepProfile", "Deep Profile ki saari 13 dimensions"));
  if (open.grio) {
    lines.push(
      f.grioChatPerDay === null
        ? t("pricing.free.grioUnlimited", "Grio se jitne chahein sawaal")
        : `${t("pricing.free.grioPrefix", "Grio se roz")} ${f.grioChatPerDay} ${t("pricing.free.grioSuffix", "sawaal")}`,
    );
    // Spoken turns draw on the same daily count as typed ones, so this line
    // promises no number the one above has not already stated.
    if (f.grioVoice) lines.push(t("pricing.free.grioVoice", "Grio se bol kar baat — usi ginti me"));
  }
  // Only the self-serve checks — they cost nothing. The requestable ones
  // (identity, education, …) carry a fee, so "verification is free" in
  // general would not be true.
  lines.push(t("pricing.free.verification", "Mobile, email aur photo verification"));
  return lines;
}

/**
 * The FREE list as every pricing surface prints it: the live FREE plan, plus
 * the live rollout of Grio and Advanced Search for a member with no override —
 * i.e. what someone who signs up today can actually use.
 */
export async function getFreeList(t: Translate = noopT): Promise<string[]> {
  const [catalog, grioRollout, searchRollout] = await Promise.all([
    getPlanCatalog(),
    getRollout("aiConcierge"),
    getRollout("advancedDiscovery"),
  ]);
  return freePlanLines(planFeaturesOf(catalog, "FREE"), t, {
    grio: resolveAccess(grioRollout, false) !== "closed",
    search: resolveAccess(searchRollout, false) !== "closed",
  });
}

/**
 * D-12 commission text, formatted for display copy (partner program). Names the
 * Gold rate as the ceiling rather than quoting only the base — "10%" alone
 * would undersell the programme, and "up to 15%" alone would oversell it, so
 * both ends are said in one line.
 */
export async function getCommissionDisplayText(t: Translate = noopT): Promise<string> {
  const config = await getCommissionConfig();
  const base = bpsToPercentDisplay(config.baseBps);
  const top = bpsToPercentDisplay(config.baseBps + config.goldBonusBps);
  const prefix = t("plan.commission.prefixAny", "Aapke parivaaron ke Chat Unlock aur Rishta Pass par");
  const suffix = t("plan.commission.suffixAny", "— har renewal par bhi");
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
  const amount = paiseToRupees(paise);
  const decimals = Number.isInteger(amount) ? 0 : 2;
  return `₹${amount.toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

/**
 * D-12 earnings illustration for the home page's partner section.
 *
 * Commission is a percentage of what a referred member actually paid, uniform
 * across everything they buy (D-12 as revised 2026-08-06, extended to items by
 * D-90). The card's headline is the Rishta Pass — a member's one recurring
 * spend — and the rows underneath list every thing on sale: the Chat Unlock and
 * the Pass. Every figure comes from a live price and the live rate.
 *
 * Returns null when nothing is sellable — an empty catalogue has no honest
 * number to show, and "₹0 har mahine" is worse than no card at all.
 */
export async function getPartnerEarningsPreview(
  t: Translate = noopT,
): Promise<PartnerEarningsViewModel | null> {
  const [plans, config, items] = await Promise.all([getAllPlans(t), getCommissionConfig(), getItemCatalog()]);

  const sellablePlans = plans
    .filter((p) => p.code !== "FREE" && p.isActive && p.isPublic && p.priceInPaise > 0)
    .sort((a, b) => a.priceInPaise - b.priceInPaise);
  const unlock = itemOf(items, CHAT_UNLOCK_ITEM_CODE);
  const sellableUnlock =
    unlock && unlock.isActive && unlock.isPublic && unlock.configValid && unlock.priceInPaise > 0 ? unlock : null;

  const rows: { name: string; pricePaise: number }[] = [
    ...(sellableUnlock ? [{ name: sellableUnlock.name, pricePaise: sellableUnlock.priceInPaise }] : []),
    ...sellablePlans.map((p) => ({ name: p.name, pricePaise: p.priceInPaise })),
  ];
  if (rows.length === 0) return null;

  const headlinePlan = sellablePlans.find((p) => p.code === "PASS") ?? sellablePlans[0] ?? null;
  const headline = headlinePlan
    ? { name: headlinePlan.name, pricePaise: headlinePlan.priceInPaise }
    : { name: sellableUnlock!.name, pricePaise: sellableUnlock!.priceInPaise };
  const headlinePaise = applyBps(headline.pricePaise, config.baseBps);
  const headlineRupees = paiseToRupees(headlinePaise);

  const base = bpsToPercentDisplay(config.baseBps);
  const top = bpsToPercentDisplay(config.baseBps + config.goldBonusBps);
  const goldPart =
    top === base
      ? ""
      : ` — ${t("plan.partnerEarnings.goldPrefix", "Gold partner ko")} ${top} ${t("plan.partnerEarnings.goldSuffix", "tak")}`;

  return {
    rateDisplay: base,
    headlinePlanName: headline.name,
    headlineRupees,
    headlineDecimals: Number.isInteger(headlineRupees) ? 0 : 2,
    headlineDisplay: rupeeAmountDisplay(headlinePaise),
    basisLine: `${headline.name} ${t("plan.partnerEarnings.basisMidAny", "par")} ${base} ${t("plan.partnerEarnings.basisTrail", "commission")}`,
    perPlan: rows.map((r) => ({
      name: r.name,
      priceDisplay: paiseToRupeeDisplay(r.pricePaise),
      commissionDisplay: rupeeAmountDisplay(applyBps(r.pricePaise, config.baseBps)),
    })),
    note:
      `${t("plan.partnerEarnings.notePrefixAny", "Aapke code se aaye parivaar ke Chat Unlock aur Rishta Pass par")} ${base} ${t(
        "plan.partnerEarnings.noteSuffixAny",
        "commission — har renewal par bhi",
      )}${goldPart}. ` +
      t("plan.partnerEarnings.welcomeLine", "Aur un parivaaron ki pehli baatcheet free khulti hai."),
  };
}
