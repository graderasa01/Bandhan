import "server-only";
import { prisma } from "@/lib/db/prisma";
import { PROFILE_FULL_INCLUDE } from "@/lib/services/profile/profileInclude";
import { computeCompletion } from "@/lib/services/profile/completionService";
import { computeTrustScore } from "@/lib/services/trust/trustScoreService";
import { buildIntelligenceState } from "@/lib/services/profile/intelligenceService";
import { listFamilyMembers } from "@/lib/services/family/familyService";
import { getExpectationGapReport } from "@/lib/services/family/familyExpectationService";
import { getOwnChart } from "@/lib/services/kundli/kundliMatch";
import { getPlanContext, isFeatureAvailable } from "@/lib/services/plans/entitlements";
import { getDiscoverySettings } from "@/lib/services/discovery/discoverySettingsService";
import {
  buildLearnedBehaviorProfile,
  countEligibleSwipes,
  MIN_DECISIONS,
} from "@/lib/services/discovery/behaviorLearning";
import { buildGrioRoster } from "./roster";
import { noopT, type Translate } from "@/lib/i18n/translate";

/**
 * Grio Samajh Map — the whole app as one canvas, drawn against this user's rows.
 *
 * ## The four questions
 *
 * A sitemap answers "what pages exist". This answers four others, and every
 * field on `MapNode` exists to serve one of them:
 *
 *   1. **Main abhi kahan hoon?** — `value` / `percent` / `state`, this user's
 *      own numbers, never a generic description.
 *   2. **Grio mere baare me kya jaanta hai?** — `grioReads` / `grioDoes` /
 *      `grioPrivate`, bounded per node because the boundary genuinely differs.
 *   3. **Agla useful step kya hai?** — `next`, one node, with a reason built
 *      from rows.
 *   4. **Is step se kya milega?** — `unlocks`, null once there is nothing left
 *      to gain, because "you already have this" is not a reward.
 *
 * ## Two labels and two lengths of explanation, on purpose
 *
 * The canvas renders every node as a bubble roughly 50px across with ~60px of
 * label under it, so a node needs a name that fits there (`short`) as well as
 * one that reads properly in a sentence (`label`). Same split for prose:
 * `note` is the one line that shows by default, and `does` / `why` / the three
 * Grio-boundary lines stay folded behind the eye until asked for. A canvas that
 * printed all five at once would be a document with circles on it.
 *
 * ## Why the copy is code and not a model call
 *
 * Same argument `briefing.ts` makes, and stronger here: this screen is read as
 * documentation. A model composing "aapki kundli adhoori hai kyunki janm-samay
 * nahi hai" would be right most of the time and confidently wrong the rest —
 * and a wrong explanation of *why a feature is locked* is something a user acts
 * on. Every sentence below is derived from a value read on this request.
 *
 * ## What it deliberately does not do
 *
 * **No score.** No "map completion 68%". The areas measure different things in
 * different units — the reason `bandhanJourney.ts` refuses to average its six.
 *
 * **No risky action.** A node carries `href` and `ask`, and nothing else.
 * Interest, voice notes and matchmaker requests keep their existing
 * confirmation flows; a canvas that could fire them would be a second,
 * unreviewed path to the same irreversible sends.
 *
 * **No ranking claim.** Grio explains order; the matching engine decides it.
 * Every Discovery node says so, because a guide that sounds like it picks
 * partners is the most misleading thing this screen could imply.
 */

export type NodeState = "done" | "partial" | "empty" | "locked";

export interface MapNode {
  id: string;
  /** Full name, for the note card and for screen readers. English chrome. */
  label: string;
  /** One or two words. What fits under a bubble. */
  short: string;
  /** The single line shown without asking. Never more than one sentence. */
  note: string;
  /** What this feature does. Behind the eye. */
  does: string;
  state: NodeState;
  /** Where this user stands, in this node's own units. Null when it has no meter. */
  value: string | null;
  /** 0..100 for a bar. Null when the node is not a progress at all. */
  percent: number | null;
  /** What moving this buys. Null once there is nothing left to move. */
  unlocks: string | null;
  /** The `Why?` answer — from this user's rows, never a template. */
  why: string;
  /** Grio's boundary here, stated three ways so it cannot be read as one. */
  grioReads: string;
  grioDoes: string;
  grioPrivate: string;
  /** Plan name when this needs one; null when free. */
  plan: string | null;
  locked: boolean;
  href: string;
  /** Seed text for Ask Grio — a question in the user's voice, not a command. */
  ask: string;
}

export type BranchId = "today" | "profile" | "trust" | "discovery" | "rishta" | "family";

export interface MapBranch {
  id: BranchId;
  label: string;
  short: string;
  subtitle: string;
  /** "3 of 4 set" — settled nodes, never a percentage of the branch. */
  summary: string;
  settled: number;
  nodes: MapNode[];
}

export interface GuidedJourney {
  id: string;
  label: string;
  nodeIds: string[];
}

export interface SamajhMap {
  branches: MapBranch[];
  next: { branchId: BranchId; nodeId: string; reason: string } | null;
  journeys: GuidedJourney[];
  totals: { settled: number; total: number };
}

/* ------------------------------------------------------------------ */

function pct(value: number, of: number): number {
  if (of <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((value / of) * 100)));
}

/**
 * A settled node is `done`. `locked` is neither settled nor a to-do: it appears
 * in no journey and is never `next`, because telling somebody their next step
 * is to pay is an upsell wearing a guide's clothes.
 */
function isSettled(node: MapNode): boolean {
  return node.state === "done";
}

/* ------------------------------------------------------------------ */

