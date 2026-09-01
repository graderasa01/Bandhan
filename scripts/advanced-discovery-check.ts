import "./_env";
import { prisma } from "../lib/db/prisma";
import { PLAN_FEATURE_KEYS, PLAN_FEATURE_TYPES, BUILTIN_PLAN_DEFAULTS } from "../lib/constants/plans";
import { FEATURE_KEYS, isFeatureKey } from "../lib/constants/features";
import { getPlanContext } from "../lib/services/plans/entitlements";
import { getCandidates } from "../lib/services/match/pipeline";
import { searchDiscoveryCandidates } from "../lib/services/discovery/discoverySearchService";
import { saveDraft } from "../lib/services/profile/draftService";
import { PROFILE_FULL_INCLUDE } from "../lib/services/profile/profileInclude";

/**
 * Advanced Discovery — plan gates, and STRICT-vs-FLEXIBLE pool filtering.
 *
 * Run: `npx tsx scripts/advanced-discovery-check.ts`
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
  console.log("\nPlan gate — capability wiring");

  check("advancedDiscovery is a declared plan capability", (PLAN_FEATURE_KEYS as string[]).includes("advancedDiscovery"));
  check("advancedDiscovery is typed boolean", PLAN_FEATURE_TYPES.advancedDiscovery === "boolean");
  check("FREE defaults to false", BUILTIN_PLAN_DEFAULTS.FREE.advancedDiscovery === false);
  check("BASIC defaults to true", BUILTIN_PLAN_DEFAULTS.BASIC.advancedDiscovery === true);
  check("STANDARD defaults to true", BUILTIN_PLAN_DEFAULTS.STANDARD.advancedDiscovery === true);
  check("PREMIUM defaults to true", BUILTIN_PLAN_DEFAULTS.PREMIUM.advancedDiscovery === true);
  check("advancedDiscovery is also a feature-flag key (operational kill switch)", isFeatureKey("advancedDiscovery"));
  check("the feature key list agrees", (FEATURE_KEYS as readonly string[]).includes("advancedDiscovery"));

  console.log("\nA FREE user resolves the capability to false through the real plan pipeline");

  const freeUser = await prisma.user.create({
    data: { fullName: "Discovery Check FREE", email: `discovery-free+${Date.now()}@local.test`, passwordHash: "x", status: "ACTIVE" },
  });
  const paidUser = await prisma.user.create({
    data: { fullName: "Discovery Check BASIC", email: `discovery-basic+${Date.now()}@local.test`, passwordHash: "x", status: "ACTIVE" },
  });
  const targets: string[] = [];

  try {
    const freeCtx = await getPlanContext(freeUser.id);
    check("no subscription → FREE plan → advancedDiscovery is false", freeCtx.effectivePlanCode === "FREE" && freeCtx.features.advancedDiscovery === false);

    await prisma.subscription.create({
      data: {
        userId: paidUser.id,
        planCode: "BASIC",
        status: "ACTIVE",
        currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
      },
    });
    const basicCtx = await getPlanContext(paidUser.id);
    check("an active BASIC subscription → advancedDiscovery is true", basicCtx.features.advancedDiscovery === true);

    console.log("\nSTRICT never widens the pool; FLEXIBLE (default) still does");

    await saveDraft(paidUser.id, {
      fullName: "Discovery Check BASIC",
      gender: "Male",
      dateOfBirth: "1990-01-01",
      height: "5'8\"",
      maritalStatus: "Never married",
      education: "B.Tech",
      profession: "Engineer",
      motherTongue: "Hindi",
      currentCity: "Noida",
    });
    // A narrow age preference (28-30) that nothing in the small target pool
    // below will satisfy, so the strict pass returns ~0 candidates and only
    // the widening fallback can fill it.
    const viewerProfile = await prisma.profile.findUnique({ where: { userId: paidUser.id }, include: PROFILE_FULL_INCLUDE });
    if (!viewerProfile) throw new Error("viewer profile missing");
    await prisma.profilePartnerPreferences.upsert({
      where: { profileId: viewerProfile.id },
      create: { profileId: viewerProfile.id, minAge: 28, maxAge: 30 },
      update: { minAge: 28, maxAge: 30 },
    });

    for (let i = 0; i < 3; i++) {
      const t = await prisma.user.create({
        data: { fullName: `Discovery Target ${i}`, email: `discovery-target-${Date.now()}-${i}@local.test`, passwordHash: "x", status: "ACTIVE" },
      });
      targets.push(t.id);
      await prisma.profile.create({
        // 1995 → outside the 28-30 window on purpose (viewer's strict filter excludes every one of these).
        data: { userId: t.id, displayName: `Target ${i}`, gender: "Female", currentCity: "Noida", dateOfBirth: new Date(1995, 0, 1), isVisible: true, profileStatus: "SUBMITTED" },
      });
    }
    const viewerReloaded = await prisma.profile.findUnique({ where: { userId: paidUser.id }, include: PROFILE_FULL_INCLUDE });
    if (!viewerReloaded) throw new Error("viewer profile missing");

    // Membership, not raw counts — this runs against a real dev database that
    // may already hold other seeded profiles inside the 28-30 window, so "0
    // results" would be a false failure. What actually distinguishes STRICT
    // from FLEXIBLE is whether *these specific out-of-window targets* appear.
    //
    // minDesired is deliberately huge: `getCandidates` only widens when the
    // strict pass falls short of it, and this dev database may already hold
    // more than 3 real in-window profiles — which would satisfy a minDesired
    // of 3 without the widening pass ever running.
    const flexible = await getCandidates(viewerReloaded, 10_000, { strict: false });
    const flexibleIds = new Set(flexible.map((p) => p.userId));
    check(
      "FLEXIBLE (default reel behaviour) widens past a narrow age preference and includes the out-of-window targets",
      targets.every((id) => flexibleIds.has(id)),
      `flexible had ${flexible.length}, missing ${targets.filter((id) => !flexibleIds.has(id)).length} of 3 targets`,
    );

    const strict = await getCandidates(viewerReloaded, 3, { strict: true });
    const strictIds = new Set(strict.map((p) => p.userId));
    check(
      "STRICT never widens — none of the out-of-window targets appear, even though the FLEXIBLE pass above proved they exist",
      targets.every((id) => !strictIds.has(id)),
      `strict incorrectly included ${targets.filter((id) => strictIds.has(id)).length} of 3 targets`,
    );

    console.log("\nverifiedOnly / minTrustScore are additional hard filters, gated the same way");

    // Clear the narrow age preference from the STRICT test above — otherwise
    // every target (age 31) is excluded before the trust/verified filters
    // even get a chance to matter.
    await prisma.profilePartnerPreferences.update({ where: { profileId: viewerReloaded.id }, data: { minAge: null, maxAge: null } });
    const viewerNoAgePref = await prisma.profile.findUnique({ where: { userId: paidUser.id }, include: PROFILE_FULL_INCLUDE });
    if (!viewerNoAgePref) throw new Error("viewer profile missing");

    await prisma.profile.updateMany({ where: { userId: { in: targets } }, data: { trustScore: 40 } });
    await prisma.profile.update({ where: { userId: targets[0] }, data: { trustScore: 90, profileStatus: "VERIFIED" } });

    const trustFiltered = await getCandidates(viewerNoAgePref, 0, { strict: false, discoveryFilters: { verifiedOnly: false, minTrustScore: 80 } });
    check("minTrustScore=80 excludes the two low-trust targets", trustFiltered.every((p) => (p.trustScore ?? 0) >= 80), trustFiltered.map((p) => p.trustScore).join(","));
    check("and keeps the one high-trust target", trustFiltered.some((p) => p.userId === targets[0]));

    const verifiedFiltered = await getCandidates(viewerNoAgePref, 0, { strict: false, discoveryFilters: { verifiedOnly: true, minTrustScore: null } });
    check("verifiedOnly=true only returns VERIFIED-status profiles", verifiedFiltered.every((p) => p.profileStatus === "VERIFIED"));

    console.log("\nA FREE search request never reaches the search service (route-level gate)");
    // searchDiscoveryCandidates itself has no plan check — the gate lives in
    // the route, exactly like grioMatchExplain's split between the endpoint
    // check and the dossier builder. Confirm the route file actually calls
    // isFeatureAvailable before this function, by re-reading its source.
    const routeSrc = await import("node:fs/promises").then((fs) => fs.readFile("app/api/discover/search/route.ts", "utf8"));
    check(
      "the search route checks isFeatureAvailable(\"advancedDiscovery\", ...) before calling searchDiscoveryCandidates",
      /isFeatureAvailable\(user\.id,\s*"advancedDiscovery"/.test(routeSrc) &&
        routeSrc.indexOf('isFeatureAvailable(user.id, "advancedDiscovery"') < routeSrc.indexOf("searchDiscoveryCandidates("),
    );

    console.log("\nNo filter exists for a caste/gotra/manglik/income/religion value");
    const searchSrc = await import("node:fs/promises").then((fs) => fs.readFile("lib/services/discovery/discoverySearchService.ts", "utf8"));
    for (const forbidden of ["caste", "gotra", "manglik", "income", "religion"]) {
      check(`"${forbidden}" is not a filterable field in DiscoverySearchFilters`, !new RegExp(`${forbidden}\\s*[:?]`, "i").test(searchSrc.split("export interface DiscoverySearchFilters")[1]?.split("}")[0] ?? ""));
    }

    // Sanity: the search service itself runs against the real DB without throwing.
    const searchPage = await searchDiscoveryCandidates(paidUser.id, {
      nameQuery: null, minAge: null, maxAge: null, cities: [], education: null, professionCategory: null,
      maritalStatus: null, diet: null, smoking: null, drinking: null, verifiedOnly: false, minTrustScore: null,
      cursor: null, pageSize: 20,
    });
    check("search returns a page shape with results + nextCursor", Array.isArray(searchPage.results) && ("nextCursor" in searchPage));

    console.log(`\n${failures === 0 ? "PASS" : `FAIL — ${failures} check(s)`}`);
  } finally {
    await prisma.subscription.deleteMany({ where: { userId: paidUser.id } });
    await prisma.user.delete({ where: { id: freeUser.id } }).catch(() => {});
    await prisma.user.delete({ where: { id: paidUser.id } }).catch(() => {});
    for (const id of targets) await prisma.user.delete({ where: { id } }).catch(() => {});
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
