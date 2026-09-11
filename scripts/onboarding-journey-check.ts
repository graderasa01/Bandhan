import "./_env";
import { existsSync } from "node:fs";
import path from "node:path";
import { prisma } from "../lib/db/prisma";
import { BOTTOM_RAIL, NAV_GROUPS, NAV_ITEMS, navSearch } from "../components/layout/navItems";
import { MINIMUM_LIVE_KEYS, evaluateReadiness } from "../lib/profile/readiness";
import { queue } from "../lib/profile/stages";
import {
  MAX_DAILY_TURNS,
  MAX_SESSION_TURNS,
  assertVoiceTurnAllowed,
  getVoiceOnboardingAvailability,
} from "../lib/services/profile/voiceOnboardingService";
import { updateFeatureFlag } from "../lib/services/flags/featureFlagService";

/**
 * The rebuilt member journey — navigation, voice budget, question selection.
 *
 * Run: `npx tsx scripts/onboarding-journey-check.ts`
 *
 * Companion to `profile-readiness-check.ts`, which owns the live-readiness
 * rule. This one covers the rest of the acceptance list:
 *
 *   7/9. voice asks for the minimum, stops there, and never re-asks something
 *        already answered
 *   8.   a session that ends early keeps its draft and claims nothing
 *   11.  every existing route is still reachable — nothing was orphaned by the
 *        regrouping into five spaces
 *   12.  mobile navigation exposes those five without an overcrowded More
 *
 * The route check is the one worth keeping honest over time: the nav data and
 * the `app/` tree are maintained by hand and drift silently (see
 * `ROUTE_ACCESS_MATRIX`). Here a nav item pointing at a page that does not
 * exist fails the run rather than 404ing for a user.
 */

let failures = 0;

