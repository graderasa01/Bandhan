import "server-only";
import { prisma } from "@/lib/db/prisma";
import { PROFILE_FULL_INCLUDE } from "@/lib/services/profile/profileInclude";
import { computeCompletion } from "@/lib/services/profile/completionService";
import { FIELD_BY_KEY } from "@/lib/profile/fields";
import {
  INTELLIGENCE_LAYERS,
  INTELLIGENCE_QUESTION_BY_KEY,
  intelligenceQuestionFor,
} from "@/lib/profile/intelligenceQuestions";
import { LEARN_MARKER_START } from "@/lib/contracts/concierge";
import { ACT_MARKER_END } from "@/lib/contracts/grio";
import { asList, makeLookup, applicableQuestions } from "@/lib/profile/signalAnswers";
import { buildIntelligenceState, type IntelligenceState } from "@/lib/services/profile/intelligenceService";
import {
  getFieldProvenance,
  isUnconfirmedInference,
  type FieldProvenanceView,
} from "@/lib/services/profile/provenanceService";
import { computeTrustScore } from "@/lib/services/trust/trustScoreService";
import { getDeepProfileView } from "@/lib/services/deepProfile/deepProfileService";
import { getSochBoard } from "@/lib/services/vibe/sochBoardService";
import { getVibeStreak } from "@/lib/services/vibe/pollService";
import { listFamilyMembers, getRecentFamilyActivity } from "@/lib/services/family/familyService";
import { getOwnParentBlessingStatus } from "@/lib/services/family/blessingService";
import { getBadgeState, NO_BADGE } from "@/lib/services/circle/badgeService";
import { getExpectationGapReport } from "@/lib/services/family/familyExpectationService";
import { formatExpectationGaps, type ExpectationGapReport } from "@/lib/profile/expectationGaps";
import { getMemoryEntries, formatMemoryEntries, type GrioMemoryEntryView } from "./memory";
import type { RespondentType, SignalVisibility } from "@prisma/client";

/**
 * Grio's Self Knowledge snapshot — the Marriage Graph, compiled.
 *
 * ## What this is, and what it deliberately is not
 *
 * `context.ts` tells Grio the user's *operational* state: plan, counts, quota,
 * what is unread. That is enough to run the app and nowhere near enough to
 * know a person. This file is the other half — what the user has actually told
 * BandhanTak about the marriage they want, folded into one block.
 *
 * It is a **compiler, not a store**. Every fact below is read through the
 * service that already owns it — `intelligenceService` for signal answers,
 * `provenanceService` for where a profile field came from, `trustScoreService`
 * for verification, `deepProfileService` for the model's own read, `getMemory`
 * for what the user asked to be remembered. Nothing here re-derives a value, and
 * nothing here writes. If a fact's meaning changes, it changes in one place and
 * this file inherits it — the same rule `context.ts` follows by reusing
 * `getActivitySnapshot` rather than re-counting.
 *
 * ## The one rule that makes this safe to say out loud
 *
 *   **Every fact carries where it came from, and the tag travels with it into
 *   the prompt.**
 *
 * A matrimony assistant that says "aap nuclear family chahte ho" when nobody
 * ever said that — it was read off a form, or worse, guessed by a model — is
 * not a smarter assistant, it is a confident one. `KnowledgeSource` is what
 * keeps those apart, and `formatSelfKnowledge` prints it on every single line
 * so the distinction cannot be lost between here and the model. The prompt-side
 * half of the same rule is `GRIO_KNOWLEDGE_RULES` below: the tags say what each
 * fact is, that block says how each kind may be spoken about.
 *
 * `AI_INFERRED`/`BIODATA_EXTRACTED`-and-unconfirmed never becomes DECLARED —
 * that is `isUnconfirmedInference` doing exactly the job it was written for.
 * A parent's subjective answer about their child never becomes the child's
 * statement — that is `confirmed: false` from `saveSignalAnswer`, surfaced here
 * as its own bucket rather than folded in.
 *
 * ## Boundary
 *
 * One user, always their own. Nothing here reads another person's attributes,
 * so nothing here can be ranked — the same structural argument `dossier.ts`
 * makes for candidate scope, from the other direction. MATCH_PRIVATE and
 * PRIVATE answers *are* included, because "private" in that enum means private
 * from third parties and Grio is talking to the owner; the block must therefore
 * never be built for anyone but the signed-in caller.
 *
 * ## Cost
 *
 * Indexed reads only, no AI call, nothing written. `prisma.profile.findUnique`
 * rather than `getOrCreateProfile` for the same reason `context.ts` uses it:
 * asking Grio what it knows about you must never be the thing that creates
 * your profile row.
 */

/* ------------------------------------------------------------------ */
/* Provenance                                                          */
/* ------------------------------------------------------------------ */

/**
 * How Grio came to know a thing. Ordered loosely by how much weight a sentence
 * built on it may carry.
 *
 *   DECLARED       — the user said it, in their own words or by tapping an option
 *   CONFIRMED      — a model read it out of a biodata/voice and the user agreed
 *   FAMILY_SAID    — somebody other than the candidate answered on their behalf
 *   INFERRED       — a model produced it and nobody has confirmed it
 *   BEHAVIOURAL    — computed from what the user did, never from what they said
 *   VERIFIED       — backed by evidence outside anybody's claim
 *   UNKNOWN_SOURCE — the value is real; how it got there was never recorded
 *
 * ## The two rules that decide every classification below
 *
 * **Who was at the keyboard beats how sure the row looks.** `respondentType` is
 * checked before `confirmed`, always. A parent answering an *objective*
 * question about their child is stored `confirmed: true` by `saveSignalAnswer`,
 * because `selfRequired` only guards the subjective ones — and that is the
 * right storage decision. It is the wrong thing to *say*. "Tumne bataya tha"
 * about something the candidate never said is the most damaging sentence this
 * feature could produce, and it is damaging in proportion to how confident it
 * sounds. Confirmation upgrades a fact from inference to statement; it never
 * changes *whose* statement it is.
 *
 * **Absent evidence is its own answer.** A profile field with no provenance row
 * is not a field the user typed — it is a field nobody recorded the origin of.
 * Most of them probably were typed. "Probably" is not what DECLARED means, and
 * a graph that rounds unrecorded up to certain manufactures exactly the
 * confidence this file exists to prevent.
 */
export type KnowledgeSource =
  | "DECLARED"
  | "CONFIRMED"
  | "FAMILY_SAID"
  | "INFERRED"
  | "BEHAVIOURAL"
  | "VERIFIED"
  /** A managed-draft contribution the owner has not yet confirmed. */
  | "HELPER_SAID"
  /** A managed-draft contribution the owner reviewed and accepted as true. */
  | "HELPER_CONFIRMED"
  | "UNKNOWN_SOURCE";

