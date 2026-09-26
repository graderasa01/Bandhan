import { Platform } from "react-native";
import { FIELD_BY_KEY } from "~/catalog";
import { ApiError, api } from "../api/client";
import {
  BioResponseSchema,
  BiodataResponseSchema,
  InterviewResponseSchema,
  SpeechConfigSchema,
  TranscriptSchema,
} from "./schemas";
import { AiError, type AiErrorCode, type AiProvider, type ProfileExtraction } from "./types";

type RawField = { field: string; value: string | null; confidence: number; sourceSpan?: string | null };
type RawInferred = { field: string; value: string; confidence: number; inferredFrom?: string };

/** Catalog-known, non-empty values only; confidence normalised to 0..1. */
function toValues(extracted: RawField[], inferred: RawInferred[]): ProfileExtraction["values"] {
  const scale = (c: number) => (c > 1 ? c / 100 : c);
  return [
    ...extracted
      .filter((f) => f.value !== null && FIELD_BY_KEY[f.field])
      .map((f) => ({ key: f.field, value: f.value as string, confidence: scale(f.confidence), sourceSpan: f.sourceSpan ?? null, inferred: false })),
    ...inferred
      .filter((f) => FIELD_BY_KEY[f.field])
      .map((f) => ({ key: f.field, value: f.value, confidence: scale(f.confidence), sourceSpan: f.inferredFrom ?? null, inferred: true })),
  ];
}

/**
 * The default provider: the BandhanTak server's own AI routes.
 *
 *   GET  /api/speech/config     is a voice route (Sarvam / Gemini) configured?
 *   POST /api/speech/stt        audio → transcript (WAV on iOS/web, AAC on Android)
 *   POST /api/profile/interview transcript → catalog fields (structured output,
 *                               options-checked server-side: "AI never invents data")
 *   POST /api/profile/bio       three bio drafts from whitelisted fields only
 */

function toAiError(err: unknown): AiError {
  if (err instanceof AiError) return err;
  if (err instanceof ApiError) {
    if (err.isNetwork) return new AiError("network", err.message);
    const code = (err.code || "").toLowerCase();
    const known: AiErrorCode[] = ["not_configured", "quota_exceeded", "voice_limit", "upstream_error", "bad_request"];
    const match = known.find((k) => code === k);
    if (match) return new AiError(match, err.message);
    if (err.status === 429) return new AiError("quota_exceeded", err.message);
    if (err.status === 503) return new AiError("not_configured", "AI abhi available nahi hai — aap type karke bhar sakte hain.");
    return new AiError("upstream_error", err.message);
  }
  return new AiError("upstream_error", "AI se baat nahi ho paayi — dobara try karein.");
}

async function call<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw toAiError(err);
  }
}

async function appendAudio(form: FormData, uri: string, mimeType: string) {
  const ext = mimeType.includes("wav") ? "wav" : mimeType.includes("aac") ? "aac" : "m4a";
  if (Platform.OS === "web") {
    const blob = await (await fetch(uri)).blob();
    form.append("file", new File([blob], `clip.${ext}`, { type: mimeType }));
  } else {
    form.append("file", { uri, name: `clip.${ext}`, type: mimeType } as unknown as Blob);
  }
}

export const serverProvider: AiProvider = {
  id: "bandhantak-server",

  async voiceAvailable() {
    try {
      const raw = await api<unknown>("/api/speech/config", { auth: false });
      const parsed = SpeechConfigSchema.safeParse(raw);
      return parsed.success && parsed.data.stt;
    } catch {
      return false;
    }
  },

  async transcribe(clip, locale) {
    return call(async () => {
      const form = new FormData();
      await appendAudio(form, clip.uri, clip.mimeType);
      form.append("locale", locale);
      const raw = await api<unknown>("/api/speech/stt", { method: "POST", form, timeoutMs: 60_000 });
      const parsed = TranscriptSchema.safeParse(raw);
      if (!parsed.success || !parsed.data.ok) throw new AiError("invalid_response", "Awaaz samajh nahi aayi — dobara boliye ya type kijiye.");
      return (parsed.data.transcript ?? "").trim();
    });
  },

  async extractProfile({ transcript, known, askedFields, askedField, fillingFor }) {
    return call(async () => {
      const raw = await api<unknown>("/api/profile/interview", {
        body: { transcript, knownFields: known, askedFields, askedField, fillingFor },
        timeoutMs: 60_000,
      });
      const parsed = InterviewResponseSchema.safeParse(raw);
      if (!parsed.success) throw new AiError("invalid_response", "AI ka jawab samajh nahi aaya — dobara try karein.");
      if (!parsed.data.ok) throw new AiError((parsed.data.code as AiErrorCode) ?? "upstream_error", parsed.data.message);
      const r = parsed.data.result;
      return {
        values: toValues(r.extractedFields, r.inferredFields),
        unresolved: r.unresolved,
        clarification: r.clarification,
        declined: r.userDeclined,
      };
    });
  },

  async readBiodata({ uri, mimeType, fillingFor }) {
    return call(async () => {
      const form = new FormData();
      if (Platform.OS === "web") {
        const blob = await (await fetch(uri)).blob();
        form.append("file", new File([blob], mimeType === "application/pdf" ? "biodata.pdf" : "biodata.jpg", { type: mimeType }));
      } else {
        form.append("file", { uri, name: mimeType === "application/pdf" ? "biodata.pdf" : "biodata.jpg", type: mimeType } as unknown as Blob);
      }
      form.append("fillingFor", fillingFor);
      const raw = await api<unknown>("/api/profile/biodata", { method: "POST", form, timeoutMs: 90_000 });
      const parsed = BiodataResponseSchema.safeParse(raw);
      if (!parsed.success) throw new AiError("invalid_response", "Biodata ka jawab samajh nahi aaya — dobara try karein.");
      if (!parsed.data.ok) throw new AiError((parsed.data.code as AiErrorCode) ?? "upstream_error", parsed.data.message);
      const r = parsed.data.result;
      return {
        values: toValues(r.extractedFields, r.inferredFields),
        unresolved: r.unresolved,
        clarification: null,
        declined: false,
        looksLikeBiodata: r.looksLikeBiodata,
      };
    });
  },

  async writeBio({ known, answers, fillingFor }) {
    return call(async () => {
      const raw = await api<unknown>("/api/profile/bio", {
        body: { knownFields: known, answers, fillingFor, language: "hi" },
        timeoutMs: 60_000,
      });
      const parsed = BioResponseSchema.safeParse(raw);
      if (!parsed.success) throw new AiError("invalid_response", "Bio ka jawab samajh nahi aaya — dobara try karein.");
      if (!parsed.data.ok) throw new AiError((parsed.data.code as AiErrorCode) ?? "upstream_error", parsed.data.message);
      return parsed.data.drafts;
    });
  },
};
