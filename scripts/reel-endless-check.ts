import "./_env";
import fs from "node:fs";
import path from "node:path";
import {
  DISCOVER_MAX_AGE,
  DISCOVER_MIN_AGE,
  DISCOVER_NAME_MIN_CHARS,
  parseDiscoverFilters,
} from "../lib/discovery/contract";
import {
  REEL_SEARCH_AGE_BANDS,
  buildReelSearchFilters,
  hasReelSearchQuery,
} from "../lib/reel/searchFilters";
import { BUILTIN_PLAN_DEFAULTS, PLAN_COMPARISON_ROWS, planFeatureBullets } from "../lib/constants/plans";
import { freePlanLines } from "../lib/data/planData";
import { QUEST_LIST } from "../lib/quests/definitions";
import { REEL_LANES } from "../lib/contracts/reelLibrary";

/**
 * D-91 — the reel has no daily number, and search has its filters inside it.
 *
 * Run: `npx tsx scripts/reel-endless-check.ts`
 *
 * Two things are being protected here, and both are the kind that come back
 * quietly months later:
 *
 *  1. **No surface quotes a per-day reel count.** The number is gone from the
 *     product, but `reelPerDay` still exists as a batch size — which means the
 *     easiest possible regression is somebody wiring that key back into a
 *     pricing bullet, a comparison row or a marketing brief, where it would
 *     read as a limit again.
 *  2. **The top-up is honest and cheap.** It must exclude the cards already in
 *     the deck (or the same person appears twice), it must not run the AI
 *     explainer per batch (one model call per card, for cards ranked lower and
 *     lower), and the closing screen must appear only when the *server* says
 *     the pool is finished, never when a lens happens to be empty.
 *
 * No database and no model: fixtures, the real filter builder, and source
 * reads for the structural rules. Source-read checks are labelled as such.
 */

let failures = 0;
let checks = 0;