/**
 * The Hinglish the model actually reads, in square brackets after every fact.
 *
 * Written as a phrase rather than an enum name on purpose: the model is being
 * asked to *speak differently* about each of these, and "AI_INFERRED" is a
 * label it has to remember the meaning of, while "andaaza — inhone khud nahi
 * kaha" is the meaning.
 */
const SOURCE_TAG: Record<KnowledgeSource, string> = {
  DECLARED: "user ne khud bataya",
  CONFIRMED: "AI ne padha, user ne confirm kiya",
  FAMILY_SAID: "parivaar ne bataya, user ne khud nahi",
  INFERRED: "andaaza — user ne khud nahi kaha",
  BEHAVIOURAL: "user ke istemaal se nikla, kaha nahi gaya",
  VERIFIED: "saboot ke saath verify ho chuka hai",
  HELPER_SAID: "ek partner/helper ne bhara, user ne abhi khud confirm nahi kiya",
  HELPER_CONFIRMED: "ek partner/helper ne bhara, user ne khud confirm kiya",
  UNKNOWN_SOURCE: "profile me likha hai, par kisne likha ye record nahi hai",
};

export interface KnownFact {
  label: string;
  value: string;
  source: KnowledgeSource;
  /**
   * Catalog key when this came from Marriage Intelligence; absent for identity,
   * Vibe and Deep Profile facts. What lets a later reader — the family-gap
   * comparison, the Compatibility Lab — line this fact up against the same
   * question answered by somebody else, without re-deriving which question it
   * was from the label.
   */
  key?: string;
  /**
   * Where the answer is allowed to surface, straight off the catalog. Every
   * reader inherits one decision rather than writing its own filter — the rule
   * `profileVisibleAnswers` already enforces on the profile page.
   */
  visibility?: SignalVisibility;
  /**
   * False when the app itself flags this as awaiting the candidate's own word —
   * `selfRequired` answered by a parent. Distinct from `source`: a parent
   * answering an objective question is FAMILY_SAID *and* confirmed, and only
   * the subjective ones carry an outstanding ask.
   */
  confirmed?: boolean;
}

/**
 * Which of the four sources an area came from.
 *
 * Exists so `compact` can drop sections by *what they are* rather than by
 * position. A `slice(0, n)` would have been shorter and would have meant
 * "whichever areas happen to be first", which changes silently the moment a
 * layer is added to the catalog — and the thing it would have dropped is the
 * Marriage Intelligence answers, the one part a candidate comparison actually
 * needs.
 */
export type KnowledgeAreaKind = "identity" | "verified" | "layer" | "vibe" | "deep";

export interface KnowledgeArea {
  kind: KnowledgeAreaKind;
  /** Layer title where one exists ("Bachche aur parenting"), else a plain heading. */
  title: string;
  facts: KnownFact[];
}

/**
 * Something Grio does not know, with everything needed to ask it properly.
 *
 * The catalog fields ride along (`question`, `options`, `whyNeeded`) so Grio can
 * ask in the user's own conversation instead of pointing at a form — and so the
 * answer it gets back can be saved through the *existing* structured path
 * rather than a second one invented for chat. `key` is what makes that possible
 * and is why this is not merely a list of labels.
 */
export interface UnknownFact {
  key: string;
  label: string;
  question: string;
  options: string[];
  why: string;
  area: string;
  /** Catalog layer order, required-first. Lower is asked sooner. */
  rank: number;
  /**
   * False when this gap cannot be closed from a conversation.
   *
   * True of exactly one question today — `dealBreakerCodes`, which takes up to
   * five answers. `<<<LEARN:key=option>>>` carries one, and `saveSignalAnswer`
   * *replaces* the stored set rather than appending to it, so a one-value save
   * against a multi-select is not a partial answer, it is four answers thrown
   * away. Grio still names the gap out loud; it simply does not get handed the
   * key, so the marker it would need cannot be formed. See `formatSelfKnowledge`.
   */
  askableInChat: boolean;
}

/**
 * How much of the graph to compile. `compact` is what a candidate-scoped turn
 * asks for — see `buildSelfKnowledge`, where it decides which queries run at
 * all rather than merely what gets printed.
 */
export type SelfKnowledgeMode = "full" | "compact";

export interface SelfKnowledgeSnapshot {
  /** What was compiled, so the formatter cannot print a section nobody fetched. */
  mode: SelfKnowledgeMode;
  /** Null when there is no profile row yet — callers skip the whole block. */
  hasProfile: boolean;
  /**
   * "Grio kitna samajhta hai" — layer coverage, never profile completion.
   * Those are different facts and collapsing them is the exact bug the
   * Marriage Intelligence layer was built to end.
   */
  coverage: { layersComplete: number; layersTotal: number; answered: number; total: number };
  areas: KnowledgeArea[];
  /** Best-first. Callers show a handful, never the tail. */
  unknowns: UnknownFact[];
  /** Answers a parent gave that only the candidate can really settle. */
  needsConfirmation: KnownFact[];
  trust: { score: number | null; label: string; verified: string[]; missing: string[] };
  family: { members: number; activity: string[]; blessing: boolean };
  /**
   * Where the user and their family expect different things. Null in compact
   * mode and when nobody in the family has answered anything.
   */
  expectationGaps: ExpectationGapReport | null;
  /** What the user explicitly asked Grio to remember. */
  memory: GrioMemoryEntryView[];
  /** Usage-derived. Never spoken as a preference — see `SOURCE_TAG.BEHAVIOURAL`. */
  behaviour: string[];
  /**
   * The rishtey that are actually live, with their stage. Full mode only.
   *
   * Names and stages, never attributes — the same line `roster.ts` draws. What
   * this adds over the roster is *direction*: the roster says who is in front of
   * the user today, this says where each one has reached and who owes a reply.
   */
  activeRishtey: { name: string; stage: string; awaitingReply: boolean }[];
}

/* ------------------------------------------------------------------ */
/* Identity facts                                                      */
/* ------------------------------------------------------------------ */

/**
 * The profile fields worth reflecting back, not every field there is.
 *
 * A dump would cost tokens on every turn and teach the model to recite a form.
 * These are the ones a person would actually mention when introducing
 * themselves — which is also, not coincidentally, the set a rishta conversation
 * turns on. Labels come from `FIELD_BY_KEY` so a rename lands here too.
 */
