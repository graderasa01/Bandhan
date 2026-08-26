import "./_env";
import { prisma } from "../lib/db/prisma";
import {
  getKycGate,
  getPartnerKycView,
  reviewPartnerKyc,
  revealPan,
  savePanDetails,
  uploadKycDocument,
} from "../lib/services/payouts/kycService";
import { getPartnerBalance, verifyPayoutAccount } from "../lib/services/payouts/payoutService";

/**
 * Partner KYC, end to end against the live database.
 *
 * Run: `npx tsx scripts/partner-kyc-check.ts`
 *
 * The properties under test are the ones that cost money or trust when they
 * break, not the shape of the UI:
 *
 *   1. A PAN is never stored in plaintext, and never leaves as more than four
 *      characters unless it goes through the audited reveal.
 *   2. A file that is not really an image or a PDF is refused, whatever its
 *      declared type said.
 *   3. Re-uploading replaces rather than piles up, and re-opens a review that
 *      had already passed.
 *   4. `verifyPayoutAccount` cannot approve an account while KYC is
 *      unverified — the check it represents is impossible without a name to
 *      compare against.
 *   5. Every gate reports itself on `getPartnerBalance`, so a partner reads
 *      the reason rather than a dead button.
 *
 * Everything is done on a throwaway partner and torn down at the end, so it is
 * safe to run against a database with real partners in it.
 */

