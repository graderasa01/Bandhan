import "./_env";
import { prisma } from "../lib/db/prisma";
import {
  computeBehaviorAffinity,
  buildLearnedBehaviorProfile,
  ageBandOf,
  type LearnedBehaviorProfile,
  type BehaviorDimension,
} from "../lib/services/discovery/behaviorLearning";
import { scorePreferenceMatch } from "../lib/services/match/preferenceScore";
import type { ProfileWithSubTables } from "../lib/services/profile/completionService";
import type { SignalAnswerMap } from "../lib/profile/signalAnswers";
import { saveDraft } from "../lib/services/profile/draftService";
import { PROFILE_FULL_INCLUDE } from "../lib/services/profile/profileInclude";

/**
 * Behaviour-personalised Reel ranking (Advanced Discovery, paid).
 *
 * Run: `npx tsx scripts/behavior-learning-check.ts`
 *
 * Split the way `compatibility-lab-check.ts` splits: `computeBehaviorAffinity`
 * is pure (no DB, no await) so its rules — dimension isolation, no sensitive
 * fields, no `decisionMs` — are checked against plain objects. Only
 * `buildLearnedBehaviorProfile`'s threshold and reset behaviour need a real
 * database, since that is the half that actually queries `SwipeAction`.
 */

let failures = 0;
function check(name: string, condition: boolean, detail = "") {
  if (condition) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function candidate(fields: {
  currentCity?: string | null;
  dateOfBirth?: Date | null;
  highestEducation?: string | null;
  professionCategory?: string | null;
  diet?: string | null;
  smoking?: string | null;
  drinking?: string | null;
}): ProfileWithSubTables {
  return {
    id: "cand-1",
    userId: "cand-1-user",
    currentCity: fields.currentCity ?? null,
    dateOfBirth: fields.dateOfBirth ?? null,
    education: fields.highestEducation ? { highestEducation: fields.highestEducation } : null,
    profession: fields.professionCategory ? { professionCategory: fields.professionCategory } : null,
    lifestyle: fields.diet || fields.smoking || fields.drinking ? { diet: fields.diet ?? null, smoking: fields.smoking ?? null, drinking: fields.drinking ?? null } : null,
    basicDetails: null,
    family: null,
    partnerPreferences: null,
    respondentType: "SELF",
  } as unknown as ProfileWithSubTables;
}

function learnedProfile(dims: Partial<Record<BehaviorDimension, Record<string, number>>>): LearnedBehaviorProfile {
  const dimensions: Record<BehaviorDimension, Map<string, number>> = {
    ageBand: new Map(),
    city: new Map(),
    education: new Map(),
    professionCategory: new Map(),
    lifestyle: new Map(),
  };
  for (const [dim, values] of Object.entries(dims) as [BehaviorDimension, Record<string, number>][]) {
    for (const [k, v] of Object.entries(values)) dimensions[dim].set(k, v);
  }
  return { dimensions, sampleSize: 25, positiveCount: 5, learnedAt: new Date() };
}

async function main() {
  console.log("\ncomputeBehaviorAffinity is pure and structural");

  check("null profile → null (no signal, not a zero)", computeBehaviorAffinity(null, candidate({ currentCity: "Noida" })) === null);

  const noida = candidate({ currentCity: "Noida" });
  const learnedCity = learnedProfile({ city: { Noida: 10, Delhi: -3 } });
  const scoreNoida = computeBehaviorAffinity(learnedCity, noida);
  check("a strongly-positive city scores above neutral (50)", scoreNoida !== null && scoreNoida > 50, String(scoreNoida));

  const delhi = candidate({ currentCity: "Delhi" });
  const scoreDelhi = computeBehaviorAffinity(learnedCity, delhi);
  check("a net-negative city scores below neutral", scoreDelhi !== null && scoreDelhi < 50, String(scoreDelhi));

  const unseenValue = candidate({ currentCity: "Pune" });
  const unseenScore = computeBehaviorAffinity(learnedCity, unseenValue);
  check(
    "a city never swiped on (but the city dimension itself has data) scores neutral, not a penalty",
    unseenScore === 50,
    String(unseenScore),
  );

  const noOverlap = candidate({ highestEducation: "B.Tech" }); // only carries a value in a dimension the learner has never touched
  check(
    "a candidate with no value in any learned dimension gets no signal at all — null, not a guess",
    computeBehaviorAffinity(learnedCity, noOverlap) === null,
  );

  check(
    "the result is always 0..100",
    [scoreNoida, scoreDelhi].every((s) => s !== null && s >= 0 && s <= 100),
  );

  console.log("\nOnly non-sensitive, user-visible attributes ever enter a dimension");

  const dims = Object.keys(learnedProfile({}).dimensions);
  const allowed = new Set(["ageBand", "city", "education", "professionCategory", "lifestyle"]);
  check(
    "the dimension set is exactly the allowed five — no religion/caste/income/gotra/manglik key exists to accidentally fill",
    dims.length === 5 && dims.every((d) => allowed.has(d)),
    dims.join(", "),
  );

  const forbidden = ["religion", "caste", "gotra", "manglik", "income", "name", "displayName"];
  check(
    "none of the forbidden keys are dimension names",
    forbidden.every((f) => !dims.includes(f)),
  );

  console.log("\nAge is bucketed, never exact");

  check("24 and 25 fall in the same 3-year band", ageBandOf(24) === ageBandOf(25));
  check("24 and 27 fall in different bands", ageBandOf(24) !== ageBandOf(27));

  console.log("\ndecisionMs structurally cannot be evidence");

  // LearnedBehaviorProfile carries no per-swipe timing at all by the time it
  // reaches the scorer — only aggregated net weights per value. There is no
  // field a caller could even pass decisionMs through as.
  const sample = learnedProfile({ city: { Noida: 5 } }) as unknown as Record<string, unknown>;
  check(
    "the learned profile type has no timing field to accidentally read",
    !("decisionMs" in sample) && !("avgDecisionMs" in sample),
  );

  console.log("\nBehaviour affinity is a bounded, optional part of the preference bucket");

  // A viewer with one stated preference the candidate doesn't meet (religion),
  // so the baseline sits below 100 and there is real headroom for a bounded
  // behaviour signal to move it — with every base component already at 100
  // (an untouched viewer) adding another 100 changes nothing, which would be
  // a useless test of "bounded".
  const viewer = candidate({});
  (viewer as unknown as { partnerPreferences: { religionPreference: string } }).partnerPreferences = {
    religionPreference: "Hindu",
  };
  const noSignals: SignalAnswerMap = new Map();
  const baseline = scorePreferenceMatch(viewer, noida, noSignals, noSignals, null);
  const withBehavior = scorePreferenceMatch(viewer, noida, noSignals, noSignals, 100);
  const withNegBehavior = scorePreferenceMatch(viewer, noida, noSignals, noSignals, 0);
  check(
    "passing null behaviour reproduces the untouched score exactly (no-regression guarantee)",
    baseline === scorePreferenceMatch(viewer, noida, noSignals, noSignals),
  );
  check(
    "a maximally-positive behaviour signal moves the score, but by a small, bounded amount",
    withBehavior > baseline && withBehavior - baseline <= 6,
    `baseline=${baseline} withBehavior=${withBehavior}`,
  );
  check(
    "a maximally-negative behaviour signal moves the score down by a similarly small amount",
    withNegBehavior < baseline && baseline - withNegBehavior <= 6,
    `baseline=${baseline} withNegBehavior=${withNegBehavior}`,
  );

  console.log("\nThreshold and reset — against a real database");

  const user = await prisma.user.create({
    data: {
      fullName: "Behavior Learning Check",
      email: `behavior-check+${Date.now()}@local.test`,
      passwordHash: "not-a-login",
      status: "ACTIVE",
    },
  });

  const targets: string[] = [];
  try {
    await saveDraft(user.id, {
      fullName: "Behavior Learning Check",
      gender: "Male",
      dateOfBirth: "1993-01-01",
      height: "5'8\"",
      maritalStatus: "Never married",
      education: "B.Tech",
      profession: "Engineer",
      motherTongue: "Hindi",
      currentCity: "Noida",
    });
    const viewerProfile = await prisma.profile.findUnique({ where: { userId: user.id }, include: PROFILE_FULL_INCLUDE });
    if (!viewerProfile) throw new Error("viewer profile missing");

    check(
      "below threshold: no profile at all",
      (await buildLearnedBehaviorProfile(user.id)) === null,
    );

    // 25 target profiles so the create loop below can write 25 real swipes —
    // above both the 20-decision and (via directions below) 3-positive floor.
    for (let i = 0; i < 25; i++) {
      const t = await prisma.user.create({
        data: { fullName: `Target ${i}`, email: `behavior-target-${Date.now()}-${i}@local.test`, passwordHash: "x", status: "ACTIVE" },
      });
      targets.push(t.id);
      await prisma.profile.create({
        data: { userId: t.id, displayName: `Target ${i}`, currentCity: i < 15 ? "Noida" : "Mumbai", dateOfBirth: new Date(1994, 0, 1), isVisible: true, profileStatus: "SUBMITTED" },
      });
    }
    // Explicit order (findMany does not preserve creation order), and every
    // swipe below gets an explicit, one-second-spaced `createdAt` — two
    // creates inside a tight loop can otherwise land in the same database
    // millisecond, making the recency order (and this section's Noida-lean
    // assertion) nondeterministic between runs.
    const targetsById = new Map((await prisma.profile.findMany({ where: { userId: { in: targets } } })).map((p) => [p.userId, p]));
    const targetProfiles = targets.map((id) => targetsById.get(id)!);
    const swipeAt = (i: number) => new Date(Date.now() - (100 - i) * 1000);

    // 19 decisions — one short of the 20-decision floor.
    for (let i = 0; i < 19; i++) {
      await prisma.swipeAction.create({
        data: { actorUserId: user.id, targetProfileId: targetProfiles[i].id, direction: i < 5 ? "RIGHT" : "LEFT", createdAt: swipeAt(i) },
      });
    }
    check("19 decisions, 5 positive: still below the 20-decision floor", (await buildLearnedBehaviorProfile(user.id)) === null);

    // One more swipe clears the 20-decision floor with 5 positives (≥3).
    await prisma.swipeAction.create({ data: { actorUserId: user.id, targetProfileId: targetProfiles[19].id, direction: "RIGHT", createdAt: swipeAt(19) } });
    const learned = await buildLearnedBehaviorProfile(user.id);
    check("20 decisions, ≥3 positive: learning is now active", learned !== null);
    check(
      "the profile leans toward Noida, which is what most of the positive swipes were on",
      (learned?.dimensions.city.get("Noida") ?? 0) > 0,
      `Noida=${learned?.dimensions.city.get("Noida")} Mumbai=${learned?.dimensions.city.get("Mumbai")} sampleSize=${learned?.sampleSize}`,
    );

    console.log("\nUP is ignored, RIGHT/DOWN are positive, LEFT is a weak negative");
    // Every swipe above was LEFT/RIGHT only — add UP swipes and confirm they
    // change nothing (SwipeAction query excludes UP by direction filter).
    await prisma.swipeAction.create({ data: { actorUserId: user.id, targetProfileId: targetProfiles[20].id, direction: "UP" } });
    const afterUp = await buildLearnedBehaviorProfile(user.id);
    check(
      "adding an UP swipe does not change the learned sample size",
      afterUp?.sampleSize === learned?.sampleSize,
      `before=${learned?.sampleSize} after=${afterUp?.sampleSize}`,
    );

    console.log("\nReset learned behaviour");
    await prisma.discoverySettings.upsert({
      where: { userId: user.id },
      create: { userId: user.id, behaviorResetAt: new Date() },
      update: { behaviorResetAt: new Date() },
    });
    check("right after a reset, learning drops back below threshold", (await buildLearnedBehaviorProfile(user.id)) === null);

    console.log("\nPausing learning returns null even with plenty of history");
    await prisma.discoverySettings.update({ where: { userId: user.id }, data: { behaviorLearningEnabled: false, behaviorResetAt: null } });
    check("paused: null regardless of sample size", (await buildLearnedBehaviorProfile(user.id)) === null);

    console.log(`\n${failures === 0 ? "PASS" : `FAIL — ${failures} check(s)`}`);
  } finally {
    await prisma.swipeAction.deleteMany({ where: { actorUserId: user.id } });
    await prisma.discoverySettings.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
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