export async function buildSamajhMap(
  userId: string,
  /**
   * Defaults to `noopT` so the inline Hinglish stays the source language and an
   * untranslated key degrades to it rather than to a blank bubble.
   */
  t: Translate = noopT,
): Promise<SamajhMap | null> {
  const profile = await prisma.profile.findUnique({
    where: { userId },
    include: PROFILE_FULL_INCLUDE,
  });
  if (!profile) return null;

  const settings = await getDiscoverySettings(userId);
  const resetAt = settings.behaviorResetAt ? new Date(settings.behaviorResetAt) : null;

  const [
    user,
    intelligence,
    family,
    gaps,
    chart,
    planCtx,
    swipeCounts,
    learned,
    photos,
    // `generateReel: false` — a map is not a request for today's reel. The
    // briefing may generate one because "what does today look like" *is* that
    // request; opening a diagram is not, and running the L0-L2 pipeline behind
    // it would put reel generation on the latency path of a page that only
    // wants to say how many cards are left.
    roster,
    interestsSent,
    interestsPending,
    matches,
    shortlisted,
    inboundQuestions,
    // Gated exactly as the Vibe Hub itself is — `mindsetArena` is a rollout
    // flag, not a `PlanFeatureSet` key, so it has to be resolved rather than
    // read off the plan. Same call `briefing.ts` makes before it dares mention
    // today's poll.
    vibeGate,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { mobileVerifiedAt: true, emailVerifiedAt: true },
    }),
    buildIntelligenceState(profile),
    listFamilyMembers(userId).catch(() => []),
    getExpectationGapReport(userId).catch(() => null),
    getOwnChart(userId).catch(() => null),
    getPlanContext(userId),
    countEligibleSwipes(userId, resetAt).catch(() => ({ total: 0, positive: 0 })),
    settings.behaviorLearningEnabled ? buildLearnedBehaviorProfile(userId).catch(() => null) : null,
    prisma.profilePhoto.count({
      where: { profileId: profile.id, verificationStatus: "APPROVED", deletedAt: null },
    }),
    buildGrioRoster(userId, { generateReel: false }).catch(() => ({ entries: [], reelLeft: 0, reelTotal: 0 })),
    prisma.interest.count({ where: { fromUserId: userId } }),
    prisma.interest.count({ where: { toUserId: userId, status: "PENDING" } }),
    prisma.match.findMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
      select: { id: true, messages: { select: { senderId: true }, take: 50 } },
    }),
    prisma.shortlist.count({ where: { userId } }),
    prisma.profileQuestion.count({
      where: { toUserId: userId, status: "PENDING", moderation: "APPROVED", expiresAt: { gt: new Date() } },
    }),
    isFeatureAvailable(userId, "mindsetArena").catch(() => ({ allowed: false, reason: "plan" as const })),
  ]);

  const completion = computeCompletion(profile);
  const trust = user ? computeTrustScore(user, profile, t) : null;
  const trustScore = trust?.trustScore ?? null;

  // "Both sides spoke" — the same test `bandhanJourney` and `deriveStage` use
  // for TALKING, restated rather than approximated, so the map and the journey
  // can never disagree about whether a conversation exists.
  const talking = matches.filter(
    (m) => m.messages.some((x) => x.senderId === userId) && m.messages.some((x) => x.senderId !== userId),
  ).length;

  const mobileVerified = Boolean(user?.mobileVerifiedAt);
  const emailVerified = Boolean(user?.emailVerifiedAt);
  const verifiedCount = (mobileVerified ? 1 : 0) + (emailVerified ? 1 : 0);

  const layersDone = intelligence.progress.completedLayers;
  const layersTotal = intelligence.progress.totalLayers;
  const familyAnswered = gaps?.respondents.length ?? 0;

  const advanced = planCtx.features.advancedDiscovery;
  const behaviourActive = Boolean(learned);
  const decisions = swipeCounts.total;
  const chartPrecision = chart?.precision ?? null;

  /* ---------------- Aaj ---------------- */

  const todayNodes: MapNode[] = [
    {
      id: "dashboard",
      label: t("grioMap.dashboard.label", "Today"),
      short: t("grioMap.dashboard.short", "Aaj"),
      note: t("grioMap.dashboard.note", "Aaj kya karna hai, ek jagah — sabse zaroori kaam sabse upar."),
      does: t("grioMap.dashboard.does", "Aapke aaj ke sabse zaroori kaam tarteeb se — kaun intezaar kar raha hai, kya baaki hai."),
      state: "done",
      value: t("grioMap.dashboard.value", "roz khulta hai"),
      percent: null,
      unlocks: null,
      why: t("grioMap.dashboard.why", "Ye aapka pehla screen hai. Yahan har cheez asli ginti se aati hai — koi sujhav banaya nahi jaata."),
      grioReads: t("grioMap.dashboard.grioReads", "Wahi jo aapko dikh raha hai."),
      grioDoes: t("grioMap.dashboard.grioDoes", "Bata sakta hai ki koi kaam upar kyun hai."),
      grioPrivate: t("grioMap.dashboard.grioPrivate", "Kisi doosre ka dashboard Grio nahi dekhta."),
      plan: null,
      locked: false,
      href: "/user/dashboard",
      ask: t("grioMap.dashboard.ask", "Aaj mera sabse zaroori kaam kya hai?"),
    },
    {
      id: "reel",
      label: t("grioMap.reel.label", "Daily Reel"),
      short: t("grioMap.reel.short", "Reel"),
      note:
        roster.reelTotal === 0
          ? t("grioMap.reel.note", "Aaj ka reel abhi nahi bana.")
          : roster.reelLeft === 0
            ? t("grioMap.reel.note3", "Aaj ke sab rishtey dekh liye.")
            : t("grioMap.reel.note4", "{0} rishtey aaj abhi baaki hain.").replace("{0}", String(roster.reelLeft)),
      does: t("grioMap.reel.does", "Roz ke chune hue rishtey, ek-ek karke — matching engine ke banaye order me."),
      state: roster.reelTotal === 0 ? "empty" : roster.reelLeft === 0 ? "done" : "partial",
      value:
        roster.reelTotal === 0
          ? t("grioMap.reel.value", "nahi bana")
          : roster.reelLeft === 0
            ? t("grioMap.reel.value3", "sab dekh liye")
            : t("grioMap.reel.value4", "{0} of {1} baaki").replace("{0}", String(roster.reelLeft)).replace("{1}", String(roster.reelTotal)),
      percent: roster.reelTotal === 0 ? 0 : pct(roster.reelTotal - roster.reelLeft, roster.reelTotal),
      unlocks: roster.reelLeft > 0 ? t("grioMap.reel.unlocks", "Har faisla agle din ka Reel behtar karta hai.") : null,
      why:
        roster.reelTotal === 0
          ? t("grioMap.reel.why", "Aaj ka reel abhi taiyar nahi hua. Profile poori ho to roz apne aap ban jaata hai.")
          : t("grioMap.reel.why3", "Aaj {0} rishtey the, {1} aap dekh chuke hain. Order matching engine banata hai — Grio nahi.").replace("{0}", String(roster.reelTotal)).replace("{1}", String(roster.reelTotal - roster.reelLeft)),
      grioReads: t("grioMap.reel.grioReads", "Aaj ke reel ka order aur aapki progress."),
      grioDoes: t("grioMap.reel.grioDoes", "Kisi ek rishte ko samjha sakta hai, aur aapke kehne par us par kaam kar sakta hai."),
      grioPrivate: t("grioMap.reel.grioPrivate", "Order matching engine tay karta hai. Grio use badal nahi sakta."),
      plan: null,
      locked: false,
      href: "/user/reel",
      ask: t("grioMap.reel.ask", "Ye profile mere Reel me kyun aayi?"),
    },
    {
      id: "vibe",
      label: t("grioMap.vibe.label", "Vibe"),
      short: t("grioMap.vibe.short", "Vibe"),
      note: t("grioMap.vibe.note", "Roz ka ek sawaal — jawab dene se soch ka mel saaf hota hai."),
      does: t("grioMap.vibe.does", "Roz ka sawaal aur Soch Board. Aapke jawab matching me lagte hain."),
      state: vibeGate.allowed ? "partial" : "locked",
      value: vibeGate.allowed ? t("grioMap.vibe.value", "roz ka sawaal") : t("grioMap.vibe.value3", "locked"),
      percent: null,
      unlocks: vibeGate.allowed
        ? t("grioMap.vibe.unlocks", "Roz ka jawab dete rahiye — Soch Fit utna hi saaf hoga.")
        : t("grioMap.vibe.unlocks3", "Paid plan par roz ka sawaal khulta hai."),
      why: vibeGate.allowed
        ? t("grioMap.vibe.why", "Aapke roz ke jawab Soch Fit banate hain, jo matching ke maujooda hisse ke andar hi lagta hai — koi naya wajan nahi.")
        : t("grioMap.vibe.why3", "Vibe aapke plan me nahi hai."),
      grioReads: t("grioMap.vibe.grioReads", "Aapke apne jawab."),
      grioDoes: t("grioMap.vibe.grioDoes", "Aaj ka sawaal chat me hi pooch sakta hai."),
      grioPrivate: t("grioMap.vibe.grioPrivate", "Aapka jawab tab tak kisi ko nahi dikhta jab tak aap Soch Board public na karein."),
      plan: vibeGate.allowed ? null : "Paid",
      locked: !vibeGate.allowed,
      href: "/user/vibe",
      ask: t("grioMap.vibe.ask", "Aaj ka sawaal kya hai?"),
    },
    {
      id: "circle",
      label: t("grioMap.circle.label", "Serious Circle"),
      short: t("grioMap.circle.short", "Circle"),
      note: t("grioMap.circle.note", "Hafte me do baar live — entry plan se nahi, poori profile se milti hai."),
      does: t("grioMap.circle.does", "Wednesday aur Sunday raat ka live event, sirf un logon ke liye jo sach me taiyar hain."),
      state: "empty",
      value: t("grioMap.circle.value", "dekhein"),
      percent: null,
      unlocks: t("grioMap.circle.unlocks", "Poori profile aur verification se entry banti hai."),
      why: t("grioMap.circle.why", "Serious Circle ka darwaza plan se nahi khulta — poori profile aur verification se khulta hai."),
      grioReads: t("grioMap.circle.grioReads", "Aapki entry ban rahi hai ya nahi."),
      grioDoes: t("grioMap.circle.grioDoes", "Circle page tak le jaata hai."),
      grioPrivate: t("grioMap.circle.grioPrivate", "Circle me kaun aaya, ye baahar nahi jaata."),
      plan: null,
      locked: false,
      href: "/user/circle",
      ask: t("grioMap.circle.ask", "Serious Circle me meri entry banti hai kya?"),
    },
  ];

  /* ---------------- Aap ---------------- */

  const profileNodes: MapNode[] = [
    {
      id: "profile-core",
      label: t("grioMap.profile-core.label", "Edit Profile"),
      short: t("grioMap.profile-core.short", "Profile"),
      note: t("grioMap.profile-core.note", "Aapki profile {0}% bhari hai.").replace("{0}", String(completion.percent)),
      does: t("grioMap.profile-core.does", "Aapki basic pehchaan — naam, sheher, kaam, parivaar. Yahi log sabse pehle dekhte hain."),
      state: completion.percent >= 100 ? "done" : completion.isLive ? "partial" : "empty",
      value: t("grioMap.profile-core.value", "{0}%").replace("{0}", String(completion.percent)),
      percent: completion.percent,
      unlocks:
        completion.percent >= 100
          ? null
          : t("grioMap.profile-core.unlocks", "{0} field aur bharein — adhoori profile par log rukte nahi.").replace("{0}", String(completion.missingFields.length)),
      why: completion.isLive
        ? t("grioMap.profile-core.why", "Profile live hai aur {0}% bhari. Baaki: {1}.").replace("{0}", String(completion.percent)).replace("{1}", String(completion.missingFields.slice(0, 3).join(", ") || "kuch nahi"))
        : t("grioMap.profile-core.why3", "Profile abhi live nahi hui — jab tak zaroori field khaali hain, aap kisi ke saamne aate hi nahi."),
      grioReads: t("grioMap.profile-core.grioReads", "Aapki apni bhari hui profile — poori."),
      grioDoes: t("grioMap.profile-core.grioDoes", "Khaali field ginta hai aur baat-cheet me bharne me madad karta hai."),
      grioPrivate: t("grioMap.profile-core.grioPrivate", "Kisi doosre ki profile Grio aapko padh kar nahi sunata."),
      plan: null,
      locked: false,
      href: "/profile/build",
      ask: t("grioMap.profile-core.ask", "Meri profile me abhi kya kami hai?"),
    },
    {
      id: "view-profile",
      label: t("grioMap.view-profile.label", "View Profile"),
      short: t("grioMap.view-profile.short", "Dekhein"),
      note: photos > 0 ? t("grioMap.view-profile.note", "{0} photo ke saath aapki profile aisi dikhti hai.").replace("{0}", String(photos)) : t("grioMap.view-profile.note3", "Photo ke bina profile adhoori dikhti hai."),
      does: t("grioMap.view-profile.does", "Aapki profile jaisi doosron ko dikhti hai — photo, details, sab kuch."),
      state: photos > 0 ? "done" : "empty",
      value: photos > 0 ? t("grioMap.view-profile.value", "{0} photo").replace("{0}", String(photos)) : t("grioMap.view-profile.value3", "photo nahi"),
      percent: null,
      unlocks: photos > 0 ? null : t("grioMap.view-profile.unlocks", "Ek photo add karein — bina tasveer wali profile par log rukte hi nahi."),
      why:
        photos > 0
          ? t("grioMap.view-profile.why", "Aapki {0} photo review paar kar chuki hain, aur profile isi roop me dikhti hai.").replace("{0}", String(photos))
          : t("grioMap.view-profile.why3", "Abhi koi approved photo nahi hai, isliye profile adhoori dikhti hai."),
      grioReads: t("grioMap.view-profile.grioReads", "Sirf ginti — kaunsi photo hai, ye Grio nahi dekhta."),
      grioDoes: t("grioMap.view-profile.grioDoes", "Profile page tak le jaata hai."),
      grioPrivate: t("grioMap.view-profile.grioPrivate", "Photo kis-kis ko dikhe, ye aapki apni setting se tay hota hai."),
      plan: null,
      locked: false,
      href: "/user/profile/me",
      ask: t("grioMap.view-profile.ask", "Meri profile doosron ko kaisi dikhti hai?"),
    },
    {
      id: "intelligence",
      label: t("grioMap.intelligence.label", "Intelligence Questions"),
      short: t("grioMap.intelligence.short", "Sawaal"),
      note: t("grioMap.intelligence.note", "{0} me se {1} hisse poore hain.").replace("{0}", String(layersTotal)).replace("{1}", String(layersDone)),
      does: t("grioMap.intelligence.does", "Soch, values aur ummeed ke sawaal — {0} hisson me. Inhi se rishton ka mel banta hai.").replace("{0}", String(layersTotal)),
      state: layersDone >= layersTotal ? "done" : layersDone > 0 ? "partial" : "empty",
      value: t("grioMap.intelligence.value", "{0} of {1}").replace("{0}", String(layersDone)).replace("{1}", String(layersTotal)),
      percent: pct(layersDone, layersTotal),
      unlocks: intelligence.progress.nextLayer
        ? t("grioMap.intelligence.unlocks", "Agla hissa \"{0}\" bharein — Soch Fit saaf hoga.").replace("{0}", String(intelligence.progress.nextLayer.title))
        : null,
      why: `Aapne ${layersTotal} me se ${layersDone} hisse poore kiye hain.${
        intelligence.progress.nextLayer ? t("grioMap.intelligence.why", " Sabse pehle \"{0}\" baaki hai.").replace("{0}", String(intelligence.progress.nextLayer.title)) : ""
      } Jitne jawab, utna saaf mel.`,
      grioReads: t("grioMap.intelligence.grioReads", "Aapke apne jawab — aur ye bhi ki kaunsa aapne diya aur kaunsa ghar walon ne."),
      grioDoes: t("grioMap.intelligence.grioDoes", "Baaki sawaal baat-cheet me poochh kar bhar sakta hai."),
      grioPrivate: t("grioMap.intelligence.grioPrivate", "Kuch jawab sirf matching me lagte hain — unhe koi doosra user nahi dekhta."),
      plan: null,
      locked: false,
      href: "/user/profile/intelligence",
      ask: t("grioMap.intelligence.ask", "Mere agle intelligence sawaal kaunse hain?"),
    },
    {
      id: "deep-profile",
      label: t("grioMap.deep-profile.label", "Deep Profile"),
      short: t("grioMap.deep-profile.short", "Deep"),
      note: t("grioMap.deep-profile.note", "{0} dimensions khuli hain — ye AI ka andaza hai, aapka kaha nahi.").replace("{0}", String(planCtx.features.deepDimensions)),
      does: t("grioMap.deep-profile.does", "Aapke jawaabon se AI ka apna padha hua — lifestyle, rishton ka andaz, expectations."),
      state: planCtx.features.deepDimensions > 0 ? (layersDone > 0 ? "partial" : "empty") : "locked",
      value: t("grioMap.deep-profile.value", "{0} dimensions").replace("{0}", String(planCtx.features.deepDimensions)),
      percent: null,
      unlocks:
        planCtx.features.deepDimensions > 0
          ? t("grioMap.deep-profile.unlocks", "Zyada jawab denge to ye padhai utni hi sach ke kareeb hogi.")
          : t("grioMap.deep-profile.unlocks3", "Paid plan par ye layers khulti hain."),
      why: t("grioMap.deep-profile.why", "Aapke plan me {0} deep dimensions khuli hain. Ye AI ka andaza hai — aapka kaha hua nahi, isliye ise hamesha \"andaza\" hi kaha jaata hai.").replace("{0}", String(planCtx.features.deepDimensions)),
      grioReads: t("grioMap.deep-profile.grioReads", "Sirf aapki apni deep profile."),
      grioDoes: t("grioMap.deep-profile.grioDoes", "Samjha sakta hai ki kaunsa andaza kis jawab se bana."),
      grioPrivate: t("grioMap.deep-profile.grioPrivate", "Grio ise kabhi aapka kaha hua bata kar pesh nahi karta."),
      plan: planCtx.features.deepDimensions > 0 ? null : "Paid",
      locked: planCtx.features.deepDimensions === 0,
      href: "/user/deep-profile",
      ask: t("grioMap.deep-profile.ask", "Deep Profile me mere baare me kya nikla hai?"),
    },
    {
      id: "preferences",
      label: t("grioMap.preferences.label", "Partner Preferences"),
      short: t("grioMap.preferences.short", "Pasand"),
      note: profile.partnerPreferences ? t("grioMap.preferences.note", "Aapki pasand bhari hui hai.") : t("grioMap.preferences.note3", "Pasand khaali hai — Reel general chal raha hai."),
      does: t("grioMap.preferences.does", "Aap kaisa saathi chahte hain — umar, sheher, padhai, aur jo aapke liye zaroori hai."),
      state: profile.partnerPreferences ? "done" : "empty",
      value: profile.partnerPreferences ? t("grioMap.preferences.value", "set") : t("grioMap.preferences.value3", "khaali"),
      percent: null,
      unlocks: profile.partnerPreferences ? null : t("grioMap.preferences.unlocks", "Preference bharein — Reel aur Discovery dono usi hisaab se chalte hain."),
      why: profile.partnerPreferences
        ? t("grioMap.preferences.why", "Aapki partner preference bhari hui hai, aur matching engine ise sabse pehle padhta hai.")
        : t("grioMap.preferences.why3", "Preference khaali hai, isliye Reel abhi sirf general hisaab se profiles dikhata hai."),
      grioReads: t("grioMap.preferences.grioReads", "Aapki apni likhi hui preference."),
      grioDoes: t("grioMap.preferences.grioDoes", "Samjha sakta hai ki kis preference se pool chhota ya bada hua."),
      grioPrivate: t("grioMap.preferences.grioPrivate", "Aapki preference doosron ko nahi dikhti."),
      plan: null,
      locked: false,
      href: "/user/discover",
      ask: t("grioMap.preferences.ask", "Meri preference se mera pool kitna bada hai?"),
    },
    {
      id: "plan",
      label: t("grioMap.plan.label", "Plan"),
      short: t("grioMap.plan.short", "Plan"),
      note: t("grioMap.plan.note", "Abhi {0} plan chal raha hai.").replace("{0}", String(planCtx.effectivePlanCode)),
      does: t("grioMap.plan.does", "Aapka plan — kya khula hai, kya nahi, aur payment ka hisaab."),
      state: "done",
      value: String(planCtx.effectivePlanCode),
      percent: null,
      unlocks: null,
      why: t("grioMap.plan.why", "Aapka plan {0} hai{1}. Har taala isi se khulta hai.").replace("{0}", String(planCtx.effectivePlanCode)).replace("{1}", String(planCtx.planSource === "ADMIN_GRANT" ? " (team ne diya hua)" : "")),
      grioReads: t("grioMap.plan.grioReads", "Aapka plan aur kaunsi cheez khuli hai."),
      grioDoes: t("grioMap.plan.grioDoes", "Bata sakta hai kaunsa feature kis plan me hai."),
      grioPrivate: t("grioMap.plan.grioPrivate", "Grio khud kabhi payment nahi karta."),
      plan: null,
      locked: false,
      href: "/user/subscription",
      ask: t("grioMap.plan.ask", "Mere plan me kya-kya khula hai?"),
    },
  ];

  /* ---------------- Trust ---------------- */

  const trustNodes: MapNode[] = [
    {
      id: "verify-contact",
      label: t("grioMap.verify-contact.label", "Verify Contact"),
      short: t("grioMap.verify-contact.short", "OTP"),
      note: t("grioMap.verify-contact.note", "Mobile {0}, email {1}.").replace("{0}", String(mobileVerified ? "verified" : "baaki")).replace("{1}", String(emailVerified ? "verified" : "baaki")),
      does: t("grioMap.verify-contact.does", "OTP se phone aur email verify — account surakshit, aur profile par saaf nishaan."),
      state: verifiedCount === 2 ? "done" : verifiedCount === 1 ? "partial" : "empty",
      value: t("grioMap.verify-contact.value", "{0} of 2").replace("{0}", String(verifiedCount)),
      percent: pct(verifiedCount, 2),
      unlocks:
        verifiedCount === 2 ? null : t("grioMap.verify-contact.unlocks", "{0} verify karein — Trust Score seedha upar jaata hai.").replace("{0}", String(!mobileVerified ? "Mobile" : "Email")),
      why: t("grioMap.verify-contact.why", "Mobile {0}, email {1}. Verify hui profile par jawab jaldi milta hai.").replace("{0}", String(mobileVerified ? "verified hai" : "abhi verify nahi hua")).replace("{1}", String(emailVerified ? "verified hai" : "abhi verify nahi hua")),
      grioReads: t("grioMap.verify-contact.grioReads", "Sirf ye ki verify hua ya nahi — number ya address nahi."),
      grioDoes: t("grioMap.verify-contact.grioDoes", "Verify page tak le jaata hai. OTP kabhi khud nahi bharta."),
      grioPrivate: t("grioMap.verify-contact.grioPrivate", "Aapka number aur email kisi doosre user ko kabhi nahi dikhte."),
      plan: null,
      locked: false,
      href: "/user/verify-contact",
      ask: t("grioMap.verify-contact.ask", "Verification se mere Trust Score par kya farak padega?"),
    },
    {
      id: "photos",
      label: t("grioMap.photos.label", "Photos"),
      short: t("grioMap.photos.short", "Photo"),
      note: photos > 0 ? t("grioMap.photos.note", "{0} photo review paar kar chuki hain.").replace("{0}", String(photos)) : t("grioMap.photos.note3", "Abhi koi approved photo nahi."),
      does: t("grioMap.photos.does", "Aapki tasveerein — review ke baad hi profile par lagti hain."),
      state: photos > 0 ? "done" : "empty",
      value: photos > 0 ? t("grioMap.photos.value", "{0} approved").replace("{0}", String(photos)) : t("grioMap.photos.value3", "koi nahi"),
      percent: null,
      unlocks: photos > 0 ? null : t("grioMap.photos.unlocks", "Ek photo add karein."),
      why: photos > 0 ? t("grioMap.photos.why", "Aapki {0} photo review paar kar chuki hain.").replace("{0}", String(photos)) : t("grioMap.photos.why3", "Abhi koi approved photo nahi hai."),
      grioReads: t("grioMap.photos.grioReads", "Sirf ginti."),
      grioDoes: t("grioMap.photos.grioDoes", "Photo page tak le jaata hai."),
      grioPrivate: t("grioMap.photos.grioPrivate", "Photo kis-kis ko dikhe, ye aap tay karte hain."),
      plan: null,
      locked: false,
      href: "/user/profile/me",
      ask: t("grioMap.photos.ask", "Meri photos profile par kaisi lag rahi hain?"),
    },
    {
      id: "trust-score",
      label: t("grioMap.trust-score.label", "Trust Score"),
      short: t("grioMap.trust-score.short", "Score"),
      note: trustScore === null ? t("grioMap.trust-score.note", "Score abhi ban nahi paya.") : t("grioMap.trust-score.note3", "{0}/100 — {1}.").replace("{0}", String(trustScore)).replace("{1}", String(trust?.scoreLabel ?? "")),
      does: t("grioMap.trust-score.does", "Verification aur poori profile ka ek saaf hisaab — doosre isi se bharosa banate hain."),
      // 85 is `trustScoreService`'s own STRONG threshold, not a second bar.
      state: trustScore === null ? "empty" : trustScore >= 85 ? "done" : "partial",
      value: trustScore === null ? t("grioMap.trust-score.value", "abhi nahi") : t("grioMap.trust-score.value3", "{0}/100").replace("{0}", String(trustScore)),
      percent: trustScore,
      unlocks:
        trustScore !== null && trustScore >= 85
          ? null
          : trust?.improvementFactors.length
            ? t("grioMap.trust-score.unlocks", "{0} — abhi {1} cheez baaki hai.").replace("{0}", String(trust.improvementFactors[0].label)).replace("{1}", String(trust.improvementFactors.length))
            : t("grioMap.trust-score.unlocks3", "Profile aur verification poori karein."),
      why:
        trustScore === null
          ? t("grioMap.trust-score.why", "Trust Score tab banta hai jab profile me kuch bhara ho — abhi hisaab lagane layak data nahi hai.")
          : t("grioMap.trust-score.why3", "Aapka score {0}/100 hai ({1}). Ye sirf verification aur profile se banta hai — kisi ki rai se nahi.").replace("{0}", String(trustScore)).replace("{1}", String(trust?.scoreLabel ?? "")),
      grioReads: t("grioMap.trust-score.grioReads", "Aapka apna score aur uske kaaran."),
      grioDoes: t("grioMap.trust-score.grioDoes", "Bata sakta hai kaunsi cheez score badhayegi."),
      grioPrivate: t("grioMap.trust-score.grioPrivate", "Grio score badal nahi sakta — ye sirf aapke kiye kaam se banta hai."),
      plan: null,
      locked: false,
      href: "/user/profile-trust-score",
      ask: t("grioMap.trust-score.ask", "Mera Trust Score kam kyun hai?"),
    },
    {
      id: "app-setup",
      label: t("grioMap.app-setup.label", "App Setup"),
      short: t("grioMap.app-setup.short", "Setup"),
      note: t("grioMap.app-setup.note", "App install, PIN lock aur quick login — ghar me privacy ke liye."),
      does: t("grioMap.app-setup.does", "App ko phone par lagana, PIN se lock karna, aur bina password ke login."),
      state: "empty",
      value: t("grioMap.app-setup.value", "dekhein"),
      percent: null,
      unlocks: t("grioMap.app-setup.unlocks", "PIN lagayein — ghar me koi aur phone uthaye to profile na khule."),
      why: t("grioMap.app-setup.why", "PIN ek parde ki tarah hai — ek hi phone ghar me kai log istemaal karte hain."),
      grioReads: t("grioMap.app-setup.grioReads", "Kuch nahi. Ye poori tarah aapki apni setting hai."),
      grioDoes: t("grioMap.app-setup.grioDoes", "Setup page tak le jaata hai."),
      grioPrivate: t("grioMap.app-setup.grioPrivate", "Aapka PIN kahin bhi saaf nahi rakha jaata."),
      plan: null,
      locked: false,
      href: "/user/app-setup",
      ask: t("grioMap.app-setup.ask", "PIN lock kaise lagta hai?"),
    },
  ];

  /* ---------------- Discovery ---------------- */

  const discoveryNodes: MapNode[] = [
    {
      id: "filters",
      label: t("grioMap.filters.label", "Advanced Discovery"),
      short: t("grioMap.filters.short", "Filters"),
      note: advanced ? t("grioMap.filters.note", "Filter mode \"{0}\" chal raha hai.").replace("{0}", String(settings.filterMode)) : t("grioMap.filters.note3", "Aapke plan me search nahi hai."),
      does: t("grioMap.filters.does", "Search aur gehre filter — verified only, trust score, sheher, padhai."),
      state: advanced ? (settings.verifiedOnly || settings.minTrustScore !== null ? "done" : "partial") : "locked",
      value: advanced ? (settings.filterMode === "STRICT" ? t("grioMap.filters.value3", "strict") : t("grioMap.filters.value4", "flexible")) : t("grioMap.filters.value5", "locked"),
      percent: null,
      unlocks: advanced
        ? t("grioMap.filters.unlocks", "Filter kas dein to pool chhota par zyada relevant ho jaata hai.")
        : t("grioMap.filters.unlocks3", "Paid plan par search aur saved filters khulte hain."),
      why: advanced
        ? t("grioMap.filters.why", "Aapka filter mode \"{0}\" hai{1}. Filter jitna sakht, pool utna chhota.").replace("{0}", String(settings.filterMode)).replace("{1}", String(settings.verifiedOnly ? ", aur sirf verified profiles dikh rahi hain" : ""))
        : t("grioMap.filters.why3", "Advanced Discovery aapke plan me nahi hai — abhi aapko preview dikhta hai, search nahi."),
      grioReads: t("grioMap.filters.grioReads", "Aapke apne saved filters."),
      grioDoes: t("grioMap.filters.grioDoes", "Samjha sakta hai ki kis filter se pool chhota hua. Filter khud nahi badalta."),
      grioPrivate: t("grioMap.filters.grioPrivate", "Aapke filters doosron ko nahi dikhte."),
      plan: advanced ? null : "Paid",
      locked: !advanced,
      href: "/user/discover",
      ask: t("grioMap.filters.ask", "Mera search pool chhota kyun hai?"),
    },
    {
      id: "behaviour",
      label: t("grioMap.behaviour.label", "Smart Reel Learning"),
      short: t("grioMap.behaviour.short", "Learning"),
      note: !advanced
        ? t("grioMap.behaviour.note", "Aapke plan me ye seekh chalti hi nahi.")
        : !settings.behaviorLearningEnabled
          ? t("grioMap.behaviour.note3", "Aapne learning band ki hui hai.")
          : behaviourActive
            ? t("grioMap.behaviour.note4", "{0} faislon se seekh chal rahi hai.").replace("{0}", String(decisions))
            : t("grioMap.behaviour.note5", "{0} of {1} faisle hue hain.").replace("{0}", String(decisions)).replace("{1}", String(MIN_DECISIONS)),
      does: t("grioMap.behaviour.does", "Aapke Reel ke faislon se seekh kar aage ka order behtar karta hai."),
      state: !advanced ? "locked" : !settings.behaviorLearningEnabled ? "empty" : behaviourActive ? "done" : "partial",
      value: !advanced
        ? t("grioMap.behaviour.value", "locked")
        : !settings.behaviorLearningEnabled
          ? t("grioMap.behaviour.value3", "band hai")
          : t("grioMap.behaviour.value4", "{0} of {1}").replace("{0}", String(Math.min(decisions, MIN_DECISIONS))).replace("{1}", String(MIN_DECISIONS)),
      percent: advanced && settings.behaviorLearningEnabled ? pct(Math.min(decisions, MIN_DECISIONS), MIN_DECISIONS) : null,
      unlocks: !advanced
        ? t("grioMap.behaviour.unlocks", "Paid plan par behaviour learning chalti hai.")
        : !settings.behaviorLearningEnabled
          ? t("grioMap.behaviour.unlocks3", "Learning chalu karein to Reel aapke faislon se seekhne lagega.")
          : behaviourActive
            ? null
            : t("grioMap.behaviour.unlocks4", "{0} aur faisle — phir Smart Reel learning chalu ho jaayegi.").replace("{0}", String(Math.max(0, MIN_DECISIONS - decisions))),
      why: !advanced
        ? t("grioMap.behaviour.why", "Behaviour learning Advanced Discovery ka hissa hai, jo aapke plan me nahi hai.")
        : !settings.behaviorLearningEnabled
          ? t("grioMap.behaviour.why3", "Aapne learning khud band ki hui hai, isliye aapke faisle order me nahi lagte.")
          : behaviourActive
            ? t("grioMap.behaviour.why4", "{0} faislon se seekh chal rahi hai. Ye sirf umar, sheher, padhai jaisi khuli baaton se banti hai — dharm, jaati ya aamdani kabhi nahi.").replace("{0}", String(decisions))
            : t("grioMap.behaviour.why5", "Abhi {0} faisle hue hain, {1} chahiye. Itne se kam par koi bhi seekh andaza hi hogi.").replace("{0}", String(decisions)).replace("{1}", String(MIN_DECISIONS)),
      grioReads: t("grioMap.behaviour.grioReads", "Sirf ye ki learning chalu hai ya nahi, aur kitne faisle hue."),
      grioDoes: t("grioMap.behaviour.grioDoes", "Samjha sakta hai ki learning kaise kaam karti hai."),
      grioPrivate: t("grioMap.behaviour.grioPrivate", "Ye seekh kabhi aapki 'pasand' bana kar kisi ko nahi batayi jaati."),
      plan: advanced ? null : "Paid",
      locked: !advanced,
      href: "/user/discover",
      ask: t("grioMap.behaviour.ask", "Smart Reel learning mere Reel me kya badal rahi hai?"),
    },
    {
      id: "shortlist",
      label: t("grioMap.shortlist.label", "Shortlist"),
      short: t("grioMap.shortlist.short", "Shortlist"),
      note: shortlisted > 0 ? t("grioMap.shortlist.note", "{0} profiles save ki hain.").replace("{0}", String(shortlisted)) : t("grioMap.shortlist.note3", "Abhi kisi ko shortlist nahi kiya."),
      does: t("grioMap.shortlist.does", "Pasand aayi profiles ko chupchaap save karna — sirf aapke liye."),
      state: shortlisted > 0 ? "done" : "empty",
      value: shortlisted > 0 ? t("grioMap.shortlist.value", "{0} saved").replace("{0}", String(shortlisted)) : t("grioMap.shortlist.value3", "khaali"),
      percent: null,
      unlocks: shortlisted > 0 ? null : t("grioMap.shortlist.unlocks", "Reel me neeche swipe karke kisi ko shortlist karein."),
      why: shortlisted > 0 ? t("grioMap.shortlist.why", "Aapne {0} profiles save ki hain. Shortlist private hai.").replace("{0}", String(shortlisted)) : t("grioMap.shortlist.why3", "Abhi aapne kisi ko shortlist nahi kiya."),
      grioReads: t("grioMap.shortlist.grioReads", "Aapki apni shortlist."),
      grioDoes: t("grioMap.shortlist.grioDoes", "Aapke kehne par kisi ek ko shortlist kar sakta hai — poochh kar."),
      grioPrivate: t("grioMap.shortlist.grioPrivate", "Aapne kise shortlist kiya, ye unhe nahi pata chalta."),
      plan: null,
      locked: false,
      href: "/user/shortlist",
      ask: t("grioMap.shortlist.ask", "Meri shortlist me kaun-kaun hai?"),
    },
    {
      id: "boost",
      label: t("grioMap.boost.label", "Boost"),
      short: t("grioMap.boost.short", "Boost"),
      note: planCtx.credits.BOOST > 0 ? t("grioMap.boost.note", "{0} boost aapke paas hain.").replace("{0}", String(planCtx.credits.BOOST)) : t("grioMap.boost.note3", "Boost se profile upar dikhti hai."),
      does: t("grioMap.boost.does", "Aapki profile ko kuch dinon ke liye doosron ke Reel me upar le aata hai."),
      state: planCtx.features.boost || planCtx.credits.BOOST > 0 ? "empty" : "locked",
      value: planCtx.credits.BOOST > 0 ? t("grioMap.boost.value", "{0} credit").replace("{0}", String(planCtx.credits.BOOST)) : planCtx.features.boost ? t("grioMap.boost.value3", "available") : t("grioMap.boost.value4", "locked"),
      percent: null,
      unlocks:
        planCtx.features.boost || planCtx.credits.BOOST > 0
          ? t("grioMap.boost.unlocks", "Boost lagayein — kuch dinon ke liye zyada log aapko dekhenge.")
          : t("grioMap.boost.unlocks3", "Paid plan ya reward credit se boost khulta hai."),
      why: t("grioMap.boost.why", "Boost sirf dikhne ki tarteeb badalta hai — kis se mel hai, wo nahi. Ye farak jaanbujh kar rakha gaya hai."),
      grioReads: t("grioMap.boost.grioReads", "Aapke apne boost credits."),
      grioDoes: t("grioMap.boost.grioDoes", "Boost page tak le jaata hai. Boost khud nahi lagata."),
      grioPrivate: t("grioMap.boost.grioPrivate", "Doosron ko nahi pata chalta ki aapne boost lagaya hai."),
      plan: planCtx.features.boost || planCtx.credits.BOOST > 0 ? null : "Paid",
      locked: !planCtx.features.boost && planCtx.credits.BOOST === 0,
      href: "/user/boost",
      ask: t("grioMap.boost.ask", "Boost lagane se mujhe kya farak padega?"),
    },
  ];

  /* ---------------- Rishta ---------------- */

  const rishtaNodes: MapNode[] = [
    {
      id: "matches",
      label: t("grioMap.matches.label", "My Rishte"),
      short: t("grioMap.matches.short", "Rishte"),
      note: matches.length > 0 ? t("grioMap.matches.note", "{0} rishte ban chuke hain.").replace("{0}", String(matches.length)) : t("grioMap.matches.note3", "Abhi koi match nahi bana."),
      does: t("grioMap.matches.does", "Wo log jinke saath dono taraf se haan ho chuki hai — aur har rishte ka stage."),
      state: matches.length > 0 ? "done" : "empty",
      value: matches.length > 0 ? t("grioMap.matches.value", "{0} match").replace("{0}", String(matches.length)) : t("grioMap.matches.value3", "koi nahi"),
      percent: null,
      unlocks: matches.length > 0 ? null : t("grioMap.matches.unlocks", "Interest bhejein — dono taraf haan hone par match banta hai."),
      why:
        matches.length > 0
          ? t("grioMap.matches.why", "Aapke {0} match hain, aur {1} me dono taraf se baat ho chuki hai.").replace("{0}", String(matches.length)).replace("{1}", String(talking))
          : t("grioMap.matches.why3", "Match tabhi banta hai jab dono taraf haan ho. Abhi koi nahi bana."),
      grioReads: t("grioMap.matches.grioReads", "Aapke apne match aur unka stage."),
      grioDoes: t("grioMap.matches.grioDoes", "Kisi ek rishte par baat aage badhane me madad karta hai."),
      grioPrivate: t("grioMap.matches.grioPrivate", "Doosre insaan ka stage sirf unhe dikhta hai, aapko unka andaza nahi diya jaata."),
      plan: null,
      locked: false,
      href: "/user/matches",
      ask: t("grioMap.matches.ask", "Mere rishton me abhi kya chal raha hai?"),
    },
    {
      id: "interests",
      label: t("grioMap.interests.label", "Interests"),
      short: t("grioMap.interests.short", "Interest"),
      note:
        interestsPending > 0
          ? t("grioMap.interests.note", "{0} interest aapke jawab ka intezaar kar rahe hain.").replace("{0}", String(interestsPending))
          : t("grioMap.interests.note3", "{0} interest aapne bheje hain.").replace("{0}", String(interestsSent)),
      does: t("grioMap.interests.does", "Interest bhejna aur aaye hue ka jawab dena. Dono taraf haan ho to match banta hai."),
      state: matches.length > 0 ? "done" : interestsSent > 0 ? "partial" : "empty",
      value: interestsSent > 0 || interestsPending > 0 ? t("grioMap.interests.value", "{0} bheje · {1} aaye").replace("{0}", String(interestsSent)).replace("{1}", String(interestsPending)) : t("grioMap.interests.value3", "shuru nahi"),
      percent: null,
      unlocks:
        matches.length > 0
          ? null
          : interestsPending > 0
            ? t("grioMap.interests.unlocks", "{0} interest ka jawab dein.").replace("{0}", String(interestsPending))
            : t("grioMap.interests.unlocks3", "Pehla interest bhejein — mutual hone par photo, contact aur chat khulti hai."),
      why: t("grioMap.interests.why", "Aapne {0} interest bheje hain aur {1} aaye hue jawab ka intezaar kar rahe hain. Match tabhi banta hai jab dono taraf haan ho.").replace("{0}", String(interestsSent)).replace("{1}", String(interestsPending)),
      grioReads: t("grioMap.interests.grioReads", "Aapke bheje aur aaye hue interest."),
      grioDoes: t("grioMap.interests.grioDoes", "Aapke kehne par interest bhej sakta hai — hamesha confirm karke, kabhi chupchaap nahi."),
      grioPrivate: t("grioMap.interests.grioPrivate", "Aapne kisko interest bheja, ye sirf us insaan ko pata chalta hai."),
      plan: null,
      locked: false,
      href: "/user/interests",
      ask: t("grioMap.interests.ask", "Mere interests ka abhi kya status hai?"),
    },
    {
      id: "messages",
      label: t("grioMap.messages.label", "Messages"),
      short: t("grioMap.messages.short", "Chat"),
      note: talking > 0 ? t("grioMap.messages.note", "{0} rishton me baat chal rahi hai.").replace("{0}", String(talking)) : t("grioMap.messages.note3", "Abhi kahin baat shuru nahi hui."),
      does: t("grioMap.messages.does", "Match ke baad private baat-cheet."),
      state: talking > 0 ? "done" : matches.length > 0 ? "partial" : "empty",
      value: talking > 0 ? t("grioMap.messages.value", "{0} me baat chal rahi").replace("{0}", String(talking)) : matches.length > 0 ? t("grioMap.messages.value3", "shuru nahi") : t("grioMap.messages.value4", "match nahi"),
      percent: null,
      unlocks:
        talking > 0
          ? null
          : matches.length > 0
            ? t("grioMap.messages.unlocks", "Pehla message likhein — match ban jaana aadha kaam hai.")
            : t("grioMap.messages.unlocks3", "Match banne par chat apne aap khul jaati hai."),
      why:
        talking > 0
          ? t("grioMap.messages.why", "{0} rishton me dono taraf se baat ho chuki hai.").replace("{0}", String(talking))
          : matches.length > 0
            ? t("grioMap.messages.why3", "Aapke {0} match hain par abhi kisi me dono taraf se baat nahi hui.").replace("{0}", String(matches.length))
            : t("grioMap.messages.why4", "Chat sirf match ke baad khulti hai — isliye abhi koi thread nahi hai."),
      grioReads: t("grioMap.messages.grioReads", "Sirf us thread ke haal ke message, jab aap khud us rishte par Grio kholte hain."),
      grioDoes: t("grioMap.messages.grioDoes", "Message ka draft bana sakta hai. Bhejne se pehle hamesha dikhata hai."),
      grioPrivate: t("grioMap.messages.grioPrivate", "Grio aapki chat kisi doosre user ko kabhi nahi dikhata."),
      plan: null,
      locked: false,
      href: "/user/messages",
      ask: t("grioMap.messages.ask", "Is rishte me aage kya likhun?"),
    },
    {
      id: "questions",
      label: t("grioMap.questions.label", "Inbox & Questions"),
      short: t("grioMap.questions.short", "Sawaal"),
      note: inboundQuestions > 0 ? t("grioMap.questions.note", "{0} sawaal jawab ka intezaar kar rahe hain.").replace("{0}", String(inboundQuestions)) : t("grioMap.questions.note3", "Koi sawaal baaki nahi."),
      does: t("grioMap.questions.does", "Profile par seedha sawaal poochhna aur jawab dena — match se pehle bhi."),
      state: inboundQuestions > 0 ? "partial" : "done",
      value: inboundQuestions > 0 ? t("grioMap.questions.value", "{0} baaki").replace("{0}", String(inboundQuestions)) : t("grioMap.questions.value3", "koi baaki nahi"),
      percent: null,
      unlocks: inboundQuestions > 0 ? t("grioMap.questions.unlocks", "{0} sawaal ka jawab dein — log intezaar kar rahe hain.").replace("{0}", String(inboundQuestions)) : null,
      why:
        inboundQuestions > 0
          ? t("grioMap.questions.why", "{0} logon ne aapse sawaal poochha hai aur jawab abhi baaki hai.").replace("{0}", String(inboundQuestions))
          : t("grioMap.questions.why3", "Abhi koi sawaal aapke jawab ka intezaar nahi kar raha."),
      grioReads: t("grioMap.questions.grioReads", "Aapse poochhe gaye sawaal."),
      grioDoes: t("grioMap.questions.grioDoes", "Jawab ka draft bana sakta hai — bhejne se pehle dikhata hai."),
      grioPrivate: t("grioMap.questions.grioPrivate", "Aapka jawab sirf poochhne wale ko jaata hai."),
      plan: null,
      locked: false,
      href: "/user/inbox",
      ask: t("grioMap.questions.ask", "Mujhse kaunse sawaal poochhe gaye hain?"),
    },
  ];

  /* ---------------- Ghar ---------------- */

  const familyNodes: MapNode[] = [
    {
      id: "family",
      label: t("grioMap.family.label", "Family Portal"),
      short: t("grioMap.family.short", "Parivaar"),
      note:
        family.length === 0
          ? t("grioMap.family.note", "Abhi koi ghar wala juda nahi.")
          : familyAnswered > 0
            ? t("grioMap.family.note3", "{0} jude, {1} ne ummeed batayi.").replace("{0}", String(family.length)).replace("{1}", String(familyAnswered))
            : t("grioMap.family.note4", "{0} jude, par kisi ne ummeed nahi batayi.").replace("{0}", String(family.length)),
      does: t("grioMap.family.does", "Ghar walon ko jodna, aur unse poochhna ki wo kya ummeed rakhte hain."),
      state: family.length > 0 && familyAnswered > 0 ? "done" : family.length > 0 ? "partial" : "empty",
      value: family.length === 0 ? t("grioMap.family.value", "koi nahi") : t("grioMap.family.value3", "{0} jude").replace("{0}", String(family.length)),
      percent: null,
      unlocks:
        family.length > 0 && familyAnswered > 0
          ? null
          : family.length > 0
            ? t("grioMap.family.unlocks", "Ghar walon se unki ummeed poochhein — khaali seat se kuch pata nahi chalta.")
            : t("grioMap.family.unlocks3", "Ghar walon ko jodein — aapke plan me {0} seat hain.").replace("{0}", String(planCtx.features.familySeats)),
      why:
        family.length > 0 && familyAnswered > 0
          ? t("grioMap.family.why", "{0} log jude hain aur {1} ne apni ummeed batayi hai.").replace("{0}", String(family.length)).replace("{1}", String(familyAnswered))
          : family.length > 0
            ? t("grioMap.family.why3", "{0} log jud to gaye hain par kisi ne apni ummeed abhi nahi batayi.").replace("{0}", String(family.length))
            : t("grioMap.family.why4", "Abhi koi ghar wala juda nahi hai. Ghar ki soch pehle se pata ho to rishta beech me nahi atakta."),
      grioReads: t("grioMap.family.grioReads", "Ghar walon ne jo bataya, wo alag se — aapke kahe ke barabar nahi."),
      grioDoes: t("grioMap.family.grioDoes", "Aapki aur ghar ki soch ka farak dikha sakta hai."),
      grioPrivate: t("grioMap.family.grioPrivate", "Ghar wale aapki chat aur shortlist nahi dekh sakte."),
      plan: null,
      locked: false,
      href: "/user/family",
      ask: t("grioMap.family.ask", "Meri aur ghar walon ki soch me kahan farak hai?"),
    },
    {
      id: "kundli",
      label: t("grioMap.kundli.label", "Kundli"),
      short: t("grioMap.kundli.short", "Kundli"),
      note:
        chartPrecision === "full"
          ? t("grioMap.kundli.note3", "Aapki kundli poori hai.")
          : chartPrecision === "no-time"
            ? t("grioMap.kundli.note5", "Janm-samay nahi hai, isliye Lagna adhoora hai.")
            : chartPrecision === "no-place"
              ? t("grioMap.kundli.note7", "Janm-sthan baaki hai.")
              : t("grioMap.kundli.note8", "Janm-tithi baaki hai."),
      does: t("grioMap.kundli.does", "Aapki janm-kundli aur match ke saath 36-guna milan — ek alag cultural nazar."),
      state: chartPrecision === "full" ? "done" : chart ? "partial" : "empty",
      value:
        chartPrecision === "full"
          ? t("grioMap.kundli.value3", "poori")
          : chartPrecision === "no-time"
            ? t("grioMap.kundli.value5", "samay baaki")
            : chartPrecision === "no-place"
              ? t("grioMap.kundli.value7", "sthan baaki")
              : t("grioMap.kundli.value8", "tithi baaki"),
      percent: null,
      unlocks:
        chartPrecision === "full"
          ? null
          : chartPrecision === "no-time"
            ? t("grioMap.kundli.unlocks4", "Janm-samay bharein — poora Lagna chart tabhi banta hai.")
            : chartPrecision === "no-place"
              ? t("grioMap.kundli.unlocks6", "Janm-sthan bharein — chart tab jaake poora hota hai.")
              : t("grioMap.kundli.unlocks7", "Janm-tithi bharein — kundli wahi se shuru hoti hai."),
      why:
        chartPrecision === "full"
          ? t("grioMap.kundli.why3", "Aapki kundli poori hai — janm-tithi, samay aur sthan teeno maujood hain.")
          : chartPrecision === "no-time"
            ? t("grioMap.kundli.why5", "Janm-samay nahi hai, isliye Lagna nahi ban sakta. Bina samay ke Lagna bata dena sabse bada jhooth hota — isliye ye khaali dikhaya jaata hai, bhara nahi jaata.")
            : chartPrecision === "no-place"
              ? t("grioMap.kundli.why7", "Janm-sthan nahi hai, isliye chart ka hisaab adhoora reh jaata hai.")
              : t("grioMap.kundli.why8", "Janm-tithi ke bina kundli shuru hi nahi hoti."),
      grioReads: t("grioMap.kundli.grioReads", "Aapki apni kundli aur milan ke natije."),
      grioDoes: t("grioMap.kundli.grioDoes", "Samjha sakta hai ki kaunsa guna kaise bana."),
      grioPrivate: t("grioMap.kundli.grioPrivate", "Kundli rishton ki ranking me nahi lagti — ye alag nazar hai, aur faisla aapka hai."),
      plan: null,
      locked: false,
      href: "/user/kundli",
      ask: t("grioMap.kundli.ask", "Meri kundli adhoori kyun hai?"),
    },
    {
      id: "biodata",
      label: t("grioMap.biodata.label", "Biodata"),
      short: t("grioMap.biodata.short", "Biodata"),
      note: t("grioMap.biodata.note", "Profile {0}% bhari hai — biodata utna hi poora banega.").replace("{0}", String(completion.percent)),
      does: t("grioMap.biodata.does", "Shaadi wala biodata — banayein, dekhein aur ghar walon ke saath share karein."),
      state: completion.percent >= 100 ? "done" : "partial",
      value: t("grioMap.biodata.value", "{0}% se banega").replace("{0}", String(completion.percent)),
      percent: completion.percent,
      unlocks: completion.percent >= 100 ? null : t("grioMap.biodata.unlocks", "Profile jitni poori, biodata utna hi poora banega."),
      why: t("grioMap.biodata.why", "Biodata seedha aapki profile se banta hai, aur wo abhi {0}% bhari hai.").replace("{0}", String(completion.percent)),
      grioReads: t("grioMap.biodata.grioReads", "Wahi jo aapki profile me hai."),
      grioDoes: t("grioMap.biodata.grioDoes", "Biodata page tak le jaata hai."),
      grioPrivate: t("grioMap.biodata.grioPrivate", "Aap tay karte hain ki biodata me kya-kya jaaye."),
      plan: null,
      locked: false,
      href: "/user/biodata",
      ask: t("grioMap.biodata.ask", "Mera biodata kaisa ban raha hai?"),
    },
  ];

  const branches: MapBranch[] = [
    { id: "today", label: t("grioMap.branch.today.label", "Aaj ka din"), short: t("grioMap.branch.today.short", "Aaj"), subtitle: t("grioMap.branch.today.subtitle", "Dashboard, Reel, Vibe, Circle"), summary: "", settled: 0, nodes: todayNodes },
    { id: "profile", label: t("grioMap.branch.profile.label", "Aapko samajhta hai"), short: t("grioMap.branch.profile.short", "Aap"), subtitle: t("grioMap.branch.profile.subtitle", "Profile, sawaal, pasand, plan"), summary: "", settled: 0, nodes: profileNodes },
    { id: "trust", label: t("grioMap.branch.trust.label", "Trust aur pehchaan"), short: t("grioMap.branch.trust.short", "Trust"), subtitle: t("grioMap.branch.trust.subtitle", "OTP, photo, score, setup"), summary: "", settled: 0, nodes: trustNodes },
    { id: "discovery", label: t("grioMap.branch.discovery.label", "Smart Discovery"), short: t("grioMap.branch.discovery.short", "Khoj"), subtitle: t("grioMap.branch.discovery.subtitle", "Filter, learning, shortlist, boost"), summary: "", settled: 0, nodes: discoveryNodes },
    { id: "rishta", label: t("grioMap.branch.rishta.label", "Ek rishta"), short: t("grioMap.branch.rishta.short", "Rishta"), subtitle: t("grioMap.branch.rishta.subtitle", "Match, interest, chat, sawaal"), summary: "", settled: 0, nodes: rishtaNodes },
    { id: "family", label: t("grioMap.branch.family.label", "Ghar aur parampara"), short: t("grioMap.branch.family.short", "Ghar"), subtitle: t("grioMap.branch.family.subtitle", "Parivaar, kundli, biodata"), summary: "", settled: 0, nodes: familyNodes },
  ];

  for (const branch of branches) {
    branch.settled = branch.nodes.filter(isSettled).length;
    branch.summary = t("grioMap.branchSummary", "{done} of {total} set")
      .replace("{done}", String(branch.settled))
      .replace("{total}", String(branch.nodes.length));
  }

  /*
   * ── The next step ──────────────────────────────────────────────────────
   *
   * Least-far-along unfinished node, so the suggestion is the one with the most
   * room rather than the one nearest the finish — the rule `bandhanJourney`
   * picks its next area by. Locked nodes are excluded: a plan gate is not a
   * step the user forgot to take.
   *
   * `percent: null` sorts as 50 rather than 0, so a node with no meter never
   * outranks a genuinely empty one that has a number.
   */
  const candidates = branches
    .flatMap((b) => b.nodes.map((n) => ({ branchId: b.id, node: n })))
    .filter((x) => x.node.state !== "done" && x.node.state !== "locked" && x.node.unlocks !== null);

  const best = candidates.sort((a, b) => (a.node.percent ?? 50) - (b.node.percent ?? 50))[0] ?? null;

  const totalNodes = branches.reduce((sum, b) => sum + b.nodes.length, 0);
  const settledNodes = branches.reduce((sum, b) => sum + b.settled, 0);

  return {
    branches,
    next: best
      ? {
          branchId: best.branchId,
          nodeId: best.node.id,
          // Where they stand, then what it buys. The reason is the point —
          // "do this next" without a because is an order.
          reason: `${best.node.note} ${best.node.unlocks ?? ""}`.trim(),
        }
      : null,
    journeys: buildJourneys(branches, t),
    totals: { settled: settledNodes, total: totalNodes },
  };
}

