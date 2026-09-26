import { z } from "zod";

/**
 * Runtime shapes for every AI answer the app accepts. A response that does
 * not parse is an `invalid_response`, not a best-effort render — a half-read
 * extraction is exactly how a wrong value would reach a profile.
 */

export const ExtractedFieldSchema = z.object({
  field: z.string().min(1),
  value: z.string().nullable(),
  confidence: z.number(),
  sourceSpan: z.string().nullable().optional(),
  needsConfirmation: z.boolean().optional(),
});

export const InferredFieldSchema = z.object({
  field: z.string().min(1),
  value: z.string(),
  inferredFrom: z.string().optional(),
  confidence: z.number(),
});

export const InterviewResponseSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    result: z.object({
      extractedFields: z.array(ExtractedFieldSchema),
      inferredFields: z.array(InferredFieldSchema),
      unresolved: z.array(z.string()),
      detectedLanguage: z.string().optional(),
      userDeclined: z.boolean(),
      clarification: z.string().nullable(),
    }),
  }),
  z.object({ ok: z.literal(false), code: z.string(), message: z.string() }),
]);

export const BiodataResponseSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    result: z.object({
      extractedFields: z.array(ExtractedFieldSchema),
      inferredFields: z.array(InferredFieldSchema),
      unresolved: z.array(z.string()),
      ignoredMentions: z.array(z.string()).optional(),
      looksLikeBiodata: z.boolean(),
    }),
  }),
  z.object({ ok: z.literal(false), code: z.string(), message: z.string() }),
]);

export const TranscriptSchema = z.object({
  ok: z.boolean(),
  transcript: z.string().optional(),
  message: z.string().optional(),
});

export const SpeechConfigSchema = z.object({ stt: z.boolean(), tts: z.boolean() }).passthrough();

export const BioResponseSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    drafts: z.array(z.object({ tone: z.enum(["simple", "family", "professional"]), text: z.string().min(1) })),
    usedFields: z.array(z.string()).optional(),
  }),
  z.object({ ok: z.literal(false), code: z.string(), message: z.string() }),
]);
