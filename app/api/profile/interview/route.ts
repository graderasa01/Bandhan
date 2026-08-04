import { NextResponse } from "next/server";
import { AI_LIMITS } from "@/lib/ai/models";
import { callAi } from "@/lib/ai/providers";
import { mapAiError } from "@/lib/ai/routeError";
import {
  INTERVIEW_OUTPUT_SCHEMA,
  INTERVIEW_SYSTEM_PROMPT,
  buildUserMessage,
} from "@/lib/ai/interviewPrompt";
import { FIELD_BY_KEY } from "@/lib/profile/fields";
import { getCurrentUser } from "@/lib/auth/session";
import type {
  ExtractedField,
  InferredField,
  InterviewErrorCode,
  InterviewRequest,
  InterviewResponse,
  InterviewTurnResult,
} from "@/lib/contracts/interview";

export const runtime = "nodejs";

function bad(code: InterviewErrorCode, message: string, status: number) {
  return NextResponse.json({ ok: false, code, message } satisfies InterviewResponse, { status });
}

/**
 * A model can still return a value that is not one of a select field's own
 * options. Dropping those here — rather than letting them reach the form — is
 * what keeps "AI never invents data" true at the boundary rather than as a
 * hope about the prompt.
 */
function keepValidExtracted(f: ExtractedField): boolean {
  const def = FIELD_BY_KEY[f.field];
  if (!def || !def.aiExtractable) return false;
  if (f.value === null) return false;
  if (def.type === "select" && def.options && !def.options.includes(f.value)) return false;
  if (def.type === "multiselect" && def.options) {
    const picked = f.value.split(",").map((s) => s.trim());
    return picked.every((p) => def.options!.includes(p));
  }
  return true;
}

function keepValidInferred(f: InferredField): boolean {
  const def = FIELD_BY_KEY[f.field];
  if (!def || !def.aiExtractable) return false;
  if (def.type === "select" && def.options && !def.options.includes(f.value)) return false;
  return true;
}

export async function POST(req: Request) {
  let body: InterviewRequest;
  try {
    body = (await req.json()) as InterviewRequest;
  } catch {
    return bad("bad_request", "Request JSON padha nahi ja saka.", 400);
  }

  if (!body?.transcript || body.transcript.trim().length === 0) {
    return bad("bad_request", "Transcript khaali hai.", 400);
  }

  const currentUser = await getCurrentUser();

  // D-31: structured outputs, never free-text parsing. The stable-prefix
  // caching this used to configure directly is now provider-internal — see
  // lib/ai/providers/anthropic.ts (only the caching provider left in the mix
  // that has a manual cache_control knob at all).
  const aiResult = await callAi({
    configFeature: "extraction",
    logFeature: "profile_interview",
    userId: currentUser?.id ?? null,
    system: INTERVIEW_SYSTEM_PROMPT,
    content: buildUserMessage({
      transcript: body.transcript,
      knownFields: body.knownFields ?? {},
      askedField: body.askedField,
      askedFields: body.askedFields,
      fillingFor: body.fillingFor ?? "self",
    }),
    maxTokens: AI_LIMITS.extractionMaxTokens,
    jsonSchema: INTERVIEW_OUTPUT_SCHEMA,
    schemaName: "interview_turn",
  });

  if (!aiResult.ok) {
    if (aiResult.kind === "upstream_error") console.error("[ai:interview] failed:", aiResult.message);
    const { status, code } = mapAiError(aiResult.kind);
    return bad(
      code,
      aiResult.kind === "upstream_error" ? "AI se baat nahi ho paayi. Aap type karke bhi bata sakte hain." : aiResult.message,
      status,
    );
  }

  console.info(
    `[ai:interview] provider=${aiResult.route.provider} model=${aiResult.route.model} ` +
      `in=${aiResult.usage.inputTokens} out=${aiResult.usage.outputTokens} ` +
      `cache_write=${aiResult.usage.cacheWriteTokens ?? 0} cache_read=${aiResult.usage.cacheReadTokens ?? 0}`,
  );

  const parsed = JSON.parse(aiResult.text) as InterviewTurnResult;

  const result: InterviewTurnResult = {
    extractedFields: (parsed.extractedFields ?? []).filter(keepValidExtracted),
    inferredFields: (parsed.inferredFields ?? [])
      .filter(keepValidInferred)
      .map((f) => ({ ...f, needsConfirmation: true as const })),
    unresolved: (parsed.unresolved ?? []).filter((k) => Boolean(FIELD_BY_KEY[k])),
    detectedLanguage: parsed.detectedLanguage ?? "hi",
    userDeclined: parsed.userDeclined ?? false,
    clarification: parsed.clarification ?? null,
  };

  return NextResponse.json({ ok: true, result } satisfies InterviewResponse);
}
