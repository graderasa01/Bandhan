import "server-only";
import { randomUUID } from "node:crypto";
import { callAi } from "@/lib/ai/providers";
import type { AiRoute } from "@/lib/ai/models";
import type { AiRouteTrace } from "@/lib/ai/router";
import { getTodayGrioChatCount } from "@/lib/ai/quota";
import { getPlanContext, isFeatureAvailable } from "@/lib/services/plans/entitlements";
import { getPlanCatalog, planFeaturesOf } from "@/lib/services/plans/planCatalog";
import { consumeReward } from "@/lib/services/rewards/rewardService";
import { computeFitBreakdown } from "@/lib/services/match/fitBreakdown";
import type {
  GrioAnsweredBy,
  GrioDebugTrace,
  GrioEvidenceCard,
  GrioIntent,
  GrioProfileAction,
  GrioProfileHeader,
  GrioPromptSuggestion,
} from "@/lib/contracts/grioProfile";
import type { DetectedIntent } from "./intents";
import { loadProfileTurn, PROFILE_UNAVAILABLE_MESSAGE } from "./profileContext";
import { evidenceCard, selectEvidence } from "./evidence";
import { deterministicAnswer, followUpSuggestions, profileActions } from "./answers";
import { buildProfilePrompt, guardProfileReply, type MessageCase } from "./prompt";
import type { ProfileSectionId } from "./sections";

/**
 * One question about one profile, end to end:
 *
 *   intent (already detected) → the profile, from the database, at this
 *   viewer's level → the comparison → code's answer, or a model's phrasing of
 *   code's facts → the buttons and follow-up chips → a trace.
 *
 * ## The member always gets the facts
 *
 * A model is needed to *phrase*, never to *know*. So every path out of here
 * carries real content:
 *
 *   • kundli / what's missing / which features — code answers, no model
 *   • a section that is simply empty — code says so, no model ("Family details
 *     is profile me available nahi hain" cannot be hallucinated if no model is
 *     asked)
 *   • plan without Rishta Lens, or today's Grio turns spent — code's facts,
 *     with one honest line about why the fuller answer is not there
 *   • every model down — the same facts, with one line saying so, and the
 *     category in the dev trace
 *
 * ## Structure travels beside the prose
 *
 * The evidence card, the buttons and the chips are computed here and sent as
 * data. The model's text is only the paragraph; the screen does not have to
 * trust it to have mentioned what was compared.
 */

export interface ProfileTurnInput {
  viewerUserId: string;
  profileId: string;
  question: string;
  /** Turns since this profile came into focus (the client drops the ones before). */
  recentTurns: { role: "user" | "assistant"; content: string }[];
  detected: DetectedIntent;
  intentMs: number;
  /** Dev-only forced model; the route passes null in production. */
  override: AiRoute | null;
  debug: boolean;
}

export interface ProfileTurnOutput {
  ok: boolean;
  status: number;
  code?: "not_configured" | "upstream_error" | "bad_request" | "quota_exceeded";
  message?: string;
  reply?: string;
  intent: GrioIntent;
  profileId: string;
  header?: GrioProfileHeader;
  evidence?: GrioEvidenceCard | null;
  actions?: GrioProfileAction[];
  followUps?: GrioPromptSuggestion[];
  answeredBy?: GrioAnsweredBy;
  sendTarget?: { matchId: string; name: string } | null;
  trace?: GrioDebugTrace;
}

/** Questions code answers on its own — a lookup or a diff, never a model. */
const CODE_ONLY: ReadonlySet<GrioIntent> = new Set<GrioIntent>([
  "PROFILE_MISSING_INFO",
  "KUNDALI_REQUEST",
  "SERVICE_DISCOVERY",
  "NAVIGATION",
]);

/** A question about one section: if the section is empty there is nothing for a model to phrase. */
const SECTION_OF: Partial<Record<GrioIntent, ProfileSectionId>> = {
  PROFILE_FAMILY: "family",
  PROFILE_LIFESTYLE: "lifestyle",
  PROFILE_PREFERENCES: "expectations",
};

const CARD_TITLE: Partial<Record<GrioIntent, string>> = {
  PROFILE_FOR_ME: "Aapke liye — kya milta hai, kya dekhna hai",
  PROFILE_COMPARE: "Aap dono me kya common hai",
  PROFILE_DIFFERENCE: "Kahan farak hai",
  PROFILE_COMPATIBILITY: "Code ki tulna",
  PROFILE_FAMILY: "Parivaar — aapki tulna",
  PROFILE_LIFESTYLE: "Lifestyle — aapki tulna",
  PROFILE_SUMMARY: "Aapke liye — ek nazar",
};