/**
 * The six guided modes.
 *
 * Each is a filter over nodes that already exist rather than a second list of
 * steps, so a journey can never point at something the map does not show. A
 * journey holds only *unsettled, unlocked* nodes — walking somebody through
 * three things they have already done is how a guide loses their attention.
 */
function buildJourneys(branches: MapBranch[], t: Translate): GuidedJourney[] {
  const byId = new Map(branches.flatMap((b) => b.nodes.map((n) => [n.id, n] as const)));

  const pick = (ids: string[]) =>
    ids.filter((id) => {
      const node = byId.get(id);
      return node && node.state !== "done" && node.state !== "locked";
    });

  const journeys: GuidedJourney[] = [
    { id: "matches", label: t("grioMap.journey.matches", "Behtar rishtey"), nodeIds: pick(["preferences", "intelligence", "behaviour", "reel", "filters"]) },
    { id: "profile", label: t("grioMap.journey.profile", "Profile poori"), nodeIds: pick(["profile-core", "intelligence", "photos", "deep-profile"]) },
    { id: "trust", label: t("grioMap.journey.trust", "Trust badhayein"), nodeIds: pick(["verify-contact", "photos", "trust-score"]) },
    { id: "kundli", label: t("grioMap.journey.kundli", "Kundli samjhein"), nodeIds: pick(["kundli", "biodata"]) },
    { id: "rishta", label: t("grioMap.journey.rishta", "Rishta aage"), nodeIds: pick(["matches", "interests", "questions", "messages", "circle"]) },
    // The one journey that is not filtered: "explore" is explicitly a tour of
    // everything, and hiding the finished parts of a tour defeats the tour.
    { id: "explore", label: t("grioMap.journey.explore", "Sab kuch"), nodeIds: branches.flatMap((b) => b.nodes.map((n) => n.id)) },
  ];

  // An empty guided mode reads as a broken button, not as a compliment.
  return journeys.filter((j) => j.nodeIds.length > 0);
}

