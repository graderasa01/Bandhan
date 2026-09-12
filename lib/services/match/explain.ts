import { createHash } from "node:crypto";
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
  /** `explanationFingerprint` of the exact facts this was written from. */
  factsHash: string;
}

/**
 * A fingerprint of everything the model was shown for a pair — the viewer's
 * L1 summary and the candidate's — so a card can tell whether a cached
 * explanation still describes the profiles it is sitting next to.
 *
 * A daily reel is explained once, at generation, and the row is read all day.
 * If either person edits their profile after that, the 9am strengths ("dono
 * Jaipur me hain") can be describing a city that is no longer on the card.
 * `reelData.ts` recomputes this hash from the current profiles and drops the
 * AI block when it no longer matches — an explanation is omitted rather than
 * shown as a current fact. Order-stable: `candidateFactsAsRecord` builds its
 * keys in catalog order, so the same facts always hash the same.
 */
export function explanationFingerprint(
  viewerSummary: Record<string, string>,
  candidateSummary: Record<string, string>,
): string {
  return createHash("sha256")
    .update(JSON.stringify([viewerSummary, candidateSummary]))
    .digest("hex")
    .slice(0, 32);
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
  const candidateFacts = candidateSummary(profile);
  const result = await callAi({
    configFeature: "matchExplanation",
    logFeature: "match_explanation",
    userId: viewerUserId,
    system: EXPLAIN_SYSTEM_PROMPT,
    content: JSON.stringify({ viewer: viewerSummary, candidate: candidateFacts }),
    maxTokens: 512,
    // Two strengths and one concern, shaped by a schema — 512 was always the
    // answer's budget, never a reasoning budget. Left on, the model spent all
    // of it thinking and returned nothing ("AI se koi content nahi mila" on
    // every reel generation).
    thinking: "off",
    jsonSchema: EXPLAIN_SCHEMA,
    schemaName: "match_explanation",
  });

  if (!result.ok) {
    if (result.kind === "upstream_error") console.error("[ai:match_explanation] failed:", result.message);
    return null;
  }

  // Guarded, because the docstring above promises this never throws and a raw
  // `JSON.parse` broke that promise: a provider that hits its token ceiling
  // mid-object returns *valid-looking* truncated JSON (DeepSeek at
  // `finish_reason: "length"` does exactly this), and the throw escaped into
  // `Promise.allSettled` where it read as a crashed batch rather than one
  // candidate without reasoning.
  let parsed: { strengths?: string[]; concern?: string | null };
  try {
    parsed = JSON.parse(result.text) as { strengths?: string[]; concern?: string | null };
  } catch {
    console.error("[ai:match_explanation] response was not valid JSON:", result.text.slice(0, 200));
    return null;
  }

  return {
    profileId: profile.id,
    explanation: {
      strengths: (parsed.strengths ?? []).slice(0, 2),
      concern: parsed.concern ?? null,
      factsHash: explanationFingerprint(viewerSummary, candidateFacts),
    },
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