/** Answer length ceiling. Reasoning is off on this path (facts are given; the task is phrasing). */
const MAX_TOKENS = 700;

function modelTrace(t: AiRouteTrace | null): GrioDebugTrace["model"] {
  if (!t) return null;
  return {
    primary: `${t.primary.provider}:${t.primary.model}`,
    answeredBy: t.answeredBy ? `${t.answeredBy.provider}:${t.answeredBy.model}` : null,
    fallbackUsed: t.fallbackUsed,
    finalOutcome: t.finalOutcome,
    totalLatencyMs: t.totalLatencyMs,
    attempts: t.attempts.map((a) => ({
      model: `${a.provider}:${a.model}`,
      role: a.role,
      outcome: a.outcome,
      httpStatus: a.httpStatus,
      latencyMs: a.latencyMs,
      reason: a.reason,
    })),
    skipped: t.skipped.map((s) => ({ model: `${s.provider}:${s.model}`, reason: s.reason })),
  };
}

export async function answerProfileTurn(input: ProfileTurnInput): Promise<ProfileTurnOutput> {
  const started = Date.now();
  const requestId = randomUUID().slice(0, 8);
  const { detected } = input;
  const intent = detected.intent;
  const stages: { name: string; ms: number }[] = [{ name: "intent", ms: input.intentMs }];
  const tools: string[] = ["getCurrentProfile"];
  let aiTrace: AiRouteTrace | null = null;
  let contextBlocks: { name: string; chars: number }[] = [];
  let approxInputTokens = 0;
  let errorCategory: string | null = null;

  const finish = (out: Omit<ProfileTurnOutput, "trace">, answeredBy: GrioAnsweredBy, loaded: boolean): ProfileTurnOutput => {
    if (!input.debug) return out;
    return {
      ...out,
      trace: {
        requestId,
        path: "profile-intent",
        intent,
        intentConfidence: detected.confidence,
        intentMatched: detected.matched,
        profileId: input.profileId,
        profileContextLoaded: loaded,
        userContextLoaded: loaded,
        contextBlocks,
        approxInputTokens,
        tools,
        stages,
        answeredBy,
        model: modelTrace(aiTrace),
        errorCategory,
        totalLatencyMs: Date.now() - started,
      },
    };
  };

  // ── context: the profile, from the database, at this viewer's level ───────
  let t = Date.now();
  const needsKundli = intent === "KUNDALI_REQUEST" || intent === "SERVICE_DISCOVERY";
  const loaded = await loadProfileTurn(input.viewerUserId, input.profileId, { withKundli: needsKundli });
  stages.push({ name: "context", ms: Date.now() - t });
  if (!loaded.ok) {
    errorCategory = `PROFILE_${loaded.error.toUpperCase()}`;
    return finish(
      { ok: false, status: 404, code: "bad_request", message: PROFILE_UNAVAILABLE_MESSAGE, intent, profileId: input.profileId },
      "code",
      false,
    );
  }
  const { facts, header } = loaded.turn;
  tools.push("getProfileDetails", "getUserPreferences", "compareProfileWithUser");
  if (needsKundli) tools.push("getKundaliData");

  // ── the comparison, cut to this question ───────────────────────────────────
  t = Date.now();
  const selected = selectEvidence(facts.evidence.rows, intent, detected.style.maxPoints ?? 4);
  const card = CARD_TITLE[intent]
    ? evidenceCard(selected, { title: CARD_TITLE[intent]!, preferenceState: facts.evidence.preferenceState })
    : null;
  const actions = profileActions(intent, facts);
  const followUps = followUpSuggestions(intent, facts);
  stages.push({ name: "tools", ms: Date.now() - t });

  const base = { intent, profileId: facts.profileId, header, evidence: card, actions, followUps };
  const codeAnswer = (note?: string) => {
    const text = deterministicAnswer(intent, facts, selected, detected.style);
    return note ? `${text}\n\n${note}` : text;
  };

  // ── questions code answers outright ─────────────────────────────────────────
  const section = SECTION_OF[intent];
  const emptySection = section ? facts.sections.sections[section].facts.length === 0 : false;
  if (CODE_ONLY.has(intent) || emptySection) {
    return finish({ ok: true, status: 200, reply: codeAnswer(), answeredBy: "code", ...base }, "code", true);
  }

  // ── the plan and the day's allowance decide whether a *model* is asked ──────
  t = Date.now();
  const explainGate = await isFeatureAvailable(input.viewerUserId, "grioMatchExplain", (ctx) => ctx.features.matchExplain);
  if (!explainGate.allowed) {
    return finish(
      {
        ok: true,
        status: 200,
        reply: codeAnswer("Grio ki detailed vyakhya aapke abhi ke plan me nahi hai — upar ki baatein seedhe profile se hain."),
        answeredBy: "code",
        ...base,
      },
      "code",
      true,
    );
  }
  const planCtx = await getPlanContext(input.viewerUserId);
  const limit = planCtx.features.grioChatPerDay;
  if (limit !== null && (await getTodayGrioChatCount(input.viewerUserId)) >= limit) {
    return finish(
      {
        ok: true,
        status: 200,
        reply: codeAnswer(`Aaj ke ${limit} Grio sawaal ho gaye — isliye ye jawab seedhe profile ki jaankari se hai. Kal Grio phir detail me batayega.`),
        answeredBy: "code",
        ...base,
      },
      "code",
      true,
    );
  }
  // Riding on the plan, or on a MATCH_EXPLAIN credit? Same rule as the
  // concierge route: read the catalog, not the merged features, or a held
  // credit would make every Premium turn look credit-funded.
  const spendsExplainCredit = !planFeaturesOf(await getPlanCatalog(), planCtx.effectivePlanCode).matchExplain;
  stages.push({ name: "gates", ms: Date.now() - t });

  // ── the model phrases code's facts ──────────────────────────────────────────
  const r = facts.relationship;
  const messageCase: MessageCase =
    intent !== "MESSAGE_HELP"
      ? "none"
      : r.matchId && r.chatOpen
        ? "send"
        : !r.matchId && r.askBridgeEnabled && r.askedStatus === "NONE"
          ? "ask"
          : "none";

  let extraFacts: string | null = null;
  if (intent === "PROFILE_COMPATIBILITY") {
    t = Date.now();
    tools.push("getCompatibilitySignals");
    const fit = await computeFitBreakdown(loaded.turn.viewer, loaded.turn.candidate).catch(() => null);
    if (fit) {
      const lines = fit.signals.map((s) => `- ${s.label}: ${s.score}/100 (is jodi ki ranking me ${s.weightPercent}%)`);
      if (fit.preference.note) lines.push(`- ${fit.preference.note}`);
      if (fit.sochLine) lines.push(`- ${fit.sochLine}`);
      extraFacts = `RANKING KA HISAAB (code ne nikala — number mat badliye):\n${lines.join("\n")}`;
    }
    stages.push({ name: "fit", ms: Date.now() - t });
  }

  const prompt = buildProfilePrompt({
    intent,
    style: detected.style,
    question: input.question,
    facts,
    selected,
    recentTurns: input.recentTurns,
    messageCase,
    extraFacts,
  });
  contextBlocks = prompt.blocks;
  approxInputTokens = Math.ceil((prompt.system.length + prompt.content.length) / 3.5);

  t = Date.now();
  const result = await callAi({
    configFeature: "matchExplain",
    logFeature: "match_explain",
    userId: input.viewerUserId,
    system: prompt.system,
    content: prompt.content,
    maxTokens: MAX_TOKENS,
    thinking: "off",
    override: input.override,
    subject: "Grio",
  });
  aiTrace = result.trace;
  stages.push({ name: "model", ms: Date.now() - t });

  if (spendsExplainCredit && (result.ok || result.usage !== undefined)) {
    await consumeReward(input.viewerUserId, "MATCH_EXPLAIN", 1).catch((err) => {
      console.error("[grio:profile] failed to consume MATCH_EXPLAIN credit:", err instanceof Error ? err.message : String(err));
    });
  }

  t = Date.now();
  if (result.ok) {
    const reply = guardProfileReply(result.text, messageCase);
    stages.push({ name: "parse", ms: Date.now() - t });
    if (reply) {
      return finish(
        {
          ok: true,
          status: 200,
          reply,
          answeredBy: "ai",
          sendTarget: messageCase === "send" && r.matchId ? { matchId: r.matchId, name: facts.name } : null,
          ...base,
        },
        "ai",
        true,
      );
    }
    errorCategory = "MODEL_EMPTY_AFTER_GUARD";
  } else {
    errorCategory = result.category;
    console.error(
      `[grio:profile] ${requestId} ${intent} on ${input.profileId}: model failed (${result.category}) — answering from code. ${result.detail}`,
    );
  }

  return finish(
    {
      ok: true,
      status: 200,
      reply: codeAnswer("Grio ka detailed jawab abhi nahi ban paaya — upar ki baatein seedhe profile se hain."),
      answeredBy: "code-fallback",
      ...base,
    },
    "code-fallback",
    true,
  );
}