let failures = 0;
function check(name: string, condition: boolean, detail = "") {
  if (condition) console.log(`  ok   ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** A one-pixel PNG — real magic bytes, so the sniffer must accept it. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

/** A text file. Whatever the browser calls it, it is not a document. */
const NOT_AN_IMAGE = Buffer.from("<html><script>alert(1)</script></html>                    ", "utf8");

const TEST_PAN = "ABCDE1234F";

async function main() {
  const suffix = Date.now().toString(36);
  const email = `kyc-check-${suffix}@example.invalid`;

  const mobile = `9${suffix.slice(-9).padStart(9, "0")}`;

  const user = await prisma.user.create({
    data: {
      email,
      mobile,
      passwordHash: "x",
      fullName: "KYC Check",
      role: "PARTNER",
    },
  });

  const partner = await prisma.partner.create({
    data: {
      userId: user.id,
      fullName: "Ramesh Kumar",
      mobileNumber: mobile,
      city: "Indore",
      state: "MP",
      partnerType: "OTHER",
      status: "ACTIVE",
    },
  });

  try {
    console.log(`\nThrowaway partner: ${partner.id}\n`);

    // ---------------------------------------------------------- 1. gate off
    //
    // `getKycGate` still reports NOT_STARTED as not-ok — that is what drives
    // the panel's own copy. What changed on 2026-08-26 is that nothing
    // *consumes* that as a block: KYC is optional, so a partner with no KYC at
    // all must still be able to reach a withdrawal. These assertions are the
    // inverse of what they used to be, deliberately.
    console.log("Gate before anything is submitted:");
    const gate0 = await getKycGate(partner.id);
    check("gate reports NOT_STARTED", gate0.status === "NOT_STARTED", `status=${gate0.status}`);

    const balance0 = await getPartnerBalance(partner.id);
    check(
      "balance does NOT block on KYC",
      !(balance0.blockedReason ?? "").includes("PAN"),
      `blockedReason=${balance0.blockedReason}`,
    );

    // -------------------------------------------------------------- 2. PAN
    console.log("\nPAN validation and storage:");
    const badPan = await savePanDetails(partner.id, { pan: "NOTAPAN123", legalName: "Ramesh Kumar" });
    check("malformed PAN refused", !badPan.ok, JSON.stringify(badPan));

    const noName = await savePanDetails(partner.id, { pan: TEST_PAN, legalName: "R" });
    check("one-letter legal name refused", !noName.ok, JSON.stringify(noName));

    const saved = await savePanDetails(partner.id, { pan: "abcde1234f", legalName: "  Ramesh   Kumar " });
    check("valid PAN accepted (and upper-cased)", saved.ok, JSON.stringify(saved));

    const raw = await prisma.partnerKyc.findUnique({ where: { partnerId: partner.id } });
    check("row exists", raw !== null);
    check(
      "PAN is not stored in plaintext anywhere on the row",
      !JSON.stringify(raw).toUpperCase().includes(TEST_PAN),
      "found the PAN in the row",
    );
    check("last four stored for display", raw?.panLast4 === "234F", String(raw?.panLast4));
    check("legal name whitespace collapsed", raw?.legalName === "Ramesh Kumar", String(raw?.legalName));

    const view1 = await getPartnerKycView(partner.id);
    check("view masks the PAN", view1.panMasked === "••••••234F", String(view1.panMasked));
    check(
      "view never carries the whole PAN",
      !JSON.stringify(view1).toUpperCase().includes(TEST_PAN),
      "view leaked the PAN",
    );
    check("still NOT_STARTED without a document", view1.status === "NOT_STARTED", view1.status);
    check("view says what is missing", view1.missing.join(",") === "PAN_CARD", view1.missing.join(","));

    // -------------------------------------------------------- 3. documents
    console.log("\nDocument upload:");
    const junk = await uploadKycDocument({
      partnerId: partner.id,
      kind: "PAN_CARD",
      buffer: NOT_AN_IMAGE,
      originalName: "pan.png",
    });
    check("file that is not really an image is refused", !junk.ok, JSON.stringify(junk));

    const tooBig = await uploadKycDocument({
      partnerId: partner.id,
      kind: "PAN_CARD",
      buffer: Buffer.concat([PNG, Buffer.alloc(9 * 1024 * 1024)]),
      originalName: "big.png",
    });
    check("oversized file is refused", !tooBig.ok, JSON.stringify(tooBig));

    const up1 = await uploadKycDocument({
      partnerId: partner.id,
      kind: "PAN_CARD",
      buffer: PNG,
      originalName: "pan.png",
    });
    check("real PNG accepted", up1.ok, JSON.stringify(up1));

    const view2 = await getPartnerKycView(partner.id);
    check("submitting both halves moves it to PENDING", view2.status === "PENDING", view2.status);
    check("nothing outstanding", view2.missing.length === 0, view2.missing.join(","));

    const up2 = await uploadKycDocument({
      partnerId: partner.id,
      kind: "PAN_CARD",
      buffer: PNG,
      originalName: "pan-again.png",
    });
    check("re-upload accepted", up2.ok);
    const docs = await prisma.partnerKycDocument.findMany({ where: { partnerId: partner.id } });
    check("re-upload replaced rather than piled up", docs.length === 1, `${docs.length} rows`);

    // ------------------------------------------------- 4. account is gated
    console.log("\nPayout account cannot be verified without KYC:");
    await prisma.partnerPayoutAccount.create({
      data: {
        partnerId: partner.id,
        method: "UPI",
        accountHolderName: "Ramesh Kumar",
        upiCipher: "x",
        upiIv: "y",
        upiTag: "z",
        upiLast4: "1234",
      },
    });
    const admin = await prisma.user.findFirst({ where: { role: "ADMIN" }, select: { id: true } });
    const actorId = admin?.id ?? user.id;

    const early = await verifyPayoutAccount({
      partnerId: partner.id,
      approve: true,
      actorId,
      actorRole: "ADMIN",
    });
    check("approve refused while KYC is PENDING", !early.ok, JSON.stringify(early));
    check(
      "refusal names KYC as the reason",
      !early.ok && early.error === "KYC_PENDING",
      !early.ok ? early.error : "approved",
    );

    // ----------------------------------------------------------- 5. review
    console.log("\nAdmin review:");
    const rejected = await reviewPartnerKyc({
      partnerId: partner.id,
      approve: false,
      actorId,
      actorRole: "ADMIN",
    });
    check("reject without a reason refused", !rejected.ok, JSON.stringify(rejected));

    const approved = await reviewPartnerKyc({
      partnerId: partner.id,
      approve: true,
      actorId,
      actorRole: "ADMIN",
    });
    check("approve accepted once both halves are in", approved.ok, JSON.stringify(approved));

    const gate1 = await getKycGate(partner.id);
    check("gate opens after verification", gate1.ok, JSON.stringify(gate1));

    const nowOk = await verifyPayoutAccount({
      partnerId: partner.id,
      approve: true,
      actorId,
      actorRole: "ADMIN",
    });
    check("payout account can now be verified", nowOk.ok, JSON.stringify(nowOk));

    // ------------------------------------------------------ 6. reveal, log
    console.log("\nReveal and audit:");
    const revealed = await revealPan({ partnerId: partner.id, actorId, actorRole: "ADMIN" });
    check("PAN decrypts back to what was typed", revealed.ok && revealed.pan === TEST_PAN, JSON.stringify(revealed));

    const logs = await prisma.adminAuditLog.findMany({
      where: { targetId: partner.id, actionType: { startsWith: "KYC_" } },
      select: { actionType: true, newValue: true },
    });
    check("verification was logged", logs.some((l) => l.actionType === "KYC_VERIFIED"), JSON.stringify(logs));
    check("reveal was logged", logs.some((l) => l.actionType === "KYC_PAN_REVEALED"), JSON.stringify(logs));
    check(
      "no audit row contains the PAN itself",
      !JSON.stringify(logs).toUpperCase().includes(TEST_PAN),
      "an audit row leaked the PAN",
    );

    // ------------------------------------------- 7. a change re-opens review
    console.log("\nA change after verification re-opens the review:");
    await uploadKycDocument({
      partnerId: partner.id,
      kind: "PAN_CARD",
      buffer: PNG,
      originalName: "swapped.png",
    });
    const afterSwap = await getPartnerKycView(partner.id);
    check("replacing a document drops VERIFIED", afterSwap.status === "PENDING", afterSwap.status);

    await reviewPartnerKyc({ partnerId: partner.id, approve: true, actorId, actorRole: "ADMIN" });
    await savePanDetails(partner.id, { pan: "ZZZZZ9999Z", legalName: "Ramesh Kumar" });
    const afterPan = await getPartnerKycView(partner.id);
    check("changing the PAN drops VERIFIED too", afterPan.status !== "VERIFIED", afterPan.status);

    const balance1 = await getPartnerBalance(partner.id);
    check("and the balance blocks again", !balance1.canRequest, JSON.stringify(balance1.blockedReason));
  } finally {
    // Cascades take the KYC row, its documents, and the payout account.
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
  }

  console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) FAILED.\n`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
