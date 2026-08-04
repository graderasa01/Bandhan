import { NextResponse } from "next/server";
import { AI_LIMITS } from "@/lib/ai/models";
import { callAi, type AiContentBlock } from "@/lib/ai/providers";
import {
  BIODATA_OUTPUT_SCHEMA,
  BIODATA_SYSTEM_PROMPT,
  buildBiodataMessage,
} from "@/lib/ai/biodataPrompt";
import { FIELD_BY_KEY } from "@/lib/profile/fields";
import { getCurrentUser } from "@/lib/auth/session";
import type {
  BiodataErrorCode,
  BiodataResponse,
  BiodataResult,
  ExtractedField,
  FillingFor,
  InferredField,
} from "@/lib/contracts/interview";

export const runtime = "nodejs";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

function bad(code: BiodataErrorCode, message: string, status: number) {
  return NextResponse.json({ ok: false, code, message } satisfies BiodataResponse, { status });
}

/**
 * The same boundary guard the interview route uses. A model can still name a
 * select value that is not one of the field's own options, and letting that
 * reach the form is how a "Veg" field ends up saying "Vegetarian".
 */
function keepValidExtracted(f: ExtractedField): boolean {
  const def = FIELD_BY_KEY[f.field];
  if (!def || !def.aiExtractable) return false;
  if (f.value === null) return false;
  if (def.type === "select" && def.options && !def.options.includes(f.value)) return false;
  if (def.type === "multiselect" && def.options) {
    return f.value
      .split(",")
      .map((s) => s.trim())
      .every((p) => def.options!.includes(p));
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
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return bad("bad_request", "File padhi nahi ja saki.", 400);
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return bad("bad_request", "Koi file nahi mili.", 400);
  }

  // Size is checked before the upload is read into memory or billed.
  if (file.size > AI_LIMITS.biodataMaxBytes) {
    const mb = Math.round(AI_LIMITS.biodataMaxBytes / (1024 * 1024));
    return bad("too_large", `File ${mb} MB se badi hai. Thoda chhota karke bhejiye.`, 413);
  }
  if (file.size === 0) {
    return bad("bad_request", "File khaali hai.", 400);
  }

  const isPdf = file.type === "application/pdf";
  const isImage = (IMAGE_TYPES as readonly string[]).includes(file.type);
  if (!isPdf && !isImage) {
    return bad(
      "unsupported_type",
      "Sirf PDF ya photo (JPG, PNG, WEBP) chalegi. Word file ho to uska PDF bana kar bhejiye.",
      415,
    );
  }

  const fillingFor = (form.get("fillingFor") as FillingFor | null) ?? "self";
  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");

  const currentUser = await getCurrentUser();

  const content: AiContentBlock[] = [
    isPdf
      ? { type: "pdf", base64, filename: file.name || "biodata.pdf" }
      : { type: "image", mimeType: file.type as ImageType, base64 },
    { type: "text", text: buildBiodataMessage(fillingFor) },
  ];

  const aiResult = await callAi({
    configFeature: "biodataExtraction",
    logFeature: "profile_biodata",
    userId: currentUser?.id ?? null,
    system: BIODATA_SYSTEM_PROMPT,
    content,
    maxTokens: AI_LIMITS.biodataMaxTokens,
    jsonSchema: BIODATA_OUTPUT_SCHEMA,
    schemaName: "biodata_extraction",
  });

  if (!aiResult.ok) {
    if (aiResult.kind === "upstream_error") console.error("[ai:biodata] failed:", aiResult.message);
    if (aiResult.kind === "not_configured" || aiResult.kind === "auth_error") {
      return bad("not_configured", aiResult.message, 503);
    }
    if (aiResult.kind === "rate_limited") {
      return bad("upstream_error", aiResult.message, 429);
    }
    if (aiResult.kind === "refusal") {
      return bad("upstream_error", "AI ne is file par jawab dene se mana kar diya.", 502);
    }
    // "unsupported" (e.g. a DeepSeek route mistakenly picked for this vision
    // feature) and any raw exception both land here — same as the model
    // returning no readable text at all.
    return bad("unreadable", "Biodata padha nahi ja saka. Aap bol kar ya type karke bhi bata sakte hain.", 502);
  }

  console.info(
    `[ai:biodata] provider=${aiResult.route.provider} model=${aiResult.route.model} type=${file.type} bytes=${file.size} ` +
      `in=${aiResult.usage.inputTokens} out=${aiResult.usage.outputTokens} ` +
      `cache_write=${aiResult.usage.cacheWriteTokens ?? 0} cache_read=${aiResult.usage.cacheReadTokens ?? 0}`,
  );

  const parsed = JSON.parse(aiResult.text) as BiodataResult;

  const result: BiodataResult = {
    extractedFields: (parsed.extractedFields ?? []).filter(keepValidExtracted),
    inferredFields: (parsed.inferredFields ?? [])
      .filter(keepValidInferred)
      .map((f) => ({ ...f, needsConfirmation: true as const })),
    unresolved: (parsed.unresolved ?? []).filter((k) => Boolean(FIELD_BY_KEY[k])),
    ignoredMentions: parsed.ignoredMentions ?? [],
    looksLikeBiodata: parsed.looksLikeBiodata ?? true,
  };

  return NextResponse.json({ ok: true, result } satisfies BiodataResponse);
}
