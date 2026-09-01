import "./_env";
import { prisma } from "../lib/db/prisma";
import { GRIO_ACTIONS, isGrioActionKey } from "../lib/contracts/grio";
import { getGrioContextFacts, formatGrioContext } from "../lib/services/grio/context";
import { saveDraft } from "../lib/services/profile/draftService";

/**
 * Grio's new action keys (`openAdvancedDiscovery`, `openContactVerification`)
 * and the new context facts (verification, Advanced Discovery, kundli
 * readiness, next Marriage Intelligence gap).
 *
 * Run: `npx tsx scripts/grio-discovery-context-check.ts`
 */

let failures = 0;
function check(name: string, condition: boolean, detail = "") {
  if (condition) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main() {
  console.log("\nThe two new action keys are real, nav-kind, and confirm-free (side-effect-free)");

  check("openAdvancedDiscovery exists in the catalog", isGrioActionKey("openAdvancedDiscovery"));
  check("openContactVerification exists in the catalog", isGrioActionKey("openContactVerification"));
  check("openAdvancedDiscovery is a nav action", GRIO_ACTIONS.openAdvancedDiscovery.kind === "nav");
  check("openContactVerification is a nav action", GRIO_ACTIONS.openContactVerification.kind === "nav");
  check("openAdvancedDiscovery points at /user/discover", GRIO_ACTIONS.openAdvancedDiscovery.href === "/user/discover");
  check("openContactVerification points at /user/verify-contact", GRIO_ACTIONS.openContactVerification.href === "/user/verify-contact");
  check(
    "both carry a non-empty 'when' — an action without one silently never gets offered",
    GRIO_ACTIONS.openAdvancedDiscovery.when.length > 0 && GRIO_ACTIONS.openContactVerification.when.length > 0,
  );
  check(
    "neither declares 'needs' — no unscoped action may claim to target a person",
    !("needs" in GRIO_ACTIONS.openAdvancedDiscovery) && !("needs" in GRIO_ACTIONS.openContactVerification),
  );

  console.log("\nContext facts — against a real profile");

  const user = await prisma.user.create({
    data: {
      fullName: "Grio Context Check",
      mobile: "9876500002",
      email: `grio-context+${Date.now()}@local.test`,
      passwordHash: "not-a-login",
      status: "ACTIVE",
    },
  });

  try {
    await saveDraft(user.id, {
      fullName: "Grio Context Check",
      gender: "Male",
      dateOfBirth: "1993-05-01",
      height: "5'8\"",
      maritalStatus: "Never married",
      education: "B.Tech",
      profession: "Engineer",
      motherTongue: "Hindi",
    });

    const facts = await getGrioContextFacts(user.id);

    check("mobileVerified is false before any OTP flow", facts.mobileVerified === false);
    check("emailVerified is false before any OTP flow", facts.emailVerified === false);
    check("hasMobile reflects the stored mobile", facts.hasMobile === true);
    check("hasEmail reflects the stored email", facts.hasEmail === true);
    check("advancedDiscoveryEntitled is false on a fresh FREE account", facts.advancedDiscoveryEntitled === false);
    check("behaviorLearning reads not_entitled when the plan doesn't include it", facts.behaviorLearning === "not_entitled");
    check("kundli.hasDob is true (DOB was saved)", facts.kundli.hasDob === true);
    check("kundli.hasBirthTime is false (never provided)", facts.kundli.hasBirthTime === false);
    check("kundli precision is 'no-time' when DOB exists but time doesn't", facts.kundli.precision === "no-time");

    await prisma.user.update({ where: { id: user.id }, data: { mobileVerifiedAt: new Date() } });
    const factsAfterVerify = await getGrioContextFacts(user.id);
    check("mobileVerified flips true the moment the column is set", factsAfterVerify.mobileVerified === true);

    const block = formatGrioContext(facts);
    check("the formatted block mentions verification", block.includes("Verification:"));
    check("the formatted block mentions Advanced Discovery", block.includes("Advanced Discovery:"));
    check("the formatted block mentions kundli readiness", block.includes("Kundli readiness:"));
    check(
      "the formatted block never claims astrology decides anything (that line lives in GRIO_LIMITS, not here — just confirming this block stays factual)",
      !block.toLowerCase().includes("guarantee") && !block.toLowerCase().includes("perfect match"),
    );

    console.log(`\n${failures === 0 ? "PASS" : `FAIL — ${failures} check(s)`}`);
  } finally {
    await prisma.discoverySettings.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
  }
}

main()
  .catch((err) => {
    console.error(err);
    failures++;
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(failures === 0 ? 0 : 1);
  });