const IDENTITY_FIELDS = [
  "dateOfBirth",
  "currentCity",
  "education",
  "profession",
  "maritalStatus",
  "motherTongue",
  "diet",
  "familyType",
] as const;

/**
 * Where one profile field came from.
 *
 * `profileRespondent` is the fallback authority, and it is why a missing row is
 * not UNKNOWN_SOURCE in every case: `Profile.respondentType` records who filled
 * the profile at all, which is real if coarse evidence. If a parent built this
 * profile then no field on it is the candidate's own statement, whether or not
 * anybody recorded how each value arrived. If the profile is self-filled, a
 * missing row leaves only the *manner* unrecorded — typed, extracted, inferred
 * — and that is genuinely unknown rather than merely unlabelled.
 */
function sourceForField(
  view: FieldProvenanceView | undefined,
  profileRespondent: RespondentType,
): KnowledgeSource {
  if (!view) {
    if (profileRespondent === "PARENT") return "FAMILY_SAID";
    if (profileRespondent === "PARTNER") return "HELPER_SAID";
    return "UNKNOWN_SOURCE";
  }
  // A managed-draft contribution answers this before anything else: who
  // supplied it and whether the owner has personally stood behind it are two
  // separate facts, and both matter more than how the contributor typed it.
  if (view.source === "PARTNER_ENTERED" || view.source === "FAMILY_ENTERED") {
    if (view.confirmed) return "HELPER_CONFIRMED";
    return view.source === "FAMILY_ENTERED" ? "FAMILY_SAID" : "HELPER_SAID";
  }
  // Whose answer it is, before how sure the row looks — see the header note.
  if (view.respondentType === "PARENT") return "FAMILY_SAID";
  if (view.respondentType === "PARTNER") return "HELPER_SAID";
  if (isUnconfirmedInference(view)) return "INFERRED";
  if (view.source === "USER_CONFIRMED_AI") return "CONFIRMED";
  return "DECLARED";
}

/**
 * The only facts in this file that may carry VERIFIED.
 *
 * VERIFIED means "somebody other than the claimant established this", and in
 * this codebase exactly three things clear that bar: a mobile number that
 * completed an OTP round-trip, an email that did the same, and a photo a human
 * reviewer approved. Nothing else — not education, not profession, not income —
 * has any verification path today, so nothing else can be tagged with it.
 *
 * Stated as its own function rather than a branch inside `sourceForField`
 * because the temptation this guards against is specific: `trustScoreService`
 * already awards points for "Education Added" and "Profession Added", and those
 * read like verification labels while meaning only "the field is non-empty".
 * Wiring VERIFIED to the trust factors would have produced
 * `Education: CA [saboot ke saath verify ho chuka hai]` for a value the user
 * typed and nobody checked — a lie with an audit trail behind it.
 *
 * When document verification lands, it extends this list. Until then the tag
 * has three legitimate producers and no others.
 */
function verifiedFacts(
  user: { mobileVerifiedAt: Date | null; emailVerifiedAt: Date | null } | null,
  approvedPhotos: number,
): KnownFact[] {
  const out: KnownFact[] = [];
  if (user?.mobileVerifiedAt) {
    out.push({ label: "Mobile number", value: "verified", source: "VERIFIED" });
  }
  if (user?.emailVerifiedAt) {
    out.push({ label: "Email", value: "verified", source: "VERIFIED" });
  }
  if (approvedPhotos > 0) {
    out.push({
      label: "Photo",
      value: `${approvedPhotos} photo review me pass ho chuki hai`,
      source: "VERIFIED",
    });
  }
  return out;
}

/** Years, not a date — "29 saal" is what a person says; the ISO string is not. */
function ageFrom(dob: string): string | null {
  const born = new Date(dob);
  if (Number.isNaN(born.getTime())) return null;
  const years = Math.floor((Date.now() - born.getTime()) / (365.25 * 86_400_000));
  return years > 0 && years < 120 ? `${years} saal` : null;
}

