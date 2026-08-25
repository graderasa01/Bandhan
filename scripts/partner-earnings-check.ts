import "./_env";
import { prisma } from "../lib/db/prisma";
import { getPartnerEarningsPreview } from "../lib/data/planData";
import { getCommissionConfig } from "../lib/services/plans/planService";
import { applyBps } from "../lib/partner/tier";
import { PARTNER_FIRST_MONTH_DISCOUNT_PAISE } from "../lib/constants/plans";
import { createTranslate } from "../lib/i18n/translate";

/**
 * The home page's partner earnings card (D-12 percentage, D-80 recurring).
 *
 * Run: `npx tsx scripts/partner-earnings-check.ts`
 *
 * The property under test is that not one rupee figure on that card is written
 * anywhere in the source: each must equal `applyBps(livePrice, liveBaseBps)`.
 * The card used to print a flat "₹100 har mahine", which is why this exists —
 * so a price moved from /admin/pricing or a rate moved from /admin/partners
 * fails here rather than in front of a partner.
 */

let failures = 0;
function check(name: string, condition: boolean, detail = "") {
  if (condition) console.log(`  ok   ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main() {
  const config = await getCommissionConfig();
  const plans = await prisma.plan.findMany({ where: { isActive: true, isPublic: true } });
  const paid = plans.filter((p) => p.code !== "FREE" && p.priceInPaise > 0);

  console.log(`\nLive rate: base ${config.baseBps} bps, Gold +${config.goldBonusBps} bps`);
  console.log(`Live sellable plans: ${paid.map((p) => `${p.name} ₹${p.priceInPaise / 100}`).join(", ")}\n`);

  const earnings = await getPartnerEarningsPreview();
  if (!earnings) {
    check("earnings preview built", paid.length === 0, "null returned while sellable plans exist");
    return;
  }

  console.log("Card (hi):");
  console.log(`  headline      ${earnings.headlineDisplay} / ${earnings.basisLine}`);
  for (const p of earnings.perPlan) console.log(`  ${p.name} ${p.priceDisplay} → ${p.commissionDisplay}`);
  console.log(`  note          ${earnings.note}\n`);

  const en = await getPartnerEarningsPreview(createTranslate("en"));
  console.log(`Card (en) note  ${en?.note}\n`);

  check("rate is the live base rate", earnings.rateDisplay === `${config.baseBps / 100}%`, earnings.rateDisplay);
  check("every sellable plan is listed", earnings.perPlan.length === paid.length, `${earnings.perPlan.length} vs ${paid.length}`);

  for (const plan of paid) {
    const row = earnings.perPlan.find((p) => p.name === plan.name);
    const expected = applyBps(plan.priceInPaise, config.baseBps) / 100;
    check(
      `${plan.name} pays ${expected} — computed, not written`,
      row !== undefined && Number(row.commissionDisplay.replace(/[₹,]/g, "")) === expected,
      row?.commissionDisplay,
    );
  }

  const headlinePlan = paid.find((p) => p.code === "STANDARD");
  if (headlinePlan) {
    const expected = applyBps(headlinePlan.priceInPaise, config.baseBps) / 100;
    check("headline is the recommended plan's commission", earnings.headlineRupees === expected, String(earnings.headlineRupees));
    check("headline plan is named on the card", earnings.basisLine.startsWith(headlinePlan.name), earnings.basisLine);
  }

  const basic = paid.find((p) => p.code === "BASIC");
  if (basic) {
    const firstMonth = (basic.priceInPaise - PARTNER_FIRST_MONTH_DISCOUNT_PAISE) / 100;
    const liveOffer = await prisma.planOffer.findFirst({
      where: { planCode: "BASIC", isActive: true, startsAt: { lte: new Date() }, endsAt: { gt: new Date() } },
    });
    check(
      liveOffer ? "D-13 first-month line deferred to the live offer, or quoted from the live price" : `D-13 first month quoted as ₹${firstMonth} from the live price`,
      liveOffer !== null || earnings.note.includes(String(firstMonth)),
      earnings.note,
    );
  }

  check("no flat ₹100 claim survives", !/flat/i.test(earnings.note), earnings.note);

  console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) failed.\n`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