function check(name: string, condition: boolean, detail = "") {
  if (condition) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** Does a Next app-router page exist for this href? Dynamic segments count. */
function routeExists(href: string): boolean {
  const segments = href.split("/").filter(Boolean);
  let dir = path.join(process.cwd(), "app");

  for (const segment of segments) {
    const direct = path.join(dir, segment);
    if (existsSync(direct)) {
      dir = direct;
      continue;
    }
    // Route groups — `app/(onboarding)/profile/build` serves `/profile/build`.
    const grouped = ["(onboarding)", "(public)", "(auth)", "(marketing)"]
      .map((g) => path.join(dir, g, segment))
      .find((p) => existsSync(p));
    if (grouped) {
      dir = grouped;
      continue;
    }
    return false;
  }
  return existsSync(path.join(dir, "page.tsx")) || existsSync(path.join(dir, "page.ts"));
}

/** Every answer valid, every one typed by a human. */
const MINIMUM_VALUES: Record<string, string> = {
  fullName: "Rahul Sharma",
  gender: "Ladka",
  dateOfBirth: "12/04/1995",
  height: "5'9\"",
  currentCity: "Jaipur",
  maritalStatus: "Never Married",
  education: "B.Tech",
  profession: "Software Engineer",
};

async function main() {
  console.log("\n(12) Five spaces, and only five");

  check("there are exactly five nav groups", NAV_GROUPS.length === 5, NAV_GROUPS.map((g) => g.id).join(", "));
  check(
    "named for what a member is doing, not what the app has",
    NAV_GROUPS.map((g) => g.label).join(" | ") === "Today | Discover | My Rishte | Family | Me & Trust",
    NAV_GROUPS.map((g) => g.label).join(" | "),
  );
  check(
    "Grio is not a sixth space — it floats on every screen already",
    !NAV_GROUPS.some((g) => g.id === "grio"),
  );
  check(
    "but both its pages are still reachable",
    NAV_ITEMS.some((i) => i.href === "/user/concierge") && NAV_ITEMS.some((i) => i.href === "/user/grio-map"),
  );
  check(
    "and still findable by search",
    navSearch("grio").length >= 2 && navSearch("concierge").length >= 1,
  );

  check("the mobile rail has one slot per space", BOTTOM_RAIL.length === 5);
  check(
    "and each slot belongs to a different space",
    new Set(BOTTOM_RAIL.map((item) => NAV_GROUPS.find((g) => g.items.some((i) => i.href === item.href))?.id)).size === 5,
    BOTTOM_RAIL.map((i) => i.label).join(", "),
  );

  const primary = NAV_ITEMS.filter((i) => !i.secondary);
  check(
    "the More sheet opens on a readable number of tiles, not nineteen",
    primary.length <= 18,
    `${primary.length} primary of ${NAV_ITEMS.length}`,
  );
  check(
    "no space leads with more than five",
    NAV_GROUPS.every((g) => g.items.filter((i) => !i.secondary).length <= 5),
    NAV_GROUPS.map((g) => `${g.id}:${g.items.filter((i) => !i.secondary).length}`).join(" "),
  );
  check(
    "visibility tools (Boost, Spotlight) are not primary navigation",
    NAV_ITEMS.find((i) => i.href === "/user/boost")?.secondary === true &&
      NAV_ITEMS.find((i) => i.href === "/user/spotlight")?.secondary === true,
  );

  console.log("\n(11) Nothing was orphaned by the regrouping");

  // The full list as it stood before the five spaces existed. A regrouping is
  // allowed to move a page; it is not allowed to lose one.
  const PREVIOUS_HREFS = [
    "/user/dashboard", "/user/reel", "/user/discover", "/user/vibe", "/user/circle", "/user/inbox",
    "/partners", "/user/matches", "/user/proposals", "/user/messages", "/user/interests",
    "/user/shortlist", "/user/concierge", "/user/grio-map", "/profile/build", "/user/profile/me",
    "/user/profile/access", "/user/profile/intelligence", "/user/profile-trust-score",
    "/user/verify-contact", "/user/verification", "/user/deep-profile", "/user/biodata",
    "/user/kundli", "/user/boost", "/user/spotlight", "/user/subscription", "/user/services",
    "/user/app-setup", "/user/family", "/user/managed-drafts",
  ];
  const hrefs = new Set(NAV_ITEMS.map((i) => i.href));
  const lost = PREVIOUS_HREFS.filter((h) => !hrefs.has(h));
  check("every page that had a nav entry still has one", lost.length === 0, lost.join(", "));

  const missing = NAV_ITEMS.filter((i) => !routeExists(i.href));
  check(
    "and every nav href resolves to a real page in app/",
    missing.length === 0,
    missing.map((i) => i.href).join(", "),
  );

  const dupes = NAV_ITEMS.map((i) => i.href).filter((h, idx, all) => all.indexOf(h) !== idx);
  check("no page is listed in two spaces", dupes.length === 0, dupes.join(", "));

  console.log("\n(7/9) Voice asks for the minimum, and only what is still open");

  // What the spoken interview may ask while the profile is not yet live: the
  // minimum gate's blockers, nothing else.
  function minimumScopedQueue(values: Record<string, string>) {
    const blocking = new Set(evaluateReadiness(values).blockers.map((b) => b.key));
    return queue(values, []).filter((f) => blocking.has(f.key));
  }

  const fromEmpty = minimumScopedQueue({});
  check("an empty profile is asked about the eight, and nothing else", fromEmpty.length === 8);
  check(
    "every one of them is a minimum field",
    fromEmpty.every((f) => MINIMUM_LIVE_KEYS.includes(f.key)),
    fromEmpty.map((f) => f.key).join(", "),
  );
  check(
    "no stage-2 field sneaks into the first run",
    !fromEmpty.some((f) => f.stage > 1),
  );

  const partial = { fullName: "Rahul Sharma", gender: "Ladka", currentCity: "Jaipur" };
  const afterThree = minimumScopedQueue(partial);
  check(
    "(9) fields already answered are not asked again",
    afterThree.length === 5 && !afterThree.some((f) => Object.keys(partial).includes(f.key)),
    afterThree.map((f) => f.key).join(", "),
  );

  check(
    "(7) once the minimum is met there is nothing left to ask",
    minimumScopedQueue(MINIMUM_VALUES).length === 0,
  );
  check(
    "an unconfirmed AI value puts that field back in the queue rather than letting it pass",
    (() => {
      const blocking = new Set(
        evaluateReadiness(MINIMUM_VALUES, { education: { source: "ai", confirmed: false } }).blockers.map((b) => b.key),
      );
      return blocking.has("education") && blocking.size === 1;
    })(),
  );

  console.log("\n(8) A session that stops early keeps its draft");

  const stopped = evaluateReadiness({ fullName: "Rahul Sharma", gender: "Ladka" });
  check("a half-finished draft is not ready", stopped.ready === false);
  check("and its answers are still counted", stopped.done === 2);
  check("so nothing on screen can call it live", stopped.blockers.length === 6);

  console.log("\nThe voice budget is bounded, and switchable off");

  check("a sitting is capped", MAX_SESSION_TURNS > 0 && MAX_SESSION_TURNS <= 20, String(MAX_SESSION_TURNS));
  check("a day is capped", MAX_DAILY_TURNS >= MAX_SESSION_TURNS, String(MAX_DAILY_TURNS));

  const user = await prisma.user.create({
    data: {
      email: `journey-check-${Date.now()}@bandhantak.test`,
      mobile: `7${Date.now().toString().slice(-9)}`,
      passwordHash: "x",
      fullName: "Journey Check",
      role: "USER",
      status: "INCOMPLETE",
    },
  });
  const admin = await prisma.user.create({
    data: {
      email: `journey-admin-${Date.now()}@bandhantak.test`,
      mobile: `6${Date.now().toString().slice(-9)}`,
      passwordHash: "x",
      fullName: "Journey Admin",
      role: "ADMIN",
      status: "ACTIVE",
    },
  });

  try {
    const open = await getVoiceOnboardingAvailability(user.id);
    check("voice is open to a plain registered user — no plan, no approval", open.available === true, open.reason ?? "");
    check("and it reports how many turns are left today", open.turnsLeftToday === MAX_DAILY_TURNS);
    check("a turn is allowed", (await assertVoiceTurnAllowed(user.id)).ok === true);

    // The kill switch. `updateFeatureFlag` is what /admin/features calls.
    await updateFeatureFlag({
      key: "voiceOnboarding",
      rollout: "OFF",
      note: "journey-check",
      actorId: admin.id,
      actorRole: "ADMIN",
    });
    const off = await getVoiceOnboardingAvailability(user.id);
    check("an admin switching it off closes it immediately", off.available === false && off.reason === "disabled");
    const refused = await assertVoiceTurnAllowed(user.id);
    check("and the turn endpoint refuses", refused.ok === false);
    check(
      "with an offer to type rather than an error",
      refused.ok === false && /type/i.test(refused.message),
      refused.ok === false ? refused.message : "",
    );

    await updateFeatureFlag({
      key: "voiceOnboarding",
      rollout: "ALL",
      note: "journey-check restore",
      actorId: admin.id,
      actorRole: "ADMIN",
    });
    check("and switching it back on reopens it", (await getVoiceOnboardingAvailability(user.id)).available === true);
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: [user.id, admin.id] } } }).catch(() => {});
    await prisma.featureFlag.deleteMany({ where: { key: "voiceOnboarding" } }).catch(() => {});
  }

  console.log(`\n${failures === 0 ? "PASS" : `FAIL — ${failures} check(s)`}`);
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