function identityFacts(
  values: Record<string, string>,
  provenance: Map<string, FieldProvenanceView>,
  profileRespondent: RespondentType,
): KnownFact[] {
  const out: KnownFact[] = [];
  for (const key of IDENTITY_FIELDS) {
    const raw = values[key];
    if (!raw || !raw.trim()) continue;
    const value = key === "dateOfBirth" ? ageFrom(raw) : raw.trim();
    if (!value) continue;
    out.push({
      label: key === "dateOfBirth" ? "Umar" : (FIELD_BY_KEY[key]?.label ?? key),
      value,
      source: sourceForField(provenance.get(key), profileRespondent),
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Marriage Intelligence → areas + unknowns                            */
/* ------------------------------------------------------------------ */

/**
 * A signal answer's provenance, read off the row rather than assumed.
 *
 * `respondentType` is tested first and unconditionally. That ordering is the
 * whole correctness of this function, and getting it backwards is subtle enough
 * to be worth spelling out.
 *
 * `saveSignalAnswer` writes `confirmed = !(selfRequired && respondent !== SELF)`.
 * So a parent answering a question the catalog does *not* mark `selfRequired` —
 * marriage timeline, living plan, relocation — produces a row that is
 * `respondentType: PARENT` **and** `confirmed: true`. Reading `confirmed` first
 * classified every one of those as DECLARED, and Grio would then tell the
 * candidate "aapne bataya tha ki 6-12 months me shaadi karni hai" about a
 * timeline their father entered. The row was never wrong; the reading was.
 *
 * `derivedSignals` makes the same trap wider: it translates legacy profile
 * fields into answers with a hard-coded `confirmed: true`, carrying the
 * profile's respondentType along. A parent-built profile therefore yields a
 * whole set of confident-looking answers the candidate never gave.
 *
 * Hence PARENT is FAMILY_SAID no matter how confident the row looks.
 */
function sourceForSignal(view: {
  confirmed: boolean;
  respondentType: string;
  source: string;
}): KnowledgeSource {
  if (view.respondentType === "PARENT") return "FAMILY_SAID";
  if (view.confirmed) {
    return view.source === "USER_CONFIRMED_AI" ? "CONFIRMED" : "DECLARED";
  }
  return "INFERRED";
}

function valueLabel(value: string | string[]): string {
  return asList(value).join(", ") || "—";
}

/**
 * One pass over the catalog producing both halves of the graph: what is
 * answered (grouped by layer) and what is not (ranked).
 *
 * Branch conditions are honoured on both sides, which matters more for the
 * unknown half than the known one — a question that does not currently apply
 * ("bachche kab tak" when the user said they do not want children) must never
 * be offered as a gap. `applicableQuestions` is the same resolver the layer
 * flow uses, so chat and form never disagree about what is still open.
 */
function walkIntelligence(state: IntelligenceState): {
  areas: KnowledgeArea[];
  unknowns: UnknownFact[];
  needsConfirmation: KnownFact[];
} {
  const lookup = makeLookup(state.answers, state.values);
  const forSelf = state.respondentType === "SELF";

  const areas: KnowledgeArea[] = [];
  const unknowns: UnknownFact[] = [];
  const needsConfirmation: KnownFact[] = [];

  INTELLIGENCE_LAYERS.forEach((layer, layerIndex) => {
    const facts: KnownFact[] = [];

    for (const q of applicableQuestions(layer.key, lookup)) {
      const answer = state.answers.get(q.key);
      if (!answer) {
        unknowns.push({
          key: q.key,
          label: q.label,
          question: intelligenceQuestionFor(q, forSelf),
          options: [...q.options],
          why: q.whyNeeded,
          area: layer.title,
          askableInChat: !q.multi,
          // Layer order is the catalog's own ask order and already encodes
          // which areas matter most; required-first inside it. Inventing a
          // second priority list here would be a second source of truth that
          // drifts from the flow the user sees on the form.
          rank: layerIndex * 10 + (q.required ? 0 : 5),
        });
        continue;
      }

      const source = sourceForSignal(answer);
      const fact: KnownFact = {
        label: q.label,
        value: valueLabel(answer.value),
        source,
        key: q.key,
        visibility: q.visibility,
        confirmed: answer.confirmed,
      };
      facts.push(fact);
      if (source === "FAMILY_SAID") needsConfirmation.push(fact);
    }

    if (facts.length > 0) areas.push({ kind: "layer", title: layer.title, facts });
  });

  unknowns.sort((a, b) => a.rank - b.rank);
  return { areas, unknowns, needsConfirmation };
}

/* ------------------------------------------------------------------ */
/* Build                                                               */
/* ------------------------------------------------------------------ */

/**
 * Below this a swipe ratio is noise. Three rights out of four swipes is not a
 * selective person, it is somebody who has opened the reel twice — and reading
 * a personality off it would be exactly the behavioural over-claim the tag
 * exists to prevent.
 */
const MIN_SWIPES_FOR_RATIO = 20;

/** Beyond this the list stops being "who am I talking to" and becomes a CRM export. */
const MAX_ACTIVE_RISHTEY = 6;

/**
 * The rishtey that are actually live, newest first.
 *
 * Deliberately matches only — an interest that was never reciprocated is
 * pending, not a relationship, and it is already in the pending briefing. Stage
 * comes from `deriveStage` rather than the stored confirmation, because this is
 * a list not a detail view and the confirmed stage is one query per row; the
 * summary block for one person carries the full picture when the user asks.
 */
async function listActiveRishtey(
  userId: string,
): Promise<{ name: string; stage: string; awaitingReply: boolean }[]> {
  const matches = await prisma.match.findMany({
    where: { OR: [{ userAId: userId }, { userBId: userId }] },
    orderBy: { createdAt: "desc" },
    take: MAX_ACTIVE_RISHTEY,
    select: {
      userAId: true,
      userBId: true,
      userA: { select: { profile: { select: { displayName: true } } } },
      userB: { select: { profile: { select: { displayName: true } } } },
      messages: { orderBy: { createdAt: "desc" }, take: 1, select: { senderId: true } },
      _count: { select: { messages: true } },
    },
  });

  return matches.map((m) => {
    const otherIsA = m.userAId !== userId;
    const name = (otherIsA ? m.userA : m.userB).profile?.displayName?.trim() || "Naam nahi";
    const last = m.messages[0];
    return {
      name,
      stage: m._count.messages === 0 ? "baat shuru nahi hui" : "baat chal rahi hai",
      // They spoke last, so the user owes a reply. Null last message means
      // nobody has spoken and nobody is waiting on anybody.
      awaitingReply: last !== undefined && last.senderId !== userId,
    };
  });
}

/** Beyond this a "here is what I know" answer becomes a recital of a form. */
const MAX_SOCH_ANSWERS = 6;
const MAX_FAMILY_ACTIVITY = 3;
export const MAX_UNKNOWNS_SHOWN = 5;

/**
 * `compact` is not a rendering flag — it changes what is *fetched*.
 *
 * Trust, Family Circle and behavioural signals are the three sections a scoped
 * turn never prints, and between them they are six of this function's queries.
 * Running them and then discarding the result would put the largest share of
 * the waste on the most expensive turn in the route — the one that also builds
 * a candidate dossier, a fit breakdown and a kundli view.
 *
 * The mode therefore travels *on the snapshot*, so `formatSelfKnowledge` cannot
 * be handed a compact snapshot and asked to print sections that were never
 * fetched. One decision, made once, read everywhere.
 */
export async function buildSelfKnowledge(
  userId: string,
  mode: SelfKnowledgeMode = "full",
): Promise<SelfKnowledgeSnapshot | null> {
  const profile = await prisma.profile.findUnique({
    where: { userId },
    include: PROFILE_FULL_INCLUDE,
  });
  if (!profile) return null;

  const full = mode === "full";

  const [
    user,
    intelligence,
    provenance,
    deep,
    soch,
    streak,
    familyMembers,
    familyActivity,
    blessing,
    expectationGaps,
    badge,
    swipeMix,
    activeRishtey,
    memory,
    approvedPhotos,
  ] = await Promise.all([
    full
      ? prisma.user.findUnique({
          where: { id: userId },
          select: { mobileVerifiedAt: true, emailVerifiedAt: true },
        })
      : null,
    buildIntelligenceState(profile),
    getFieldProvenance(profile.id),
    // Both are `full`-only for the same reason as the block below: a scoped
    // turn prints neither, and between them they are the most expensive reads
    // here — `getDeepProfileView` resolves entitlements before it can decide
    // which dimensions the caller may even see.
    full ? getDeepProfileView(userId) : null,
    // Owner previewing their own board — the one call that returns every vote
    // regardless of the public toggle, which is correct here because the
    // audience is the owner.
    full ? getSochBoard(userId, userId) : null,
    full ? getVibeStreak(userId) : 0,
    full ? listFamilyMembers(userId) : [],
    full ? getRecentFamilyActivity(userId, MAX_FAMILY_ACTIVITY) : [],
    full ? getOwnParentBlessingStatus(userId) : null,
    full ? getExpectationGapReport(userId).catch(() => null) : null,
    full ? getBadgeState(userId) : NO_BADGE,
    // What the user actually does in the reel, grouped by direction. Behaviour,
    // never preference — see the BEHAVIOURAL tag.
    full
      ? prisma.swipeAction.groupBy({ by: ["direction"], where: { actorUserId: userId }, _count: { _all: true } })
      : [],
    full ? listActiveRishtey(userId) : [],
    getMemoryEntries(userId),
    // The only real verification evidence in this codebase beyond the two
    // columns above. Counted rather than listed — which photo cleared review is
    // not a fact about the person.
    full
      ? prisma.profilePhoto.count({
          where: { profileId: profile.id, verificationStatus: "APPROVED", deletedAt: null },
        })
      : 0,
  ]);

  const { draftValues } = computeCompletion(profile);
  const { areas, unknowns, needsConfirmation } = walkIntelligence(intelligence);

  /* Identity first — it is what a person leads with. */
  const identity = identityFacts(draftValues, provenance, profile.respondentType);
  if (identity.length > 0) areas.unshift({ kind: "identity", title: "Basic pehchaan", facts: identity });

  /* The three things somebody other than the user established. */
  const verified = verifiedFacts(user, approvedPhotos);
  if (verified.length > 0) {
    areas.push({ kind: "verified", title: "Jo verify ho chuka hai", facts: verified });
  }

  /* Soch — the user's own taps on the daily question. Declared, not inferred. */
  if (soch && soch.length > 0) {
    areas.push({
      kind: "vibe",
      title: "Roz ke sawaalon ke jawab (Vibe)",
      facts: soch.slice(0, MAX_SOCH_ANSWERS).map((s) => ({
        label: s.question,
        value: s.chosenOption,
        source: "DECLARED" as const,
      })),
    });
  }

  /* Deep Profile — a model's read of everything above. Inferred, always. */
  const deepFacts = (deep?.unlocked ?? [])
    .filter((d) => d.scoreValue !== null)
    .map((d) => ({ label: d.label, value: d.scoreLabel, source: "INFERRED" as const }));
  if (deepFacts.length > 0) {
    areas.push({ kind: "deep", title: "Deep Profile (AI ka apna padha hua)", facts: deepFacts });
  }

  const trust = user
    ? computeTrustScore(user, profile)
    : { trustScore: null, scoreLabel: "UNKNOWN" as const, positiveFactors: [], improvementFactors: [] };

  const behaviour: string[] = [];
  if (streak > 1) behaviour.push(`Vibe ke roz ke sawaal ka jawab lagatar ${streak} din se de rahe hain`);
  if (badge.eventsAttended > 0) {
    behaviour.push(
      `Serious Circle me ${badge.eventsAttended} baar shaamil ho chuke hain` +
        (badge.active ? ", Shaadi Ready badge abhi active hai" : ""),
    );
  }
  if (deep?.hasAnyComputed) behaviour.push("Deep Profile analyze kara chuke hain");

  /*
   * Reel behaviour, as a ratio rather than a tally.
   *
   * "120 profiles dekhe" says nothing; "har 10 me se 1 par interest" says how
   * selective this person is, which is the only thing about swiping that is
   * worth an assistant knowing. Still BEHAVIOURAL: it is what they did, and it
   * must never be spoken as "aapko aise log pasand hain".
   */
  const swipeTotal = swipeMix.reduce((n, r) => n + r._count._all, 0);
  if (swipeTotal >= MIN_SWIPES_FOR_RATIO) {
    const right = swipeMix.find((r) => r.direction === "RIGHT")?._count._all ?? 0;
    const down = swipeMix.find((r) => r.direction === "DOWN")?._count._all ?? 0;
    behaviour.push(
      `Reel me ab tak ${swipeTotal} rishtey dekhe — ${right} par interest bheja, ${down} shortlist kiye`,
    );
  }
  if (activeRishtey.length > 0) {
    const waiting = activeRishtey.filter((r) => r.awaitingReply).length;
    behaviour.push(
      `${activeRishtey.length} rishtey abhi chal rahe hain` + (waiting > 0 ? `, ${waiting} me jawab user ki taraf se baaki hai` : ""),
    );
  }

  return {
    mode,
    hasProfile: true,
    coverage: {
      layersComplete: intelligence.progress.completedLayers,
      layersTotal: intelligence.progress.totalLayers,
      answered: intelligence.progress.answeredQuestions,
      total: intelligence.progress.totalQuestions,
    },
    areas,
    unknowns,
    needsConfirmation,
    trust: {
      score: trust.trustScore,
      label: trust.scoreLabel,
      verified: trust.positiveFactors.map((f) => f.label),
      missing: trust.improvementFactors.map((f) => f.label),
    },
    family: {
      members: familyMembers.length,
      activity: familyActivity.map((a) =>
        a.kind === "SHORTLIST"
          ? `${a.familyMemberName} ne ${a.targetDisplayName} ko shortlist kiya`
          : `${a.familyMemberName} ne ${a.targetDisplayName} par note likha`,
      ),
      blessing: blessing !== null,
    },
    expectationGaps,
    memory,
    behaviour,
    activeRishtey,
  };
}

/* ------------------------------------------------------------------ */
/* LEARN authorization                                                 */
/* ------------------------------------------------------------------ */

/**
 * Strips every `<<<LEARN:key=option>>>` the signed-in user is not currently
 * open to being asked, before the reply leaves the server.
 *
 * ## Why the prompt alone was not enough
 *
 * The instruction block hands the model keys only for questions that are
 * unanswered and applicable, and it was tempting to call that structural. It is
 * not, for two reasons that compound:
 *
 *  1. `GRIO_LEARN_INSTRUCTIONS` contains a **worked example built from a real
 *     catalog key**. That key is in the model's context on every single turn,
 *     including turns where the user answered that question months ago.
 *  2. `/api/profile/intelligence` **upserts**. A confirmation tap on a stale
 *     key does not fail — it overwrites a real answer with whatever the model
 *     inferred from an unrelated sentence.
 *
 * The confirmation tap is a real gate and it is why this was never dangerous.
 * But a card that should not exist is still a card the user has to read,
 * evaluate and dismiss, and the one they dismiss carelessly is the one that
 * silently rewrites their marriage timeline. So the allowlist moves from the
 * prompt (a request) to here (a rule).
 *
 * ## Why it strips rather than rejects
 *
 * Same reasoning `parseGrioSegments` gives for dropping an unknown action key:
 * the prose around the marker is a perfectly good reply. Failing the turn, or
 * surfacing an error, would punish the user for a model's bookkeeping mistake.
 * The reply arrives with one fewer card — the documented failure mode for every
 * other marker in this system.
 */
export interface LearnAllowlist {
  /** Question key → the exact options that question accepts. */
  byKey: Map<string, Set<string>>;
}

/**
 * Built from the snapshot's own unknowns, so "what may be asked" and "what was
 * offered to the model" cannot drift — they are the same list.
 *
 * `askableInChat` is honoured here too: a multi-select never enters the
 * allowlist, so even a hand-crafted marker for one is stripped.
 */
export function buildLearnAllowlist(snap: SelfKnowledgeSnapshot | null): LearnAllowlist {
  const byKey = new Map<string, Set<string>>();
  if (!snap) return { byKey };
  for (const u of snap.unknowns) {
    if (!u.askableInChat) continue;
    byKey.set(u.key, new Set(u.options));
  }
  return { byKey };
}

/** Trimmed, case- and dash-insensitive — the en-dash in "6–12 months" is the real miss. */
function normaliseOption(value: string): string {
  return value.trim().toLowerCase().replace(/[–—-]/g, "-").replace(/\s+/g, " ");
}

/**
 * Returns the reply with unauthorized LEARN markers removed.
 *
 * A marker whose key is allowed but whose option is a near-miss ("6-12 months"
 * for "6–12 months") is **kept and rewritten to the catalog's exact spelling**
 * rather than dropped. The card would have recovered from it anyway by showing
 * the full option list, but rewriting here means the common case stays one tap
 * instead of two, and it keeps the recovery logic on the server where the
 * catalog is authoritative.
 */
export function authorizeLearnMarkers(reply: string, allow: LearnAllowlist): string {
  if (!reply.includes(LEARN_MARKER_START)) return reply;

  let out = "";
  let rest = reply;

  while (true) {
    const start = rest.indexOf(LEARN_MARKER_START);
    if (start === -1) {
      out += rest;
      break;
    }
    const afterStart = rest.slice(start + LEARN_MARKER_START.length);
    const end = afterStart.indexOf(ACT_MARKER_END);
    if (end === -1) {
      // Truncated mid-marker. `parseGrioSegments` drops it; so do we, and the
      // trailing partial key must not survive as visible text either.
      out += rest.slice(0, start);
      break;
    }

    const body = afterStart.slice(0, end);
    const eq = body.indexOf("=");
    const key = eq === -1 ? "" : body.slice(0, eq).trim();
    const value = eq === -1 ? "" : body.slice(eq + 1).trim();
    const options = allow.byKey.get(key);
    const exact = options
      ? [...options].find((o) => normaliseOption(o) === normaliseOption(value))
      : undefined;

    out += rest.slice(0, start);
    if (exact) out += `${LEARN_MARKER_START}${key}=${exact}${ACT_MARKER_END}`;
    else if (key) {
      console.info(
        `[grio] dropped unauthorized LEARN marker (key=${key}, allowed=${options ? "option-miss" : "not-open"})`,
      );
    }

    rest = afterStart.slice(end + ACT_MARKER_END.length);
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* The block the model reads                                           */
/* ------------------------------------------------------------------ */

/**
 * `compact` drops the long tail — used inside candidate scope, where the prompt
 * already carries a dossier and a consequences block and the self-graph is
 * there to be *compared against*, not recited. The unknowns survive the trim
 * in both modes: a gap is the single most useful thing this block contributes
 * to a "kya ye rishta theek hai" answer.
 */
export function formatSelfKnowledge(snap: SelfKnowledgeSnapshot): string {
  const mode = snap.mode;
  const lines: string[] = [];

  lines.push(
    `Grio ki samajh: ${snap.coverage.layersTotal} me se ${snap.coverage.layersComplete} area poore hue ` +
      `(${snap.coverage.answered}/${snap.coverage.total} sawaal). ` +
      `Ye "profile kitni bhari hai" se alag cheez hai — ye "aapko kitna samjha gaya hai" hai.`,
  );

  // Compact keeps who the user is and what they have said they want — the two
  // things a candidate comparison is made of — and drops the Vibe log and the
  // Deep Profile read, which are never fetched in this mode anyway.
  const areas =
    mode === "compact"
      ? snap.areas.filter((a) => a.kind === "identity" || a.kind === "layer")
      : snap.areas;
  for (const area of areas) {
    const facts = area.facts.map((f) => `- ${f.label}: ${f.value} [${SOURCE_TAG[f.source]}]`);
    lines.push(`\n${area.title}:\n${facts.join("\n")}`);
  }

  if (snap.needsConfirmation.length > 0) {
    lines.push(
      `\nYE PARIVAAR NE BATAYA HAI, USER NE KHUD NAHI:\n` +
        snap.needsConfirmation.map((f) => `- ${f.label}: ${f.value}`).join("\n") +
        `\nIn par baat karte waqt ye maan kar mat chaliye ki user khud yahi sochte hain. Ek baar unse confirm karwa lena kaam ki baat hai.`,
    );
  }

  if (snap.unknowns.length > 0) {
    const shown = snap.unknowns.slice(0, MAX_UNKNOWNS_SHOWN);
    /*
     * The keys and option lists ride along in `full` mode only, and that is
     * what makes `<<<LEARN:>>>` safe rather than merely convenient: the model
     * can propose an answer to a question *only* if that question is on this
     * list, and this list contains exactly the questions that are unanswered
     * and currently applicable. So Grio structurally cannot re-ask something
     * already answered, and cannot ask a branch that does not apply — the two
     * ways an assistant proves it was not listening.
     *
     * Dropped in `compact` (candidate scope) on purpose. A turn spent
     * explaining one rishta is not a turn for profiling, and the labels alone
     * still let Grio say honestly which gaps are limiting the comparison.
     */
    const body = shown
      .map((u) => {
        const head = `- ${u.label} (${u.area}) — kyun zaroori hai: ${u.why}`;
        if (mode === "compact") return head;
        // No key, no marker. A gap that cannot be closed in one answer still
        // gets named — Grio should know what it does not know either way — but
        // it is named without the means to half-close it. See `askableInChat`.
        if (!u.askableInChat) {
          return `${head}\n  (ye ek se zyada jawab wala sawaal hai — ise baat-cheet me save nahi kiya ja sakta, iske liye user ko us screen par jaana hoga)`;
        }
        return (
          `${head}\n  key: ${u.key}\n  Sawaal: ${u.question}\n` +
          `  Sirf yahi jawab chalte hain: ${u.options.join(" | ")}`
        );
      })
      .join("\n");

    lines.push(
      `\nYE AAPKO ABHI NAHI PATA (sabse kaam ki cheez pehle):\n${body}` +
        (snap.unknowns.length > shown.length
          ? `\n...aur ${snap.unknowns.length - shown.length} aur.`
          : ""),
    );
  }

  /*
   * Grio's long-term memory, printed here and nowhere else.
   *
   * It used to be fetched twice — once by this compiler (which then never
   * printed it) and again by the route, which rendered its own block. The model
   * saw each fact exactly once, so nothing looked broken; what was broken was
   * ownership. Two fetches are two places that can disagree about what memory
   * *is*, and typed memory would have had to land in both or silently diverge
   * in one.
   *
   * The graph owns it. A remembered fact is something the user told Grio about
   * themselves, which is the definition of what this file compiles.
   *
   * Printed in both modes, unlike trust and family: "Bangalore preferred hai"
   * is exactly the kind of thing that should surface while looking at a rishta
   * in another city, and the block is a handful of short lines.
   */
  if (snap.memory.length > 0) {
    lines.push(
      `\nUSER NE KHUD YAAD RAKHNE KO KAHA THA:\n` +
        // Grouped by kind, with supersession history, by `formatMemoryEntries`.
        // A boundary and a passing preference are not the same instruction and
        // a flat bullet list said they were.
        formatMemoryEntries(snap.memory) +
        `\nInhe yaad rakhiye, par har baar dohraaiye mat. Koi baat purani ya galat lage to user se poochh lijiye — khud badal mat dijiye.`,
    );
  }

  if (mode === "full") {
    if (snap.trust.score !== null) {
      lines.push(
        `\nTrust: ${snap.trust.score}/100 (${snap.trust.label}). ` +
          `Verify ho chuka: ${snap.trust.verified.slice(0, 5).join(", ") || "kuch nahi"}. ` +
          `Baaki hai: ${snap.trust.missing.slice(0, 4).join(", ") || "kuch nahi"}.`,
      );
    }

    if (snap.family.members > 0 || snap.family.blessing) {
      const bits = [`Family Circle me ${snap.family.members} log jude hain`];
      if (snap.family.blessing) bits.push("parents ka blessing voice note bhi record ho chuka hai");
      lines.push(
        `\n${bits.join(", ")}.` +
          (snap.family.activity.length > 0 ? `\nHaal ka: ${snap.family.activity.join(" · ")}` : ""),
      );
    }

    /*
     * Where the user and their family expect different things.
     *
     * Kept as its own block rather than folded into the family lines above,
     * because it is the one part of this graph that is *about two parties* and
     * has to be spoken about differently — the rules that ride with it forbid
     * taking a side, and forbid ever suggesting the user tell their family what
     * they themselves answered. Merging it into "Family Circle me 2 log jude
     * hain" would separate those rules from the data they govern.
     */
    const gapBlock = snap.expectationGaps ? formatExpectationGaps(snap.expectationGaps) : null;
    if (gapBlock) lines.push(`\n${gapBlock}`);

    if (snap.behaviour.length > 0) {
      lines.push(
        `\nUSER KE ISTEMAAL SE NIKLI BAATEIN (ye unhone kaha nahi hai — inhe unki raay ki tarah mat boliye):\n` +
          snap.behaviour.map((b) => `- ${b}`).join("\n"),
      );
    }
  }

  return `AAPKA USER KAUN HAI — JO AAP UNKE BAARE ME JAANTE HAIN:
${lines.join("\n")}`;
}

/**
 * How to speak about each provenance tag.
 *
 * Static, so it rides in the cached `system` prefix — and it has to be there on
 * every turn rather than only when the snapshot is present, because the rule it
 * states ("inference is never a fact") is one the model must follow whether or
 * not this particular request happened to compile a graph.
 *
 * The reason this is prose rather than a single "be careful" line: the failure
 * it prevents is not the model *lying*, it is the model flattening six kinds of
 * knowing into one voice. "Aap nuclear family chahte ho" and "aapke answers se
 * lagta hai ki aap nuclear lean karte ho" are both defensible sentences; saying
 * the first when only the second is earned is how an assistant becomes
 * untrustworthy without ever stating a falsehood.
 */
export const GRIO_KNOWLEDGE_RULES = `

AAP USER KE BAARE ME KAISE BOLENGE — har baat ke aage [] me likha hai ki wo baat aapko kahan se pata chali. Ye tag sirf aapke liye hai, user ko kabhi mat dikhaiye; par kis lehje me bolna hai, wo isi se tay hota hai:
- [user ne khud bataya] — seedha bol sakte hain: "aapne bataya tha ki...", "aapke liye ye important hai".
- [AI ne padha, user ne confirm kiya] — yahi lehja chalega, ye bhi unki apni baat hai.
- [parivaar ne bataya, user ne khud confirm nahi kiya] — kabhi user ki apni raay bana kar mat boliye. "Ghar se ye bataya gaya tha" kahiye, aur zaroorat ho to ek baar confirm karwa lijiye.
- [andaaza — user ne khud nahi kaha] — ye sach nahi, sirf andaaza hai. Hamesha "lagta hai", "aapke jawabon se aisa lagta hai" jaisi bhasha. "Aap aise hain" kabhi nahi.
- [user ke istemaal se nikla, kaha nahi gaya] — ye unka vyavhaar hai, unki raay nahi. "Aap roz jawab de rahe hain" theek hai; "aapko ye pasand hai" nahi.
- [ek partner/helper ne bhara, user ne abhi khud confirm nahi kiya] — ye kisi teesre insaan ki batayi baat hai. Use user ki apni baat bana kar mat boliye; "aapke liye jo draft bhara gaya tha usme ye likha hai" kahiye aur confirm karne ko kahiye.
- [ek partner/helper ne bhara, user ne khud confirm kiya] — user ne khud haan ki hai, to seedha bol sakte hain.
- [verify ho chuka hai] — isi ek tarah ki baat par aap poora bharosa jata sakte hain.

Aur do baatein:
- Jo cheez aapko NAHI pata, wo bhi ek jawab hai — aur aksar sabse kaam ka. "Ye mujhe abhi nahi pata" kehna kamzori nahi hai; andaaza laga kar bol dena kamzori hai.
- Jab user poochein "tum mere baare me kya jaante ho" (ya usi tarah ka kuch), to teen cheezein dijiye: jo aapko pakka pata hai (chhoti si list, sab nahi), jo aap sirf andaaza laga sakte hain, aur 2-3 sabse kaam ki cheezein jo abhi nahi pata. Poori list mat dohraaiye — 6-8 baatein kaafi hain, aur unme se wahi chuniye jo shaadi ke faisle par asar daalti hain.`;

/**
 * How Grio asks for a missing answer, and what it does with the reply.
 *
 * Static (rides in the cached `system` prefix) even though the questions it
 * governs are volatile, for the same reason `GRIO_WHO_INSTRUCTIONS` is: the
 * *rules* for using a list change only on deploy, the list changes every turn.
 *
 * ## The one instruction that does the real work
 *
 * "Sirf wahi option jo upar likha hai, hu-ba-hu." Everything else here is
 * politeness; that line is the safety property. `saveSignalAnswer` will reject
 * anything outside the option list, so a paraphrase does not become a wrong
 * fact — but it does become a 422 the user never sees, which is the silent
 * failure mode `FORMAT_EXAMPLES` was written to fight on the other markers.
 * `GrioLearnCard` catches near-misses by falling back to the full option list;
 * this block is what keeps that fallback rare rather than routine.
 *
 * ## Why one question at a time
 *
 * The layer flow asks one question per screen and that shape is not arbitrary —
 * a conversation that answers a message with three questions stops being a
 * conversation. The cap is stated as a rule rather than enforced in the parser
 * because two `<<<LEARN:>>>` markers are perfectly renderable; they are just
 * bad manners, and the failure of bad manners is a user who stops talking.
 */
/**
 * A worked example, generated from the catalog rather than typed out.
 *
 * The reasoning is `ACTION_INSTRUCTIONS`' word for word: an example that teaches
 * a key which no longer exists is worse than no example, because every marker
 * failure in `parseGrioSegments` is silent — the user gets a reply with one
 * fewer card than the model intended and nobody finds out. Hand-writing the
 * option strings here would put a second copy of them one rename away from
 * being wrong.
 *
 * It exists at all because prose alone is measurably not enough for the smaller
 * models this route is switchable to, and because this marker has a specific
 * trap the others do not: the model has to resist paraphrasing. The user says
 * "ghar alag, par mummy-papa ke paas" and the natural thing to write is those
 * words. The example is here to show the unnatural thing — reaching back into
 * the option list and copying one out.
 *
 * Empty string if the question ever leaves the catalog, so the block degrades
 * to prose-only instead of teaching a key that resolves to nothing.
 */
/**
 * The question the worked example is built from — a living arrangement, chosen
 * because it is the gap most likely to come up unprompted in a real
 * conversation and because its options are the ones a person is most likely to
 * paraphrase rather than quote.
 */
const LEARN_EXAMPLE_KEY = "postMarriageLivingPlan";

const LEARN_EXAMPLE = (() => {
  const q = INTELLIGENCE_QUESTION_BY_KEY[LEARN_EXAMPLE_KEY];
  // The option a person would arrive at from "ghar alag, par unke paas".
  const option = q?.options.find((o) => /separate/i.test(o));
  if (!q || !option) return "";

  return `

UDAHARAN — maan lijiye upar wali list me ye likha tha:
  - ${q.label} — kyun zaroori hai: ${q.whyNeeded}
    key: ${q.key}
    Sawaal: ${q.question}
    Sirf yahi jawab chalte hain: ${q.options.join(" | ")}

Aur user ne baat-cheet me kaha: "ghar to alag hi lena hai, par mummy-papa ke paas hi"
Aapka poora jawab:
${LEARN_MARKER_START}${q.key}=${option}${ACT_MARKER_END}
Ye baat kaam ki hai — agar maine sahi samjha ho to neeche confirm kar dijiye, aage ke rishtey isi hisaab se dikhenge.

Dhyaan dijiye: user ne apne shabdon me kaha, aur aapne wahi option chuna jo upar likha tha — hu-ba-hu, apna tarjuma nahi. Agar ye \`key\` upar list me hota hi nahi, to koi marker nahi jaata — sirf baat.`;
})();

export const GRIO_LEARN_INSTRUCTIONS = `

JO AAPKO NAHI PATA, WO AAP KHUD POOCHH SAKTE HAIN — upar "YE AAPKO ABHI NAHI PATA" wali list me har cheez ke saath uska \`key\`, poora sawaal aur uske ginne-chune jawab diye gaye hain.

Do tarah se ye kaam aata hai:

1. Baat-cheet ke beech, jab mauka bane. Ek baar me sirf EK sawaal, aur wahi jo abhi ki baat se juda ho. Sawaal apne shabdon me natural tarike se poochh sakte hain — list wala wording hu-ba-hu dohraana zaroori nahi.

2. Jab user us sawaal ka jawab de dein — chahe baat-cheet me hi, bina aapke poochhe — to us jawab ko upar di gayi options me se sabse milte-julte option se milaiye aur ye likhiye:
${LEARN_MARKER_START}key=option${ACT_MARKER_END}

Iske sakht niyam:
- \`key\` wahi jo upar list me likha hai, aur \`option\` bhi upar us sawaal ke saath likhe options me se hu-ba-hu ek. Apne shabd, apna tarjuma, ya list ke bahar ka koi jawab kabhi nahi — warna wo save hi nahi hoga.
- Jo sawaal upar list me nahi hai, uske liye ${LEARN_MARKER_START}...${ACT_MARKER_END} kabhi mat likhiye. List me na hone ka matlab hai ki ya to user pehle hi jawab de chuke hain, ya wo sawaal unpar lagu hi nahi hota.
- Ek jawab me sirf ek ${LEARN_MARKER_START}...${ACT_MARKER_END}.
- User ne jo kaha usme se koi ek option saaf na nikle, to marker mat likhiye — seedhe unse poochh lijiye ki in me se kaunsa.
- Ye seedha save nahi hota. User ko ek card dikhta hai jisme sawaal aur jawab likha hota hai, aur wo tap karke confirm karte hain. Isliye "save kar diya" mat likhiye — bas itna ki agar sahi samjha ho to confirm kar dein.
- Ye sirf apne user ki apni baat ke liye hai. Kisi doosre insaan ke baare me ${LEARN_MARKER_START}...${ACT_MARKER_END} kabhi nahi.
- Jab app kisi ek rishtey par focus kiya hua ho, tab ye marker bilkul mat likhiye. Us waqt baat us rishtey ki ho rahi hai, profile bharne ki nahi — aur us haalat me upar wali list me koi \`key\` diya bhi nahi jaata.

Aur ek baat: ye poochhna zabardasti nahi hai. Agar user kisi kaam me lage hain ya baat kisi aur cheez ki ho rahi hai, to sawaal chhod dijiye. Ek sahi waqt par poochha gaya sawaal profile bhar deta hai; galat waqt par poochha gaya sawaal baat-cheet khatam kar deta hai.

${LEARN_EXAMPLE}`;