function check(label: string, condition: boolean, detail = "") {
  checks++;
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function source(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

/** The body of one exported function, for the "does this path call X" checks. */
function functionBody(src: string, name: string): string {
  const start = src.indexOf(`export async function ${name}(`);
  if (start === -1) return "";
  const next = src.indexOf("\nexport ", start + 1);
  return src.slice(start, next === -1 ? undefined : next);
}

/* ================================================================== */
console.log("\nNo surface quotes a per-day reel count");

const free = BUILTIN_PLAN_DEFAULTS.FREE;
const freeLines = freePlanLines(free);
check(
  "FREE pricing lines never print the batch number",
  !freeLines.some((l) => l.includes(String(free.reelPerDay))),
  freeLines.find((l) => l.includes(String(free.reelPerDay))),
);
check(
  "FREE pricing says the reel has no daily limit",
  freeLines.some((l) => /bina roz ki limit|no daily limit/i.test(l)),
  freeLines[0],
);
// "smart Reel" (the Advanced Discovery row) is about ranking and stays; what
// may never come back is a row that counts cards.
const COUNTS_CARDS = /rishta reel\s*\/|reel\s*\/\s*din|reel per day/i;
check(
  "the plan comparison table has no row counting reel cards",
  !PLAN_COMPARISON_ROWS.some((r) => COUNTS_CARDS.test(r.label)),
  PLAN_COMPARISON_ROWS.find((r) => COUNTS_CARDS.test(r.label))?.label,
);
check(
  "no comparison row reads reelPerDay, whatever it is called",
  !PLAN_COMPARISON_ROWS.some((r) => {
    const low = r.pick({ ...free, reelPerDay: 3 });
    const high = r.pick({ ...free, reelPerDay: 97 });
    return low !== high;
  }),
);
check(
  "Pass bullets never mention a reel count",
  !planFeatureBullets(BUILTIN_PLAN_DEFAULTS.PASS).some((b) => /reel|rishtey\s*\/\s*din/i.test(b)),
);
check(
  "a marketing brief is never handed a reel count as a plan benefit (source)",
  !/\["reelPerDay",/.test(source("lib/services/marketing/contextBuilder.ts")),
);

/* ================================================================== */
console.log("\nRewards may not grant what nobody is short of");

check(
  "no quest grants REEL_UNLOCK any more",
  !QUEST_LIST.some((q) => q.reward.kind === "REEL_UNLOCK"),
  QUEST_LIST.find((q) => q.reward.kind === "REEL_UNLOCK")?.key,
);
check(
  "and no quest label promises extra reel cards",
  !QUEST_LIST.some((q) => /rishta card|reel card/i.test(q.rewardLabel)),
  QUEST_LIST.find((q) => /rishta card|reel card/i.test(q.rewardLabel))?.rewardLabel,
);

/* ================================================================== */
console.log("\nThe top-up (source checks — these are structural properties)");

const generator = source("lib/services/match/reelGenerator.ts");
const extend = functionBody(generator, "extendTodayReel");

check("extendTodayReel exists", extend.length > 0);
check(
  "a top-up excludes the cards already in the deck",
  /excludeProfileIds:\s*alreadyInReel/.test(extend),
  "without it, an undealt card can be dealt a second time",
);
check(
  "a top-up runs no AI explanation",
  !extend.includes("explainTopCandidates"),
  "one model call per card, for the lowest-ranked cards, on every batch",
);
check(
  "the first batch still does explain its cards",
  functionBody(generator, "getOrCreateTodayReel").includes("explainTopCandidates"),
);
check(
  "a top-up delivers no second Spotlight card",
  !extend.includes("pickSpotlightForViewer"),
  "one paid card per member per day is what the campaign bought",
);
check(
  "duplicate rows are skipped rather than thrown (two tabs, one batch)",
  /skipDuplicates:\s*true/.test(extend),
);

const data = source("lib/data/reelData.ts");
check(
  "the top-up builds its cards with the same function as the first batch",
  functionBody(data, "getMoreReelCards").includes("buildCards"),
);
check(
  "exhausted is set from nobody-new, not from a short batch",
  /addedProfileIds\.length === 0\) return \{ cards: \[\], exhausted: true \}/.test(data),
);

const stack = source("components/reel/ReelStack.tsx");
check(
  "the closing card is reachable only once the server says exhausted",
  stack.includes("const stillLooking = !lane && !hasCard && !emptyPool && !exhausted;"),
);
check(
  "an empty lens does not end the reel — it asks for more",
  /if \(queue\.length === 0 && emptyTopUps\.current >= MAX_EMPTY_TOPUPS\) return;/.test(stack),
);
check(
  "cards are appended by id, so a repeated batch cannot duplicate a person",
  /const have = new Set\(prev\.map\(\(c\) => c\.id\)\);/.test(stack),
);

const contract = source("lib/contracts/reel.ts");
check("the view model no longer carries a daily limit", !/^\s*dailyLimit:/m.test(contract));
check("and no reel-exhausted upgrade offer", !contract.includes("upgradeHint"));

/* ================================================================== */
console.log("\nThe reel's own search: its filters are the server's filters");

const cases: { label: string; state: Parameters<typeof buildReelSearchFilters>[0] }[] = [
  { label: "name only", state: { name: "Aarti", band: null, city: null, verifiedOnly: false } },
  { label: "every control on", state: { name: "Rohit Sharma", band: 1, city: "Jaipur", verifiedOnly: true } },
  { label: "open-ended age band", state: { name: "", band: 3, city: null, verifiedOnly: false } },
  { label: "city chip only", state: { name: "", band: null, city: "Delhi", verifiedOnly: false } },
];

for (const c of cases) {
  const parsed = parseDiscoverFilters(buildReelSearchFilters(c.state));
  check(`the server accepts what the sheet builds — ${c.label}`, parsed.ok, parsed.ok ? "" : parsed.message);
}

check(
  "an empty sheet asks for nothing at all",
  !hasReelSearchQuery({ name: "", band: null, city: null, verifiedOnly: false }),
);
check(
  "one typed letter is not a search",
  !hasReelSearchQuery({ name: "a", band: null, city: null, verifiedOnly: false }),
  `DISCOVER_NAME_MIN_CHARS is ${DISCOVER_NAME_MIN_CHARS}`,
);
check(
  "an untapped verified chip is not a stated preference",
  buildReelSearchFilters({ name: "Aarti", band: null, city: null, verifiedOnly: false }).verifiedOnly === undefined,
);
check(
  "the open-ended band has no invented ceiling",
  buildReelSearchFilters({ name: "", band: REEL_SEARCH_AGE_BANDS.length - 1, city: null, verifiedOnly: false })
    .maxAge === undefined,
);
check(
  "every band sits inside the catalog's age range",
  REEL_SEARCH_AGE_BANDS.every((b) => b.min >= DISCOVER_MIN_AGE && (b.max ?? DISCOVER_MAX_AGE) <= DISCOVER_MAX_AGE),
);

const header = source("components/reel/ReelHeader.tsx");
check(
  "the reel's search icon opens the sheet rather than leaving the deck",
  header.includes("onSearch()") && !/href="\/user\/discover"/.test(header),
);
check(
  "and the full filter set is still one tap away",
  source("components/reel/ReelSearchSheet.tsx").includes('href="/user/discover"'),
);

/* ================================================================== */
console.log("\nMeri List — the lanes are facts, and the like is private");

const tabs = source("components/reel/ReelTabs.tsx");
check(
  "the Compatible lens is gone (it claimed a judgement, not a fact)",
  !tabs.includes('"COMPATIBLE"') && !source("lib/contracts/reel.ts").includes("COMPATIBLE"),
);
check(
  "all four history lanes are in the rail",
  REEL_LANES.every((l) => tabs.includes(`${l}:`)),
  REEL_LANES.find((l) => !tabs.includes(`${l}:`)),
);

const likeSvc = source("lib/services/library/likeService.ts");
const likeApi = source("app/api/like/[profileId]/route.ts");
const library = source("lib/data/reelLibraryData.ts");
const admirer = source("lib/services/activity/admirerService.ts");

// The one rule of the private like: no code path turns it into a name for
// anybody except the person who made it. Every check below is one way that
// could quietly stop being true.
check("no service function answers who liked a profile", !/getLikers|whoLiked|likedByUsers/.test(likeSvc));
check("the like API exposes no read at all — only PUT, DELETE and the owner's reveal", !likeApi.includes("export async function GET"));
check("the received count is ownership-checked before it is returned", likeSvc.includes("profile.userId !== ownerUserId) return 0"));
check("so is the revealed-liker list", likeSvc.includes("profile.userId !== ownerUserId) return []"));
check("only a revealed like can ever carry a name", likeSvc.includes("revealedAt: { not: null }"));
check(
  // Fields, not prose: the service's own docstring names `likeFaces` as the
  // thing that must never exist, and a check that tripped on the warning would
  // be the second-most-annoying kind of failing test.
  "the activity snapshot has no likeFaces field — the names are not a plan feature",
  !admirer.includes("likeFaces:") && !admirer.includes("canSeeLikeIdentity"),
);
check(
  "a like never reaches matching or ranking",
  !source("lib/services/match/pipeline.ts").includes("profileLike") &&
    !source("lib/services/match/reelGenerator.ts").includes("profileLike"),
);
check("the reel card carries only the viewer's own like", source("lib/data/reelData.ts").includes("liked: likeStates.has"));

// The lanes themselves — each one is a row that exists, defined as the member
// defined it.
check(
  "VIEWED means only-viewed: interest either way, likes and shortlists are excluded",
  library.includes("const excluded = new Set([") &&
    library.includes("excludedByUser.map") &&
    library.includes("likes.map") &&
    library.includes("shortlists.map"),
);
check(
  // Since D-90 a chat can be opened by paying, with no Interest row anywhere,
  // so "they have an interest" no longer covers everyone you have talked to.
  "…and so is anybody this member has actually exchanged a message with",
  library.includes("messages: { some: {} }") && library.includes("chatted.map"),
  "someone you are talking to must not sit in a lane that means 'nothing happened'",
);
check(
  "the INTEREST lane is sent-only (received interest is answered on its own screen)",
  library.includes('where: { fromUserId: userId, status: { not: "WITHDRAWN" } }'),
);
check(
  // Since the lanes render real reel cards, they get the photo gate the same
  // way the reel does — by going through `buildCards`, which is the only
  // place `photoLockFor` is applied. A lane that built its own card would be
  // a second gate to keep right, and this is the check that forbids it.
  "every lane is built by the reel's own card builder, so it inherits the photo gate",
  library.includes("buildCards(") && source("lib/data/reelData.ts").includes("photoLockFor("),
);
check("and blocks, in both directions", library.includes("getBlockedUserIds(userId)"));
check(
  "filters run before the page is sliced, not after",
  library.indexOf("const eligible = await prisma.profile.findMany") < library.indexOf("const pageIds = ordered.slice"),
  "otherwise page two arrives mostly empty",
);
check("the library speaks search's own filter vocabulary", library.includes("DiscoverFilters"));
check(
  "browsing your own history is not plan-gated",
  !/isFeatureAvailable|advancedDiscovery/.test(source("app/api/reel/library/route.ts")),
);

/* ================================================================== */
console.log("\nGender is a floor, not a preference somebody forgot to state");

/**
 * The bug this section exists for: `candidateWhere` applied a gender filter
 * only when `partnerPreferences.lookingForGender` was set, and that column is
 * written only when a draft save happens to carry the member's own gender with
 * it. Every account that arrived by voice, by an older path, or that never
 * finished partner preferences had **no gender filter at all** — men were
 * dealt men. The fix is one shared fallback, and these checks are about it
 * staying shared: four separate surfaces decide who is put in front of whom,
 * and each one re-derived this rule locally at least once.
 */
const pipelineSrc = source("lib/services/match/pipeline.ts");
check(
  "the reel pool falls back to the other gender when none was stated",
  pipelineSrc.includes("prefs?.lookingForGender ?? oppositeGender(viewer.gender)"),
);
check(
  "…and nothing puts the filter behind a bare `if stated` again",
  !/\?\.lookingForGender \? \{ gender:/.test(pipelineSrc),
);
check(
  "counting the pool uses the same where as reading it, so the gender floor is in the count too",
  functionBody(pipelineSrc, "countCandidatePool").includes("candidateWhere("),
);
check(
  "the live event's pairing applies the same fallback",
  source("lib/services/circle/pairingService.ts").includes("?? oppositeGender(viewer.gender)"),
);
check(
  "a paid Spotlight card cannot reach a viewer the reel would refuse to deal it to",
  source("lib/services/spotlight/audience.ts").includes("gender: oppositeGender(advertiser.gender)"),
  "money may widen who sees you, never past what the viewer is looking for",
);
check(
  "the demand meter counts the people the floor actually puts you in front of",
  source("lib/services/demand/demandService.ts").includes("gender: oppositeGender(myGender)"),
  "otherwise it under-reports every seeker who never filled the field in",
);
check(
  "there is one oppositeGender in the matching path, not a copy per service",
  !source("lib/services/discovery/discoverySearchService.ts").includes("function oppositeGender"),
);
check(
  "the two lanes that still offer a decision obey the same floor",
  library.includes("function genderWhere") && library.includes('lane !== "VIEWED" && lane !== "LIKED"'),
);
check(
  "…and Interest/Messages do not, because those are records of what happened",
  library.includes("genderWhere(lane, viewer)") && !library.includes('lane === "MESSAGE" ? { gender'),
);

/* ================================================================== */
console.log("\nA finished pool is a door, not a full stop");

const endCard = source("components/reel/ReelEndDiscovery.tsx");
const dashboard = source("app/user/dashboard/page.tsx");
check(
  "the closing card offers the history lanes by name and count",
  endCard.includes("const doors = REEL_LANES.filter") && endCard.includes("onOpenLane(lane)"),
);
check(
  "…and offers only the lanes that hold somebody",
  endCard.includes("(laneCounts[lane] ?? 0) > 0"),
  "a row of zeroes is four more dead ends",
);
check(
  "the dashboard never prints 'aapke liye 0 rishtey'",
  dashboard.includes("reel.waiting > 0 ?"),
);
check(
  "…and when the pool is empty it links into the lane, not back into an empty deck",
  dashboard.includes('"/user/reel?tab=VIEWED"'),
);
check(
  "a ?tab= link is resolved against the real tab list rather than trusted",
  source("app/user/reel/page.tsx").includes("REEL_TABS.find("),
);

/* ================================================================== */
console.log("\nWidening the search is said out loud");

const reelData = source("lib/data/reelData.ts");
check(
  "a card outside the viewer's stated age range says so",
  reelData.includes("function outsideStatedAge"),
);
check(
  "…on any state, including a card that still has a real preference score",
  reelData.includes('if (state === "COMPARABLE") return { state, score, note: widened }'),
  "the widening happens most often exactly where a score still exists",
);
check(
  "…and it is computed from the live profiles, not stored on the reel row",
  // A column, not the word — "widened" appears in schema prose about the
  // pool fallback, which is the thing being described rather than stored.
  !/^\s+widened\s+\w/m.test(source("prisma/schema.prisma")) &&
    reelData.includes("ageFromDate(candidate.dateOfBirth)"),
  "a member who widens their own range tomorrow must stop seeing the line",
);

/* ================================================================== */
console.log(`\n${failures === 0 ? `PASS — ${checks} checks` : `FAIL — ${failures} of ${checks} checks`}`);
process.exit(failures === 0 ? 0 : 1);