/* ------------------------------------------------------------------ */
/* Privacy Inspector                                                   */
/* ------------------------------------------------------------------ */

export interface PrivacyFact {
  label: string;
  value: string;
  /** The provenance tag, resolved to Hinglish the user can read. */
  sourceLabel: string;
  source: string;
}

export interface PrivacyGroup {
  id: string;
  title: string;
  /** What this whole group *is* — provenance, not content. */
  note: string;
  facts: PrivacyFact[];
}

export interface PrivacySnapshot {
  groups: PrivacyGroup[];
  memory: { id: string; fact: string; createdAt: string }[];
  memoryLimit: number;
  behaviour: {
    enabled: boolean;
    active: boolean;
    decisions: number;
    threshold: number;
    /** False on plans without Advanced Discovery — the controls are inert there. */
    controllable: boolean;
    signals: string[];
  };
  hidden: string[];
}

/** Public wording for each provenance tag. */
const SOURCE_LABEL: Record<string, string> = {
  DECLARED: "aapne khud bataya",
  CONFIRMED: "AI ne padha, aapne confirm kiya",
  FAMILY_SAID: "ghar walon ne bataya",
  INFERRED: "AI ka andaza — aapne khud nahi kaha",
  BEHAVIOURAL: "aapke istemaal se nikla",
  VERIFIED: "saboot ke saath verify hua",
  UNKNOWN_SOURCE: "profile me likha hai, par kisne likha ye record nahi",
};

