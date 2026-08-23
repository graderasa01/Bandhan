import { NextResponse } from "next/server";
import { callAi } from "@/lib/ai/providers";
import { mapAiError } from "@/lib/ai/routeError";
import { requireUser } from "@/lib/auth/requireUser";
import { prisma } from "@/lib/db/prisma";
import { PROFILE_FULL_INCLUDE } from "@/lib/services/profile/profileInclude";
import { buildCandidateFacts, candidateFactsAsRecord } from "@/lib/services/match/candidateFacts";
import { getStoredSignalAnswers } from "@/lib/services/profile/intelligenceService";
import { effectiveSignals } from "@/lib/profile/signalAnswers";
import { getTodayAiAskCount } from "@/lib/ai/quota";
import { getPlanContext, effectiveAiAskLimit, nextPlanUp } from "@/lib/services/plans/entitlements";
import { consumeReward } from "@/lib/services/rewards/rewardService";
import { getPlanCatalog, planFeaturesOf, planNameOf } from "@/lib/services/plans/planCatalog";
import type { ReelAskResponse } from "@/lib/contracts/reel";

export const runtime = "nodejs";

const ASK_SYSTEM_PROMPT = `Aap BandhanTak ke Rishta Reel ka "AI se poocho" assistant hain. User ek doosre profile (candidate) ke baare me poochta hai. Aapke paas sirf candidate ke public-safe fields hain — inhi se jawab dijiye.

Rules:
- Kabhi kuch mat banayein jo diya nahi gaya.
- Agar user private cheez poochta hai (income, phone, exact date of birth, caste/gotra) to bataiye ye private hai aur sirf mutual interest ke baad hi share hoti hai.
- Agar jawab data me nahi hai to saaf bata dijiye ki "ye jaankari abhi available nahi hai".
- Respectful, short, Hinglish jawab dijiye — 2-3 sentences se zyada nahi.`;

function bad(
  code: "not_configured" | "upstream_error" | "bad_request" | "quota_exceeded",
  message: string,
  status: number,
  quota?: { used: number; limit: number },
) {
  return NextResponse.json({ ok: false, code, message, quota } satisfies ReelAskResponse, { status });
}

export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  let body: { profileId?: string; question?: string };
  try {
    body = await req.json();
  } catch {
    return bad("bad_request", "Request JSON padha nahi ja saka.", 400);
  }
  if (!body.profileId || !body.question?.trim()) {
    return bad("bad_request", "Profile aur sawaal dono chahiye.", 400);
  }

  // Quota check first — DB-only, so it's testable without a live AI key and
  // doesn't waste a paid call on a request that's already over the limit.
  //
  // Reads the plan's real aiAskPerDay rather than a flat constant (bug found
  // during G10's audit, 2026-08-06): this endpoint used to give every plan —
  // Basic, Standard, Premium, all of it — the FREE tier's 3/day, because it
  // never looked at the plan at all. `effectiveAiAskLimit` folds in any held
  // AI_ASK credits on top of the plan baseline, same as `effectiveReelLimit`
  // does for the reel.
  const [ctx, used] = await Promise.all([getPlanContext(user.id), getTodayAiAskCount(user.id)]);
  const baseLimit = ctx.features.aiAskPerDay; // null = unlimited plan, ignore credits entirely
  const limit = effectiveAiAskLimit(ctx);

  if (limit !== null && used >= limit) {
    const catalog = await getPlanCatalog();
    const next = await nextPlanUp(ctx.effectivePlanCode);
    const nextAsk = next ? planFeaturesOf(catalog, next).aiAskPerDay : null;
    const upgradeLine = next
      ? `${planNameOf(catalog, next)} me ${nextAsk === null ? "unlimited sawaal" : `${nextAsk} sawaal/din`} milte hain.`
      : "Plan upgrade karein.";
    return bad("quota_exceeded", `Aaj ke ${limit} sawaal ho gaye. ${upgradeLine}`, 429, { used, limit });
  }

  const candidate = await prisma.profile.findUnique({
    where: { id: body.profileId },
    include: PROFILE_FULL_INCLUDE,
  });
  if (!candidate) return bad("bad_request", "Profile nahi mila.", 400);

  // §23.3 — only what's allowed to be visible to a viewer ever reaches the
  // prompt. This endpoint is the L1 set's original home; the list itself now
  // lives in `candidateFacts.ts` so Grio's dossier and the reel's reasoning
  // read the same definition instead of three that drift (see that file).
  //
  // Still L1 regardless of whether this particular viewer has an interest or a
  // match with the candidate: "AI se poocho" is the *reel's* affordance, and
  // the reel only ever shows strangers.
  const candidateSignals = effectiveSignals(candidate, await getStoredSignalAnswers(candidate.id));
  const safeFields = candidateFactsAsRecord(buildCandidateFacts(candidate, "L1", candidateSignals));

  const result = await callAi({
    configFeature: "askProfile",
    logFeature: "reel_ask",
    userId: user.id,
    system: ASK_SYSTEM_PROMPT,
    content: `Candidate data: ${JSON.stringify(safeFields)}\n\nSawaal: ${body.question}`,
    maxTokens: 400,
    // A couple of sentences about one card, answered from a fixed field list —
    // 400 was the answer's budget, not a reasoning budget. See
    // `AiCallParams.thinking`.
    thinking: "off",
  });

  // A call that actually reached the provider (success or a billed refusal)
  // counts against today's quota; a config/rate-limit failure does not.
  const consumed = result.ok || result.usage !== undefined;

  // This call drew on an AI_ASK credit rather than the plan's own baseline
  // when it landed at or past that baseline — the same "only the overflow
  // spends a credit" rule reelGenerator.ts applies to REEL_UNLOCK credits.
  // Spending can only log on failure, never change the response: the AI call
  // already happened and was already billed by the time this runs.
  if (consumed && baseLimit !== null && used >= baseLimit) {
    await consumeReward(user.id, "AI_ASK", 1).catch((err) => {
      console.error("[ai:reel_ask] failed to consume AI_ASK credit:", err instanceof Error ? err.message : String(err));
    });
  }

  // Unlimited plans report no quota at all — "3/Infinity" would tell the user
  // nothing their own plan hasn't already.
  const quota = limit === null ? undefined : { used: consumed ? used + 1 : used, limit };

  if (!result.ok) {
    if (result.kind === "upstream_error") console.error("[ai:reel_ask] failed:", result.message);
    const { status, code } = mapAiError(result.kind);
    return bad(code, result.kind === "upstream_error" ? "Jawab nahi mil paaya." : result.message, status, quota);
  }

  return NextResponse.json({ ok: true, answer: result.text.trim(), quota } satisfies ReelAskResponse);
}
