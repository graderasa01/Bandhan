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
import {
  FEED_QUESTION_EVERY,
  FEED_QUESTION_FIELDS,
  FEED_QUESTION_FIRST_AFTER,
  FEED_QUESTION_MAX_PER_VISIT,
  NEVER_A_FEED_QUESTION,
  feedQuestionDue,
} from "../lib/reel/feedQuestions";
import { feedQuestionsFrom } from "../lib/reel/feedQuestionList";
import { FIELD_BY_KEY } from "../lib/profile/fields";

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

/**
 * The body of one function inside a component (`function onBack() { … }`), by
 * brace matching — `functionBody` only finds exports, and "what does this
 * handler write" is a question about one handler, not the whole file.
 */
function innerFunction(src: string, name: string): string {
  const start = src.indexOf(`function ${name}(`);
  if (start === -1) return "";
  // Past the parameter list first: its types may carry braces of their own.
  let depth = 0;
  let i = src.indexOf("(", start);
  for (; i < src.length; i++) {
    if (src[i] === "(") depth++;
    else if (src[i] === ")" && --depth === 0) break;
  }
  const open = src.indexOf("{", i);
  if (open === -1) return "";
  depth = 0;
  for (let j = open; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}" && --depth === 0) return src.slice(start, j + 1);
  }
  return "";
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
{
  const first = functionBody(generator, "getOrCreateTodayReel");
  const explainSrc = source("lib/services/match/explain.ts");
  check(
    "…but no AI call holds the reel's first paint — both run after the response",
    first.includes('afterResponse("match explanations"') &&
      first.includes('afterResponse("deep-profile recompute"') &&
      !/const explanations = await explainTopCandidates\(userId, viewerProfile, scored\)/.test(first) &&
      /aiReasonText: null,/.test(first),
    "a day the providers were out of quota was a minute or more of spinner before the first card",
  );
  check(
    "…only for the best-ranked few, one at a time, stopping at the first dead end",
    first.includes("scored.slice(0, AI_EXPLAINED_PER_REEL)") &&
      !/Promise\.all(Settled)?\(\s*scored\.map/.test(explainSrc) &&
      explainSrc.includes('if (outcome === "unavailable") break;'),
    "fifteen calls fired together cannot learn from each other's 429s — each walks the whole fallback chain",
  );
}
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
  stack.includes("const stillLooking = !lane && !current && !emptyPool && !exhausted;") &&
    stack.indexOf("if (!exhausted) {") > 0 &&
    stack.indexOf("if (!exhausted) {") < stack.indexOf("<ReelEndDiscovery"),
  "the status page answers 'still looking' first; the closing card is only what is left after it",
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

// Since the profile-first rebuild (2026-09-23) the header and the pill rail are
// one quiet top bar, and search is its right-hand icon.
const topBar = source("components/reel/ReelTopBar.tsx");
check(
  "the reel's search icon opens the sheet rather than leaving the deck",
  topBar.includes("onClick={onSearch}") &&
    !/href="\/user\/discover"/.test(topBar) &&
    stack.includes("onSearch={() => setSearchOpen(true)}"),
);
check(
  "and the full filter set is still one tap away",
  source("components/reel/ReelSearchSheet.tsx").includes('href="/user/discover"'),
);

/* ================================================================== */
console.log("\nMeri List — the lanes are facts, and the like is private");

// The lanes left the pill rail in the profile-first rebuild: they are one "My
// List" door on the top bar, opening a sheet that names each with its count.
const listSheet = source("components/reel/ReelListSheet.tsx");
check(
  "the Compatible lens is gone (it claimed a judgement, not a fact)",
  !topBar.includes('"COMPATIBLE"') && !source("lib/contracts/reel.ts").includes("COMPATIBLE"),
);
check(
  "every history lane has a door in My List, with its real count",
  REEL_LANES.every((l) => listSheet.includes(`${l}:`)) &&
    listSheet.includes("REEL_LANES.map((lane) =>") &&
    listSheet.includes("const count = counts[lane] ?? 0;") &&
    topBar.includes("onClick={onOpenList}"),
  REEL_LANES.find((l) => !listSheet.includes(`${l}:`)),
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
/*
 * The profile-first rebuild (2026-09-23) replaced the stack of cards with a
 * vertical pager (`ReelFeed`): previous, current and next are all mounted, a
 * drag moves the whole strip, and no card is ever thrown. What the checks
 * below protect did not change — Back is navigation, a lane is walked and not
 * decided, a decision is written once — only the code that says it.
 */
const feedSrc = source("components/reel/ReelFeed.tsx");
const backBody = innerFunction(stack, "onBack");
const advanceBody = innerFunction(stack, "onAdvance");
const notNowBody = innerFunction(stack, "notNow");
check(
  "going back is navigation: no direction, no network call",
  backBody.length > 0 && !/postSwipe|fetch\(|setDecisions/.test(backBody),
  "a Back that re-swipes is the accident it exists to remove",
);
check(
  // The whole reason the lanes exist is that these people were already
  // decided on. Moving through one writes nothing at all — not even a view,
  // since everybody in a lane has been seen by definition — and only a
  // button, which carries a label, decides.
  "inside a lane a drag navigates and never decides",
  /if \(lane\) return;\s*\n\s*if \(skipViewRow\.current\.delete\(id\)\) return;\s*\n\s*void postSwipe\(id, "UP"/.test(advanceBody) &&
    (advanceBody.match(/postSwipe\(/g) ?? []).length === 1,
  "a wordless gesture must not be able to tell somebody you are interested",
);
check(
  "…and nothing is ever thrown: the card owns no gesture of its own",
  !/\bdrag=|onPointerMove|onPan\b|useDrag|animate\(|staysPut/.test(source("components/reel/ReelCard.tsx")),
  "a card flying off the screen is the picture of a decision, and nothing was decided",
);
check(
  "a lane adds no third row of chrome over the photograph",
  !stack.includes("ReelLaneFilterBar") && !fs.existsSync("components/reel/ReelLaneFilterBar.tsx"),
  "the lane filter rail was removed 2026-09-21 — search lives in the top bar",
);
check(
  "…and it is offered on every surface, including one walked past its last card",
  stack.includes("const prevId = backStack[backStack.length - 1] ?? null;") &&
    stack.includes("const feedPrev: FeedPage | null = prevCard ? cardPage(prevCard) : null;") &&
    stack.includes("canPrev={Boolean(feedPrev)}"),
  "the page above comes from the back stack, whatever is on screen — the closing card has one too",
);
{
  // Interest on somebody who already has one from this member — because they
  // went back to look again, or because the feed brought the person round from
  // the seen half days later — says so and offers a note. It never sends again.
  const onInterestBody = innerFunction(stack, "onInterest");
  const already = 'if (ui === "sent" || ui === "syncing") {';
  const fromAlready = onInterestBody.slice(Math.max(0, onInterestBody.indexOf(already)));
  const alreadyBranch = fromAlready.slice(0, fromAlready.indexOf("return;"));
  check(
    "Back cannot be mistaken for un-sending: an interest already sent is never re-sent",
    onInterestBody.includes(already) &&
      alreadyBranch.length > 0 &&
      !/syncInterest|postSwipe|setInterestMap/.test(alreadyBranch) &&
      stack.includes('return card.interestSent ? "sent" : "idle";') &&
      data.includes("interestSent: interestSentTo.has(c.profile.userId)"),
    "and since D-92 that includes a card the feed brought round again days later",
  );
}
check(
  "…and re-deciding the same way writes no second row",
  notNowBody.includes('const repeat = decisions[card.id] === "LEFT";') &&
    notNowBody.includes('if (!repeat) void postSwipe(card.id, "LEFT"') &&
    (notNowBody.match(/postSwipe\(/g) ?? []).length === 1,
  "Not now → back → Not now is one decision, and the ranking must learn it once",
);
{
  // `.reel-glass` sets `position: relative` in unlayered CSS, which beats
  // Tailwind's layered `absolute`. Put both on one element and a floating
  // control rejoins the normal flow — off the top of the screen whenever a
  // card is up. Read across every reel component: the glass is all over them.
  const glassy = /absolute[^"']*reel-glass|reel-glass[^"']*absolute/;
  const offender = fs
    .readdirSync(path.join(process.cwd(), "components/reel"))
    .filter((f) => f.endsWith(".tsx"))
    .find((f) => glassy.test(source(`components/reel/${f}`)));
  check(
    "a floating control takes its position from a wrapper, not from reel-glass",
    offender === undefined,
    offender ? `${offender} — an unlayered position: relative silently wins over the utility` : "",
  );
}
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
console.log("\nD-92 — up and down are the feed; every decision is a labelled button");

/**
 * The ask, in Devesh's words (2026-09-22): "Instagram ki tarah upar niche se
 * swipe ho, niche swipe karne se Grio open hota hai usko hata do… sare dekhe
 * reels — jo dekhe hain aur jo naye hain — sab ek hi For You tab me."
 *
 * Two rules, and both are the kind that rot quietly:
 *
 *  1. **No wordless gesture may act on somebody.** The vertical axis walks the
 *     deck and writes nothing but a view. Ask Grio and Shortlist live on their
 *     buttons, where a label makes the tap consent. Since the profile-first
 *     rebuild (2026-09-23) the other axis obeys the same rule: sideways walks
 *     the current person's photos, and Interest and Not now are buttons too —
 *     dragging right to look at an earlier photo used to tell a family you
 *     were interested.
 *  2. **For You is the whole feed.** New rishtey and already-seen ones, mixed
 *     by the server. The easiest regression is somebody "fixing" the repeat by
 *     filtering seen cards back out — which is the old bug, not a fix.
 */

check(
  "a vertical drag navigates and decides nothing",
  /if \(dir === 1\) latest\.current\.onAdvance\(\);\s*\n\s*else latest\.current\.onBack\(\);/.test(feedSrc) &&
    stack.includes("onAdvance={onAdvance}") &&
    stack.includes("onBack={onBack}"),
);
check(
  "…and the feed has no way to decide anything: it moves, and the screen writes",
  !/fetch\(|postSwipe|logSwipe|"RIGHT"|"LEFT"|onInterest|onSave|notNow/.test(feedSrc),
  "a pager that can send an interest is a gesture that can send one",
);
check(
  "sideways walks the photos — the axis that used to send an interest decides nothing either",
  feedSrc.includes("latest.current.onPhotoStep(projected < 0 ? 1 : -1);") &&
    stack.includes("onPhotoStep={(dir) => (onScreen ? (photoControl.current?.step(dir) ?? false) : false)}"),
  "dragging right to look at an earlier photo told a family you were interested",
);
{
  const grioCalls = stack.split("\n").filter((l) => l.includes("askGrioAbout(") && !l.includes("function askGrioAbout("));
  check(
    "no gesture opens Grio any more — only a button reaches askGrioAbout",
    grioCalls.length > 0 && grioCalls.every((l) => l.includes("onAskGrio=")) && !/grio/i.test(feedSrc),
    grioCalls.find((l) => !l.includes("onAskGrio="))?.trim(),
  );
}
check(
  "the card leaves upward when the feed moves on",
  feedSrc.includes("const restFor = (p: number) => -p * heightRef.current;") &&
    feedSrc.includes("if (next) pages.push({ page: next, slot: pos + 1 });") &&
    feedSrc.includes("const target = restFor(posRef.current + dir);"),
  "the next person waits below, and the strip rises to meet them",
);
check(
  "going back brings the previous card down from the top",
  feedSrc.includes("if (prev) pages.push({ page: prev, slot: pos - 1 });"),
);
check(
  "…and at either end a drag springs back rather than moving to nothing",
  feedSrc.includes("if ((rel < 0 && !canNext) || (rel > 0 && !canPrev)) rel *= EDGE_RESISTANCE;") &&
    /else if \(projected > line && canPrev\) go\(-1, v\.y\);\s*\n\s*else springHome\(v\.y\);/.test(feedSrc),
  "with nothing behind it that spring-back is also the top of the feed",
);
check(
  "a card scrolled past is recorded as a view, never as a decision",
  advanceBody.includes('void postSwipe(id, "UP", { decisionMs: 0, wasButton: false });'),
);
check(
  "…and a view still teaches the ranking nothing",
  /direction: \{ in: \["LEFT", "RIGHT", "DOWN"\] \}/.test(source("lib/services/discovery/behaviorLearning.ts")),
  "scrolling is not taste — behaviour learning must keep ignoring UP rows",
);
check(
  "the arrow keys only move: ↑ ↓ through the feed (in a lane too), ← → through the photos",
  /case "ArrowUp":\s*\n\s*e\.preventDefault\(\);\s*\n\s*feedRef\.current\?\.next\(\);/.test(stack) &&
    /case "ArrowDown":[\s\S]{0,120}?feedRef\.current\?\.prev\(\);/.test(stack) &&
    /case "ArrowLeft":[\s\S]{0,120}?photoControl\.current\?\.step\(-1\);/.test(stack) &&
    /case "ArrowRight":[\s\S]{0,120}?photoControl\.current\?\.step\(1\);/.test(stack) &&
    !/ArrowUp: "UP"/.test(stack),
  "a key that decides by direction is a gesture with no label",
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
  // Since the rebuild a lane has no bar of its own: it deals the same card as
  // the feed, and the rail's own states say what is left to do (an Interest
  // already out reads "Sent", a match reads "Message").
  "…and it still offers a decision: a lane deals the feed's own card, rail and all",
  (stack.match(/<ReelCard\b/g) ?? []).length === 1 &&
    stack.includes("lane ? laneCards.filter((c) => !laneDecided.has(c.id))") &&
    !fs.existsSync("components/reel/ReelLaneActionBar.tsx"),
  "an interest can follow a shortlist days later, so the Interest button has to be there",
);
check(
  "…with a line it can prove, and a sentence when it is empty",
  library.includes('t("reel.library.note.shortlisted"') && stack.includes('"reel.library.empty.shortlist"'),
);
{
  const saveBody = innerFunction(stack, "onSave");
  check(
    "…and shortlisting from a card moves its pill in the same breath",
    saveBody.includes("SHORTLIST: c.SHORTLIST + 1") && saveBody.includes("SHORTLIST: Math.max(0, c.SHORTLIST - 1)"),
    "otherwise a member taps Save and watches the Shortlist lane keep saying 0",
  );
}
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

/*
 * Since the profile-first rebuild (2026-09-23) the first ask is answered by the
 * app rather than by the card: the reel runs in the shell's immersive mode,
 * where the bottom nav (mobile) and the sidebar (desktop) stay on screen, and
 * the Dashboard button that used to cost the action bar a slot went with it.
 */
const rail = source("components/reel/ProfileActionRail.tsx");
const identity = source("components/reel/ReelIdentity.tsx");
const moreSheet = source("components/reel/ReelMoreSheet.tsx");
const details = source("components/reel/ReelDetailsSheet.tsx");
const endCardSrc = source("components/reel/ReelEndDiscovery.tsx");
const reelPage = source("app/user/reel/page.tsx");
const appShell = source("components/layout/AppShell.tsx");
const immersiveAt = appShell.indexOf("if (immersive) {");
const immersiveShell = immersiveAt === -1 ? "" : appShell.slice(immersiveAt, appShell.indexOf("if (fullBleed) {", immersiveAt));

check(
  "the reel has a way back to the rest of the app",
  reelPage.includes("immersive={isLive}") &&
    !reelPage.includes("fullBleed") &&
    immersiveShell.includes("{sidebar && (") &&
    immersiveShell.includes("{bottomNav && ("),
  "a full-bleed reel dropped every piece of navigation, and members got stuck in it",
);
check(
  "…and it is the app's own nav, not a slot on the rail beside the decisions",
  !/\/user\/dashboard|href=/.test(rail),
  "a way out between Interest and Save is one thumb-slip from a decision",
);
check(
  '"Not now" keeps a labelled click-equivalent (§4.5)',
  details.includes("onClick={onNotNow}") &&
    details.includes('t("reel.details.notNow"') &&
    moreSheet.includes("onClick={onNotNow}") &&
    notNowBody.includes('"LEFT", { decisionMs: 0, wasButton: true }'),
  "the left swipe is gone, but the taste signal it wrote stays — on a button that says what it does",
);
check(
  "a matched card offers the chat where the interest used to be",
  stack.includes('if (matchIdFor(card)) return "matched";') &&
    /if \(ui === "matched"\) \{\s*\n\s*openMessage\(card\);/.test(stack) &&
    rail.includes('t("reel.rail.message"'),
);
check(
  "…on the rail and in the details sheet alike, all from one field",
  stack.includes("matchOverride[card.id] ?? card.matchId") &&
    stack.includes("interest: interestUi(card),") &&
    stack.includes('interest={details.target ? interestUi(details.target.card) : "idle"}') &&
    details.includes('case "matched":'),
  "two buttons for one person must never disagree about whether there is a rishta",
);
check(
  "…and that field is built once, with the photo gate's own rows",
  data.includes("const matchIds = new Map(matches.map(") &&
    !source("lib/data/reelLibraryData.ts").includes("matchIdByUser"),
  "the lanes used to run a second match query of their own",
);
check(
  // No drag decides anything for anybody (see D-92 above), so what is left to
  // guard on a matched card is the one labelled pass.
  "a matched card decides nothing: neither sheet offers it a Not now",
  stack.includes("details.target && !lane && !matchIdFor(details.target.card)") &&
    moreSheet.includes("onNotNow && !card.matchId"),
  "there is nothing left to pass on once both families have said yes",
);
check(
  "…and it says so on the card",
  /card\.matchId && \(/.test(identity) && identity.includes('t("reel.card.matched"'),
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
  topBar.includes("{unreadMessages > 0 && (") &&
    listSheet.includes('lane === "MESSAGE" && unreadMessages > 0') &&
    stack.includes("unreadMessages={data.unreadMessages}") &&
    data.includes("prisma.message.count({"),
);
check(
  "the end of the feed opens the member's own deck",
  stack.includes('dynamic(() => import("@/components/profile/SmartProfileDeck")') &&
    stack.includes("only={ownGaps}") &&
    stack.includes("data.profileGaps.filter((k) => !answeredOwn.has(k))"),
  "the same deck /profile/build uses — not a copy of it — less what the feed already asked",
);
check(
  "…once, and only when something is genuinely missing",
  stack.includes("if (!feedOver || gapOffered.current || ownGaps.length === 0) return;"),
  "a deck that re-opens every time it is closed is a trap",
);
check(
  "…and the closing card can get back to it",
  endCardSrc.includes("onCompleteProfile") && endCardSrc.includes('t("reel.end.gapsCta"'),
);
check(
  "the offer is a finishable number of cards, not the whole catalog",
  data.includes("export const REEL_END_GAP_CARDS = 8") &&
    data.includes("profileGaps: missingOwnFields.slice(0, REEL_END_GAP_CARDS)") &&
    data.includes("computeCompletion(viewer).missingFullFields.map((f) => f.key)"),
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
// The chips moved from the old overlay into `ReelIdentity` (the name block) in
// the profile-first rebuild; the rules came with them.
check(
  "no light fill over the photo — the chips are the reel's own dark glass",
  !/bg-gold-50|bg-white(?!\/)/.test(identity) && identity.includes("backdrop-blur-md"),
);
check(
  "shared and plain chips share one geometry, so the row reads as a set",
  identity.includes("One geometry for both kinds"),
);
check(
  "a card never prints the same word twice (location line vs 'Same city')",
  identity.includes("const echoesSummary"),
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
console.log("\nReel dekhte-dekhte profile — the member's own questions in the feed");

{
  const everything = [...FEED_QUESTION_FIELDS, ...NEVER_A_FEED_QUESTION, "aboutMe", "hobbies", "partnerCityPreference"];
  const asked = feedQuestionsFrom(everything, true);
  check(
    "only the short list is ever asked, in its own priority order",
    asked.map((q) => q.key).join() === FEED_QUESTION_FIELDS.filter((k) => asked.some((q) => q.key === k)).join() &&
      asked.every((q) => FEED_QUESTION_FIELDS.includes(q.key)),
    "a text box or a multi-select in the middle of a feed is a form, not a tap",
  );
  check(
    "caste, religion, gotra, manglik and income are never a feed question",
    feedQuestionsFrom(NEVER_A_FEED_QUESTION, true).length === 0 &&
      !FEED_QUESTION_FIELDS.some((k) => NEVER_A_FEED_QUESTION.includes(k)),
    "the app does not reach for these on the member's behalf (D-33)",
  );
  check(
    "every chip is a catalog value, so every tap is an answer the profile keeps",
    asked.length > 0 &&
      asked.every(
        (q) =>
          !q.multi &&
          FIELD_BY_KEY[q.key]?.type === "select" &&
          q.options.join("|") === (FIELD_BY_KEY[q.key]?.options ?? []).join("|"),
      ),
    "a chip outside the options ticks, moves on, and stores nothing (the Smart Deck trap)",
  );
  check(
    "an answered field is not asked",
    feedQuestionsFrom([], true).length === 0 && feedQuestionsFrom(["smoking"], true).map((q) => q.key).join() === "smoking",
  );
  check(
    "a parent running the account is asked about their child",
    feedQuestionsFrom(["smoking"], false)[0]?.question === FIELD_BY_KEY.smoking.questionForChild &&
      feedQuestionsFrom(["smoking"], true)[0]?.question === FIELD_BY_KEY.smoking.question,
  );

  const due = (passed: number, lastAt: number, shown: number, left = 5) => feedQuestionDue({ passed, lastAt, shown, left });
  check(
    `the first question comes after ${FEED_QUESTION_FIRST_AFTER} people, not before`,
    !due(FEED_QUESTION_FIRST_AFTER - 1, 0, 0) && due(FEED_QUESTION_FIRST_AFTER, 0, 0),
  );
  check(
    `the next one only ${FEED_QUESTION_EVERY} people later`,
    !due(FEED_QUESTION_FIRST_AFTER + FEED_QUESTION_EVERY - 1, FEED_QUESTION_FIRST_AFTER, 1) &&
      due(FEED_QUESTION_FIRST_AFTER + FEED_QUESTION_EVERY, FEED_QUESTION_FIRST_AFTER, 1),
  );
  check(
    `never more than ${FEED_QUESTION_MAX_PER_VISIT} a visit, and never with nothing left to ask`,
    !due(999, 0, FEED_QUESTION_MAX_PER_VISIT) && !due(999, 0, 0, 0),
  );
}

const questionPage = source("components/reel/ReelQuestionPage.tsx");
const listSrc = source("lib/reel/feedQuestionList.ts");
check(
  "a scroll past the question writes nothing — no view row, no answer",
  /if \(feedAsk\) \{\s*setFeedAsk\(null\);\s*return;\s*\}/.test(stack) &&
    stack.indexOf("if (feedAsk) {") < stack.indexOf('void postSwipe(id, "UP"') &&
    !questionPage.includes("postSwipe"),
  "D-92: a gesture has no words, so it decides nothing",
);
check(
  "never in a lane, and only ever between two people",
  /const feedAskDue =\s*!lane &&\s*!feedAsk &&\s*Boolean\(current\) &&\s*Boolean\(upNext\)/.test(stack),
);
check(
  "Grio, the backdrop and the keys act on the person on screen, never the one waiting under a question",
  stack.includes("const onScreen = feedAsk ? null : current;") &&
    stack.includes("backdropUrl={onScreen?.photoUnlocked") &&
    stack.includes("if (onScreen) onInterest(onScreen);") &&
    stack.includes("setPageProfile(onScreen ?"),
);
check(
  "a chip saves through the ordinary autosave as the member's own confirmed word",
  questionPage.includes('fetch("/api/profile/save-draft"') &&
    questionPage.includes('meta: { [question.key]: { source: "user", confirmed: true } }'),
);
check(
  "the feed moves on by itself only after a save landed, and only if the page is still on screen",
  questionPage.indexOf("if (!res.ok)") < questionPage.indexOf("setSaved(value)") &&
    questionPage.includes("if (activeRef.current) onNext();"),
  "moving on after a failed save would let the member believe an answer the server never got",
);
check(
  "no model call anywhere in it — the question is the catalog's own words",
  !/callAi|lib\/ai\//.test(questionPage + listSrc + source("lib/reel/feedQuestions.ts")),
);
check(
  "the field catalog stays out of the reel's bundle",
  !source("lib/reel/feedQuestions.ts").includes("lib/profile/fields") &&
    !questionPage.includes("feedQuestionList") &&
    !stack.includes("feedQuestionList"),
);
check(
  "one completion pass feeds both the end-of-feed deck and the feed questions",
  data.includes('feedQuestionsFrom(missingOwnFields, viewer.respondentType === "SELF")'),
);

/* ================================================================== */
console.log(`\n${failures === 0 ? `PASS — ${checks} checks` : `FAIL — ${failures} of ${checks} checks`}`);
process.exit(failures === 0 ? 0 : 1);
