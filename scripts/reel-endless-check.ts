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
import { mixSeenIntoFresh } from "../lib/data/reelData";
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
  "exhausted is set from nobody-left, not from a short batch",
  /addedProfileIds\.length === 0 && seenPage\.cards\.length === 0\)/.test(data),
  "since D-92 it means both halves of the feed are finished, not just the new one",
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
  library.indexOf("const eligibleIds = await eligibleLaneIds") < library.indexOf("const pageIds = ordered.slice"),
  "otherwise page two arrives mostly empty",
);
check("the library speaks search's own filter vocabulary", library.includes("DiscoverFilters"));

/* ------------------------------------------------------------------ */
/**
 * The number on a lane and the lane itself must be the same question.
 *
 * Reported 2026-09-21 as "numbers dikh rahe hain, profiles load nahi ho
 * rahi", and it was two independent versions of one mistake:
 *
 *  1. The pill counted rows straight out of the activity tables while the page
 *     ran the same ids through visibility, blocks and the gender floor — so a
 *     member whose history predates that floor was offered a door marked 6
 *     that opened onto 4 people, or onto none at all.
 *  2. The screen kept **one** set of "cards I have moved past" for the deck and
 *     all four lanes. Every lane is defined by something the member already
 *     did, so the people they had just swiped past in For You were exactly the
 *     newest rows of Viewed — and the shared set hid every one of them behind
 *     a pill still printing the server's true count.
 */
