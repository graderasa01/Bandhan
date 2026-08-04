import { NextResponse } from "next/server";
import { callAi } from "@/lib/ai/providers";
import { mapAiError } from "@/lib/ai/routeError";
import { BIO_SCHEMA, BIO_SYSTEM_PROMPT, ageFromDob, buildBioUserMessage } from "@/lib/ai/bioPrompt";
import {
  BIO_ALLOWED_FIELDS,
  BIO_TONES,
  type BioRequest,
  type BioResponse,
  type BioDraft,
} from "@/lib/contracts/bio";
import { LANGUAGE_META, type SpokenLanguage } from "@/lib/contracts/interview";
import type { InterviewErrorCode } from "@/lib/contracts/interview";
import { getCurrentUser } from "@/lib/auth/session";

export const runtime = "nodejs";

function bad(code: InterviewErrorCode, message: string, status: number) {
  return NextResponse.json({ ok: false, code, message } satisfies BioResponse, { status });
}

const ALLOWED = new Set<string>(BIO_ALLOWED_FIELDS);

/**
 * The §19.2 boundary.
 *
 * Everything not on the §19.1 whitelist is dropped here, before the model sees
 * it — so salary and caste cannot appear in a bio for the simple reason that
 * they were never in the request. `dateOfBirth` is converted to an age on the
 * way through, because the bio may say "27 saal" but must never carry the date.
 */
function whitelist(input: Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(input ?? {})) {
    if (!ALLOWED.has(key)) continue;
    if (!value || value.trim().length === 0) continue;
    if (key === "dateOfBirth") {
      const age = ageFromDob(value);
      if (age !== null) out.age = `${age} saal`;
      continue;
    }
    out[key] = value.trim();
  }
  return out;
}

export async function POST(req: Request) {
  let body: BioRequest;
  try {
    body = (await req.json()) as BioRequest;
  } catch {
    return bad("bad_request", "Request JSON padha nahi ja saka.", 400);
  }

  const language = body?.language as SpokenLanguage;
  if (!LANGUAGE_META[language]) {
    return bad("bad_request", "Ye bhasha support me nahi hai.", 400);
  }

  const knownFields = whitelist(body?.knownFields);
  const answers = (body?.answers ?? []).filter(
    (a) => a && typeof a.answer === "string" && a.answer.trim().length > 0,
  );

  // Nothing to write from. Refusing beats inventing a personality.
  if (answers.length === 0 && Object.keys(knownFields).length === 0) {
    return bad(
      "bad_request",
      "Bio likhne ke liye abhi kuch nahi hai — pehle do-teen baatein bata dijiye.",
      400,
    );
  }

  const currentUser = await getCurrentUser();

  const result = await callAi({
    configFeature: "bioWriter",
    logFeature: "profile_bio",
    userId: currentUser?.id ?? null,
    system: BIO_SYSTEM_PROMPT,
    content: buildBioUserMessage({ answers, knownFields, language, fillingFor: body.fillingFor ?? "self" }),
    maxTokens: 2048,
    jsonSchema: BIO_SCHEMA,
    schemaName: "bio_drafts",
  });

  if (!result.ok) {
    if (result.kind === "upstream_error") console.error("[ai:bio] failed:", result.message);
    const { status, code } = mapAiError(result.kind);
    return bad(
      code,
      result.kind === "upstream_error" ? "Bio nahi ban paaya. Aap khud likh kar bhi bata sakte hain." : result.message,
      status,
    );
  }

  const parsed = JSON.parse(result.text) as { drafts: BioDraft[] };
  const valid = new Set(BIO_TONES.map((t) => t.id));
  const drafts = (parsed.drafts ?? [])
    .filter((d) => valid.has(d.tone) && typeof d.text === "string" && d.text.trim().length > 0)
    .map((d) => ({ tone: d.tone, text: d.text.trim() }));

  if (drafts.length === 0) {
    return bad("upstream_error", "Bio ban nahi paaya. Aap khud bhi likh sakte hain.", 502);
  }

  return NextResponse.json({
    ok: true,
    drafts,
    // What it was built from, so the user can check rather than trust.
    usedFields: Object.keys(knownFields),
  } satisfies BioResponse);
}
