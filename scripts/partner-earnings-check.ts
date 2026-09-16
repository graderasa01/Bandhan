import "./_env";
import { prisma } from "../lib/db/prisma";
import { getPartnerEarningsPreview } from "../lib/data/planData";
import { getCommissionConfig } from "../lib/services/plans/planService";
import { getItemCatalog, itemOf } from "../lib/services/items/itemCatalog";
import { CHAT_UNLOCK_ITEM_CODE } from "../lib/services/chat/chatUnlockService";
import { applyBps } from "../lib/partner/tier";
import { createTranslate } from "../lib/i18n/translate";

/**
 * The home page's partner earnings card (D-12 percentage, D-80 recurring,
 * D-90: every member spend — the Chat Unlock and the Rishta Pass).
 *
 * Run: `npx tsx scripts/partner-earnings-check.ts`
 *
 * The property under test is that not one rupee figure on that card is written
 * anywhere in the source: each must equal `applyBps(livePrice, liveBaseBps)`.
 * The card used to print a flat "₹100 har mahine", and then a first-month
 * Basic discount that D-90 retired — which is why this exists, so a price moved
 * from /admin/pricing or a rate moved from /admin/partners fails here rather
 * than in front of a partner.
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
  const unlock = itemOf(await getItemCatalog(), CHAT_UNLOCK_ITEM_CODE);
  const unlockOnSale = Boolean(unlock && unlock.isActive && unlock.isPublic && unlock.priceInPaise > 0);

  console.log(`\nLive rate: base ${config.baseBps} bps, Gold +${config.goldBonusBps} bps`);
  console.log(`Live sellable plans: ${paid.map((p) => `${p.name} ₹${p.priceInPaise / 100}`).join(", ") || "none"}`);
  console.log(`Chat Unlock: ${unlockOnSale ? `₹${unlock!.priceInPaise / 100}` : "not on sale"}\n`);

  const earnings = await getPartnerEarningsPreview();
  if (!earnings) {
    check("earnings preview built", paid.length === 0 && !unlockOnSale, "null returned while something is on sale");
    return;
  }

  console.log("Card (hi):");
  console.log(`  headline      ${earnings.headlineDisplay} / ${earnings.basisLine}`);
  for (const p of earnings.perPlan) console.log(`  ${p.name} ${p.priceDisplay} → ${p.commissionDisplay}`);
  console.log(`  note          ${earnings.note}\n`);

  const en = await getPartnerEarningsPreview(createTranslate("en"));
  console.log(`Card (en) note  ${en?.note}\n`);

  check("rate is the live base rate", earnings.rateDisplay === `${config.baseBps / 100}%`, earnings.rateDisplay);
  check(
    "every thing on sale is listed — plans and the Chat Unlock",
    earnings.perPlan.length === paid.length + (unlockOnSale ? 1 : 0),
    `${earnings.perPlan.length} rows`,
  );

  for (const plan of paid) {
    const row = earnings.perPlan.find((p) => p.name === plan.name);
    const expected = applyBps(plan.priceInPaise, config.baseBps) / 100;
    check(
      `${plan.name} pays ${expected} — computed, not written`,
      row !== undefined && Number(row.commissionDisplay.replace(/[₹,]/g, "")) === expected,
      row?.commissionDisplay,
    );
  }

  if (unlockOnSale && unlock) {
    const row = earnings.perPlan.find((p) => p.name === unlock.name);
    const expected = applyBps(unlock.priceInPaise, config.baseBps) / 100;
    check(
      `${unlock.name} pays ${expected} — computed, not written`,
      row !== undefined && Number(row.commissionDisplay.replace(/[₹,]/g, "")) === expected,
      row?.commissionDisplay,
    );
  }

  const pass = paid.find((p) => p.code === "PASS");
  if (pass) {
    const expected = applyBps(pass.priceInPaise, config.baseBps) / 100;
    check("headline is the Rishta Pass commission", earnings.headlineRupees === expected, String(earnings.headlineRupees));
    check("headline names the Pass", earnings.basisLine.startsWith(pass.name), earnings.basisLine);
  }

  check("no retired first-month discount survives", !/pehla mahina sirf|first month/i.test(earnings.note), earnings.note);
  check("no flat ₹100 claim survives", !/flat/i.test(earnings.note), earnings.note);
  check("the partner's pitch — a free first conversation — is on the card", /baatcheet free|free/i.test(earnings.note), earnings.note);

  console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) failed.\n`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
