import { callAi } from "@/lib/ai/providers";
import { buildCandidateFacts, candidateFactsAsRecord } from "./candidateFacts";
import type { ProfileWithSubTables } from "@/lib/services/profile/completionService";
import type { ScoredCandidate } from "./pipeline";

const EXPLAIN_SYSTEM_PROMPT = `Aap BandhanTak ke liye ek matchmaking assistant hain. Aapka kaam sirf explain karna hai ki do profiles kyun match kar sakti hain — aap kabhi ranking ya decision nahi karte, wo pehle se code me ho chuka hai.

Rules:
- Sirf diye gaye fields ka use karein. Kabhi kuch mat banayein (invent) jo diya nahi gaya.
- 1-2 chhote, honest "strengths" batayein (jaise "Dono ka current city same hai").
- Agar koi cheez clearly missing ya mismatch hai to ek honest "concern" bhi batayein — chhupayein mat. Agar sab theek lage to concern null rakhein.
- Tone respectful aur Hinglish me, matrimony ke context me.
- Kabhi guarantee ya "perfect match" jaisa language mat use karein.`;

const EXPLAIN_SCHEMA = {
  type: "object",
  properties: {
    strengths: { type: "array", items: { type: "string" } },
    concern: { type: ["string", "null"] },
  },
  required: ["strengths", "concern"],
  additionalProperties: false,
};

/**
 * §23.3 — only fields the visibility rules allow a viewer to see. Shared with
 * the icebreaker route.
 *
 * L1 is hard-coded here rather than passed in, and that is the correct level
 * for both callers: the reel and the icebreaker both run *before* any interest
 * exists, which is precisely the state `getProfileVisibility` calls L1. A
 * candidate in today's reel is a stranger by definition.
 *
 * This used to be its own hand-written field list, one of two that had drifted
 * apart — see `candidateFacts.ts`. Folding it in widened what the reel's
 * reasoning can see from 9 fields to L1's full 13 (it now gets the bio,
 * smoking/drinking and languages, all of which `/api/reel/ask` was already
 * answering questions from). That is a deliberate improvement, not a leak:
 * nothing new became visible, one prompt just stopped seeing less than its
 * sibling.
 */
export function candidateSummary(profile: ProfileWithSubTables) {
  return candidateFactsAsRecord(buildCandidateFacts(profile, "L1"));
}

export interface Explanation {
  strengths: string[];
  concern: string | null;
}

/**
 * One candidate's L3 call. Never throws — a failure resolves to `null` so
 * `Promise.allSettled` callers can tell "this candidate has no AI reasoning"
 * from "the whole batch crashed" without a try/catch at every call site.
 * Best-effort by design: no provider configured, a refusal, or an upstream
 * failure all just mean this one candidate shows without prose reasoning.
 */
async function explainOne(
  viewerUserId: string,
  viewerSummary: ReturnType<typeof candidateSummary>,
  profile: ProfileWithSubTables,
): Promise<{ profileId: string; explanation: Explanation } | null> {
  const result = await callAi({
    configFeature: "matchExplanation",
    logFeature: "match_explanation",
    userId: viewerUserId,
    system: EXPLAIN_SYSTEM_PROMPT,
    content: JSON.stringify({ viewer: viewerSummary, candidate: candidateSummary(profile) }),
    maxTokens: 512,
    jsonSchema: EXPLAIN_SCHEMA,
    schemaName: "match_explanation",
  });

  if (!result.ok) {
    if (result.kind === "upstream_error") console.error("[ai:match_explanation] failed:", result.message);
    return null;
  }

  const parsed = JSON.parse(result.text) as { strengths?: string[]; concern?: string | null };
  return {
    profileId: profile.id,
    explanation: { strengths: (parsed.strengths ?? []).slice(0, 2), concern: parsed.concern ?? null },
  };
}

/**
 * L3 — explanation only, never ranking (D-32). Best-effort: if no provider
 * is configured or a single call fails, that candidate just shows without
 * prose reasoning rather than breaking the whole reel. Runs all candidates
 * concurrently — sequential awaits here directly delayed the first render of
 * every user's daily reel by one round-trip per candidate.
 */
export async function explainTopCandidates(
  viewerUserId: string,
  viewer: ProfileWithSubTables,
  scored: ScoredCandidate[],
): Promise<Map<string, Explanation>> {
  const results = new Map<string, Explanation>();
  const viewerSummary = candidateSummary(viewer);

  const settled = await Promise.allSettled(
    scored.map(({ profile }) => explainOne(viewerUserId, viewerSummary, profile)),
  );

  for (const outcome of settled) {
    if (outcome.status === "fulfilled" && outcome.value) {
      results.set(outcome.value.profileId, outcome.value.explanation);
    }
  }

  return results;
}