const GROUP_NOTE: Record<string, string> = {
  identity: "Aapki apni bhari hui basic pehchaan.",
  verified: "Wo cheezein jinka saboot system ke paas hai.",
  layer: "Marriage Intelligence ke sawaalon ke jawab.",
  vibe: "Roz ke sawaal par aapke apne taps.",
  deep: "AI ka apna padha hua — aapka bayaan nahi.",
};

/**
 * The Shield panel: everything Grio holds about this user, grouped by *where it
 * came from* rather than by which screen shows it.
 *
 * Split from `buildSamajhMap` on purpose. `buildSelfKnowledge` in full mode is
 * the most expensive read in this neighbourhood — deep profile, soch board,
 * family activity, badge state, swipe mix — and the map needs none of it.
 * Loading it behind the shield keeps opening the map cheap and makes the cost
 * land only when somebody actually asks the question.
 */
export async function buildPrivacySnapshot(userId: string): Promise<PrivacySnapshot | null> {
  const { buildSelfKnowledge } = await import("./selfKnowledge");

  const snap = await buildSelfKnowledge(userId, "full");
  if (!snap) return null;

  const planCtx = await getPlanContext(userId);
  const settings = await getDiscoverySettings(userId);
  const resetAt = settings.behaviorResetAt ? new Date(settings.behaviorResetAt) : null;
  const [counts, learned] = await Promise.all([
    countEligibleSwipes(userId, resetAt).catch(() => ({ total: 0, positive: 0 })),
    settings.behaviorLearningEnabled ? buildLearnedBehaviorProfile(userId).catch(() => null) : null,
  ]);

  const groups: PrivacyGroup[] = snap.areas.map((area, index) => ({
    id: `${area.kind}-${index}`,
    title: area.title,
    note: GROUP_NOTE[area.kind] ?? "",
    facts: area.facts.map((f) => ({
      label: f.label,
      value: f.value,
      source: f.source,
      sourceLabel: SOURCE_LABEL[f.source] ?? f.source,
    })),
  }));

  if (snap.behaviour.length > 0) {
    groups.push({
      id: "behaviour",
      title: "Aapke istemaal se nikla",
      note: "Ye aapka kaha hua nahi hai — sirf aapke istemaal se banta hai, aur kabhi aapki 'pasand' ki tarah pesh nahi kiya jaata.",
      facts: snap.behaviour.map((b) => ({
        label: b,
        value: "",
        source: "BEHAVIOURAL",
        sourceLabel: SOURCE_LABEL.BEHAVIOURAL,
      })),
    });
  }

  return {
    groups,
    memory: snap.memory.map((m) => ({ id: m.id, fact: m.body, createdAt: m.createdAt })),
    memoryLimit: planCtx.features.grioMemoryFacts,
    behaviour: {
      enabled: settings.behaviorLearningEnabled,
      active: Boolean(learned),
      decisions: counts.total,
      threshold: MIN_DECISIONS,
      controllable: planCtx.features.advancedDiscovery,
      signals: ["umar ka daayra", "sheher", "padhai", "kaam ki kism", "khaan-paan aur aadatein"],
    },
    // Stated rather than derived, because the point is what is *absent* from
    // every list above — and an empty list is not evidence of a boundary.
    hidden: [
      "Aapka phone number aur email kisi doosre user ko nahi dikhte.",
      "Aapki shortlist aur incognito browsing kisi ko nahi dikhti.",
      "Kuch intelligence jawab sirf matching me lagte hain — koi user unhe nahi padh sakta.",
      "Dharm, jaati, aamdani aur gotra behaviour learning me kabhi nahi jaate.",
      "Grio kisi candidate ki private profile aapko nahi padh kar sunata.",
    ],
  };
}