check(
  "the pill count and the lane page share one eligibility rule",
  functionBody(library, "getLaneCounts").includes("eligibleLaneIds(") &&
    functionBody(library, "getLibraryPage").includes("eligibleLaneIds("),
  "a count that skips the lane's own filters is a door onto an empty room",
);
check(
  "…so the count cannot go back to counting raw activity rows",
  !functionBody(library, "getLaneCounts").includes("prisma.profileLike.count"),
);
check(
  "a lane keeps its own position, separate from the deck's",
  stack.includes("const [laneDecided, setLaneDecided]") &&
    stack.includes("laneCards.filter((c) => !laneDecided.has(c.id))"),
  "one shared set means the people you just swiped past are missing from Viewed",
);
check(
  "…and re-opening a lane starts at the top of it",
  /setLaneDecided\(new Set\(\)\);\s*\n\s*setLaneBack\(\[\]\);/.test(stack),
  "otherwise a lane walked to the end stays empty for the rest of the session",
);
check(
  "going back is navigation: no direction, no network call",
  stack.includes("function goBack()") &&
    !/function goBack\(\)[\s\S]{0,600}?(logSwipe|fetch\()/.test(stack),
  "a Back that re-swipes is the accident it exists to remove",
);
check(
  // The whole reason the lanes exist is that these people were already
  // decided on. A drag there walks the list — left for the next person, right
  // for the previous one — and only a button, which carries a label, writes.
  "inside a lane a drag navigates and never decides",
  stack.includes("if (!meta.wasButton || direction === \"LEFT\")") &&
    stack.includes("if (direction === \"RIGHT\") goBack();"),
  "a wordless gesture must not be able to tell somebody you are interested",
);
check(
  "…and the card comes back rather than flying off when it does",
  stack.includes("staysPut={lane ? LANE_STAYS_PUT : c.matchId ? MATCHED_STAYS_PUT : undefined}") &&
    source("components/reel/ReelCard.tsx").includes("staysPut.includes(direction)"),
);
check(
  "a lane adds no third row of chrome over the photograph",
  !stack.includes("ReelLaneFilterBar") && !fs.existsSync("components/reel/ReelLaneFilterBar.tsx"),
  "the lane filter rail was removed 2026-09-21 — search lives in the header",
);
check(
  "…and it is offered on every surface, including one walked past its last card",
  stack.includes("{canGoBack && (") &&
    stack.indexOf("{canGoBack && (") < stack.indexOf("On top of everything, always in the same place"),
);
check(
  "Back cannot be mistaken for un-sending: an interest already sent is never re-sent",
  stack.includes('if (direction === "RIGHT" && (sentIds.has(target.id) || target.lastDecision === "RIGHT"))'),
  "and since D-92 that includes a card the feed brought round again days later",
);
check(
  "…and re-deciding the same way writes no second row",
  stack.includes("const repeat = previousDecision === direction") &&
    stack.includes("const result = repeat ? null : await logSwipe("),
);
check(
  // `.reel-glass` sets `position: relative` in unlayered CSS, which beats
  // Tailwind's layered `absolute`. Put both on one element and the chip
  // rejoins the normal flow — off the top of the screen whenever a card is up.
  "the floating Back chip takes its position from a wrapper, not from reel-glass",
  !/absolute[^"']*reel-glass|reel-glass[^"']*absolute/.test(stack),
  "an unlayered position: relative silently wins over the utility",
);
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
console.log("\nD-92 — up and down are the feed; left and right are the decisions");

/**
 * The ask, in Devesh's words (2026-09-22): "Instagram ki tarah upar niche se
 * swipe ho, niche swipe karne se Grio open hota hai usko hata do… sare dekhe
 * reels — jo dekhe hain aur jo naye hain — sab ek hi For You tab me."
 *
 * Two rules, and both are the kind that rot quietly:
 *
 *  1. **No wordless gesture may act on somebody.** The vertical axis walks the
 *     deck and writes nothing but a view. Ask Grio and Shortlist live on their
 *     buttons, where a label makes the tap consent.
 *  2. **For You is the whole feed.** New rishtey and already-seen ones, mixed
 *     by the server. The easiest regression is somebody "fixing" the repeat by
 *     filtering seen cards back out — which is the old bug, not a fix.
 */

const card = source("components/reel/ReelCard.tsx");
const verticalBranch = 'if (!meta.wasButton && (direction === "UP" || direction === "DOWN"))';
check(
  "a vertical drag navigates and decides nothing",
  stack.includes(verticalBranch) &&
    /if \(direction === "DOWN"\) goBack\(\);\s*\n\s*else advance\(target, "UP", meta\);/.test(stack),
);
check(
  "…and it is answered before any decision path can see the gesture",
  stack.indexOf(verticalBranch) > 0 &&
    stack.indexOf(verticalBranch) < stack.indexOf('if (!meta.wasButton || direction === "LEFT")'),
  "a surface that checked itself first could keep the old meaning",
);
check(
  "no gesture opens Grio any more — only the button reaches askGrioAbout",
  stack.indexOf(verticalBranch) < stack.indexOf("askGrioAbout(target)") &&
    !/if \(direction === "UP"\) \{\s*\n\s*askGrioAbout\(target\);/.test(stack),
);
check(
  "the card leaves upward when the feed moves on",
  /departing === "UP"\s*\n?\s*\? \{ x: x\.get\(\) \+ v\.x \* 0\.15, y: -vh \}/.test(card) &&
    card.includes("if (departing) {"),
  "UP used to be the one direction that never flew — it was Ask Grio",
);
check(
  "going back brings the previous card down from the top",
  card.includes('enter === "TOP" ? -viewportHeight() : 0') &&
    stack.includes("setRestoredId(id)") &&
    stack.includes('enter={restoredId === c.id ? "TOP" : null}'),
);
check(
  "…so the card being left behind springs back rather than flying off",
  card.includes('const STAYS_PUT_DEFAULT: readonly ReelSwipeDirection[] = ["DOWN"]'),
  "with nothing behind it that spring-back is also the top of the feed",
);
check(
  "a card scrolled past is recorded as a view, never as a decision",
  /if \(!lane\) void logSwipe\(card\.id, "UP", meta\);/.test(stack),
);
check(
  "…and a view still teaches the ranking nothing",
  /direction: \{ in: \["LEFT", "RIGHT", "DOWN"\] \}/.test(source("lib/services/discovery/behaviorLearning.ts")),
  "scrolling is not taste — behaviour learning must keep ignoring UP rows",
);
check(
  "the vertical keys move through the feed, in a lane too",
  /if \(e\.key === "ArrowUp" \|\| e\.key === "ArrowDown"\)/.test(stack) &&
    !/ArrowUp: "UP"/.test(stack),
);
check(
  "the desktop legend teaches the gestures that exist",
  /keyNext", "↑ Next profile"/.test(source("components/reel/ReelFrame.tsx")) &&
    !/reel\.frame\.key(AskGrio|Shortlist)/.test(source("components/reel/ReelFrame.tsx")),
);

const seenDeck = source("lib/data/reelSeenDeck.ts");
check(
  "For You is served as two streams mixed, not one",
  functionBody(data, "getReelData").includes("mixSeenIntoFresh(freshCards, seenPage.cards)") &&
    functionBody(data, "getMoreReelCards").includes("mixSeenIntoFresh(freshCards, seenPage.cards)"),
);
check(
  "the pool of new rishtey is now everybody never seen, in any sense",
  /swipedBy: \{ none: \{ actorUserId: viewer\.userId \} \}/.test(source("lib/services/match/pipeline.ts")),
  "an UP row used to leave somebody eligible to be dealt again tomorrow",
);
check(
  "the seen half is built by the reel's own card builder, minus the day's missions",
  seenDeck.includes("buildCards(userId, viewer, sources, t, undefined, false)"),
  "same photo gate, same live re-score, no made-up numbers",
);
check(
  "…and it leaves out an interest that is still waiting for an answer",
  seenDeck.includes("const pendingInterest"),
  "that rishta has an open question on /user/interests — a browsing deck is not a second place to answer it",
);
check(
  "…and obeys the same gender floor the deck does",
  seenDeck.includes("function genderWhere") && seenDeck.includes("oppositeGender("),
);
check(
  "…and walks the history oldest-first, so a face is not back in ninety seconds",
  seenDeck.includes("_min: { createdAt: true }") &&
    seenDeck.includes("(a._min.createdAt?.getTime() ?? 0) - (b._min.createdAt?.getTime() ?? 0)"),
);
check(
  "…and a face just looked at is held back, so the feed can actually end",
  seenDeck.includes("const SEEN_COOLDOWN_MS") &&
    seenDeck.includes("(s._max.createdAt?.getTime() ?? 0) < cutoff") &&
    stack.includes("if (fresh.length === 0) setExhausted(true);"),
  "every scroll writes a view, so without this the seen half hands back what the screen already holds — forever",
);
check(
  "the seen half pages by a cursor the screen hands straight back",
  stack.includes("body: JSON.stringify({ seenCursor })") &&
    source("app/api/reel/more/route.ts").includes("typeof value === \"string\"") &&
    source("lib/contracts/reel.ts").includes("seenCursor: string | null"),
);
check(
  "'New' means new to this member, not a profile that registered this month",
  stack.includes("return !card.seenBefore;") && !/^\s*isNew:/m.test(source("lib/contracts/reel.ts")),
);

/* The mixer itself — the one piece of this with real logic in it. */
const mixFresh = ["f1", "f2", "f3", "f4", "f5", "f6"];
const mixSeen = ["s1", "s2"];
const mixed = mixSeenIntoFresh(mixFresh, mixSeen);
check(
  "the mix is fresh-led but a seen card lands inside the first screenful",
  mixed.slice(0, 3).join(",") === "f1,f2,s1",
  mixed.join(","),
);
check(
  "…and nobody is dropped or duplicated by the mixing",
  mixed.length === mixFresh.length + mixSeen.length && new Set(mixed).size === mixed.length,
);
check(
  "…and one stream running out just lets the other continue",
  mixSeenIntoFresh([], ["s1", "s2"]).join(",") === "s1,s2" &&
    mixSeenIntoFresh(["f1", "f2"], []).join(",") === "f1,f2" &&
    mixSeenIntoFresh([], []).length === 0,
);

/* ================================================================== */
console.log("\nD-92c — Shortlist is a lane, not just a button");

/**
 * "Agar koi shortlist karna chahta hai to wah ek tab Shortlist ke naam se bhi
 * honi chahiye" (Devesh, 2026-09-22).
 *
 * The reel pushes the Shortlist button harder than anything except Interest,
 * and until now the pile it filled had no door on this screen at all — it
 * lived on `/user/shortlist`, which a member browsing a full-bleed reel cannot
 * see. A lane is the honest place for it: it is a row that exists, the same
 * card renders in it, and it still offers a decision (an interest can follow a
 * shortlist days later).
 */
check(
  "Shortlist is one of the reel's lanes, between the other save and the sends",
  REEL_LANES.join(",") === "VIEWED,LIKED,SHORTLIST,INTEREST,MESSAGE",
  REEL_LANES.join(","),
);
check(
  "…backed by its own rows, newest first",
  library.includes('if (lane === "SHORTLIST") {') && library.includes("prisma.shortlist.findMany({"),
);
check(
  "…and it still offers a decision, so it gets the deck's full button bar",
  stack.includes('const laneDecides = lane === "VIEWED" || lane === "LIKED" || lane === "SHORTLIST";'),
);
check(
  "…with a line it can prove, and a sentence when it is empty",
  library.includes('t("reel.library.note.shortlisted"') && stack.includes('"reel.library.empty.shortlist"'),
);
check(
  "…and shortlisting from a card moves its pill in the same breath",
  stack.includes('SHORTLIST: direction === "DOWN" ? c.SHORTLIST + 1 : c.SHORTLIST,'),
  "otherwise a member taps Shortlist and watches the tab keep saying 0",
);
check(
  "Viewed still means nothing-happened, so a shortlisted person is not in both",
  library.includes("prisma.shortlist.findMany({ where: { userId }, select: { targetProfileId: true } })"),
);

/* ================================================================== */
console.log("\nD-92b — a way out, a matched card, and an end worth reaching");

/**
 * Three asks from the same conversation (Devesh, 2026-09-22):
 *
 *  1. "Not now button ki jagah dashboard par jane wala button" — the reel is
 *     full-bleed, so it had no way back to the rest of the app at all.
 *  2. "Jab match ho jaye to wah reels bhi dikhani chahiye… messages kar sakta
 *     hai us profile ko" — a matched person belongs in the feed, with the chat
 *     on the card instead of an interest that was already accepted.
 *  3. "Jab reels khatm ho jaye to jo profile wale card usne fill nahi kiye, wo
 *     aa jaye" — the end of the feed is the moment to finish your own profile.
 */

const bar = source("components/reel/ReelActionBar.tsx");
const rail = source("components/reel/ReelUtilityRail.tsx");
const details = source("components/reel/ReelDetailsSheet.tsx");
const endCardSrc = source("components/reel/ReelEndDiscovery.tsx");
const cardSrc = source("components/reel/ReelCard.tsx");

check(
  "the reel has a way back to the rest of the app",
  bar.includes('href: "/user/dashboard"'),
  "a full-bleed screen with no header and no nav needs one on the card itself",
);
check(
  "…and it is a link, not a fifth thing that can decide somebody",
  bar.includes("<Link") && !bar.includes('t("reel.actionBar.notNow"'),
);
check(
  '"Not now" keeps a labelled click-equivalent (§4.5)',
  details.includes('onAction("LEFT")') && details.includes('t("reel.details.notNow"'),
  "the left swipe still writes a taste signal, so it may not become gesture-only",
);
check(
  "a matched card offers the chat where the interest used to be",
  bar.includes("matchId?: string | null"),
);
check(
  "…in the bar, the rail and the details sheet, all from one field",
  bar.includes("`/user/messages/${matchId}`") &&
    rail.includes("`/user/messages/${matchId}`") &&
    details.includes("`/user/messages/${card.matchId}`"),
);
check(
  "…and that field is built once, with the photo gate's own rows",
  data.includes("const matchIds = new Map(matches.map(") &&
    !source("lib/data/reelLibraryData.ts").includes("matchIdByUser"),
  "the lanes used to run a second match query of their own",
);
check(
  "a matched card decides nothing by drag, and claims nothing by badge",
  stack.includes('const MATCHED_STAYS_PUT: readonly ReelSwipeDirection[] = ["LEFT", "RIGHT", "DOWN"]') &&
    stack.includes('if (target.matchId && (direction === "LEFT" || direction === "RIGHT")) return;') &&
    cardSrc.includes("{draggable && !card.matchId && ("),
);
check(
  "…and it says so on the card",
  cardSrc.includes('MATCH: t("reel.card.matched"'),
);
check(
  "matches lead the half of the feed that brings people back",
  seenDeck.includes("return { ids: [...matchedIds, ...seen], matched };"),
);
check(
  "…and a match is not filtered out by a preference",
  seenDeck.includes("matched.has(id) || rightGender.has(id)"),
  "hiding a live rishta behind the gender floor rewrites history rather than fixing a feed",
);
check(
  "a reply can announce itself on a screen that has no header",
  tabs.includes("unreadMessages") &&
    stack.includes("unreadMessages={data.unreadMessages}") &&
    data.includes("prisma.message.count({"),
);
check(
  "the end of the feed opens the member's own deck",
  stack.includes('dynamic(() => import("@/components/profile/SmartProfileDeck")') &&
    stack.includes("only={data.profileGaps}"),
  "the same deck /profile/build uses — not a copy of it",
);
check(
  "…once, and only when something is genuinely missing",
  stack.includes("if (!feedOver || gapOffered.current || data.profileGaps.length === 0) return;"),
  "a deck that re-opens every time it is closed is a trap",
);
check(
  "…and the closing card can get back to it",
  endCardSrc.includes("onCompleteProfile") && endCardSrc.includes('t("reel.end.gapsCta"'),
);
check(
  "the offer is a finishable number of cards, not the whole catalog",
  data.includes("export const REEL_END_GAP_CARDS = 8") &&
    data.includes("missingFullFields.slice(0, REEL_END_GAP_CARDS)"),
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
  // The card used to link into `?tab=VIEWED` to find the people worth a second
  // look. D-92 put them in For You itself, so the reel opens where the member
  // expects it to and they are already in the deck.
  "…and it opens the reel on For You, because the seen faces are in there now",
  !dashboard.includes('"/user/reel?tab=VIEWED"') && dashboard.includes('href="/user/reel"'),
);
check(
  "a ?tab= link is resolved against the real tab list rather than trusted",
  source("app/user/reel/page.tsx").includes("REEL_TABS.find("),
);

/* ================================================================== */
console.log("\nThe chips sit on somebody's photograph");

/**
 * Reported 2026-09-21 ("achha dikhe"): the shared-overlap chip was a
 * near-opaque cream pill with gold-700 text, which over a photo is both the
 * brightest thing on the card and the palette's lowest-contrast pairing. The
 * app's own rule is that gold is a detail on a dark ground, never a fill, and
 * that is what these two protect.
 */
const overlay = source("components/reel/ReelProfileOverlay.tsx");
check(
  "no light fill over the photo — the chips are the reel's own dark glass",
  !/bg-gold-50|bg-white(?!\/)/.test(overlay) && overlay.includes("backdrop-blur-md"),
);
check(
  "shared and plain chips share one geometry, so the row reads as a set",
  overlay.includes("One geometry for both kinds"),
);
check(
  "a card never prints the same word twice (location line vs 'Same city')",
  overlay.includes("const echoesMeta"),
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
