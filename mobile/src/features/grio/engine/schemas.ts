import { z } from "zod";
import {
  isGrioIntent,
  type GrioEvidenceCard,
  type GrioIntent,
  type GrioProfileAction,
  type GrioProfileBriefResponse,
  type GrioProfileHeader,
  type GrioPromptSuggestion,
} from "~/shared/grio/grioProfile";
import type {
  ConciergeMatchOption,
  ConciergePersonOption,
  ConciergeRosterEntry,
  ConciergeWalkthroughStep,
} from "~/shared/grio/concierge";
import type { GrioProfileCard } from "~/shared/grio/grioCards";
import { isGrioActionKey, type GrioActionKey } from "~/shared/grio/grio";
import type { ConciergeTurnResult } from "./types";

/**
 * What the app accepts from Grio's routes. The core of a turn (`ok`, `reply`,
 * `code`, `message`) must parse or the turn is an error; the structure a
 * profile answer carries beside it (header, evidence, buttons, chips) is
 * accepted field by field — one malformed row is dropped, it does not take the
 * whole answer down with it, and it never renders half-read.
 *
 * Shapes are the vendored web contract (`~/shared/grio/*`); zod only checks
 * that what arrived is that shape.
 */

const str = z.string();
const id = z.string().min(1);

/** Each row checked alone: one bad row costs one row. */
function rows<T>(schema: z.ZodType<T>) {
  return z
    .array(z.unknown())
    .catch([])
    .transform((items) =>
      items.flatMap((item) => {
        const parsed = schema.safeParse(item);
        return parsed.success ? [parsed.data] : [];
      }),
    );
}

const PhotoLockSchema = z.enum(["open", "add_own_photo", "match_only"]);

export const RosterEntrySchema: z.ZodType<ConciergeRosterEntry> = z.object({
  n: z.number().int().positive(),
  profileId: id,
  name: str,
  matchId: id.nullable().optional(),
});

const HeaderSchema: z.ZodType<GrioProfileHeader> = z.object({
  profileId: id,
  name: str,
  age: z.number().nullable(),
  city: str.nullable(),
  headline: str.nullable(),
  photoUrl: str.nullable(),
  photoLock: PhotoLockSchema,
  verified: z.boolean(),
  level: z.enum(["L1", "L2", "L3"]),
  levelLabel: str,
  matchId: id.nullable(),
  chatOpen: z.boolean(),
});

const EvidenceRowSchema = z.object({
  key: str,
  area: z.enum(["location", "age", "education", "career", "lifestyle", "family", "values", "tradition", "expectations"]),
  label: str,
  kind: z.enum(["preference", "common", "values"]),
  status: z.enum(["match", "partial", "different", "unknown", "locked"]),
  yours: str.nullable(),
  theirs: str.nullable(),
  note: str.nullable(),
});

const EvidenceSchema: z.ZodType<GrioEvidenceCard> = z.object({
  title: str,
  groups: z.array(
    z.object({
      status: z.enum(["match", "different", "unknown"]),
      label: str,
      rows: rows(EvidenceRowSchema),
    }),
  ),
  footnote: str.nullable(),
});

const IntentSchema = z.custom<GrioIntent>((v) => isGrioIntent(v));

const SuggestionSchema: z.ZodType<GrioPromptSuggestion> = z.object({
  id: str,
  label: str.min(1),
  ask: str.min(1),
  intent: IntentSchema,
});

const SectionSchema = z.enum(["about", "family", "lifestyle", "expectations", "kundli"]);

/** A profile answer's buttons. A catalog button must name a key the catalog has — anything else is dropped. */
const ProfileActionSchema: z.ZodType<GrioProfileAction> = z.union([
  z.object({ id: str, kind: z.literal("open_section"), label: str, section: SectionSchema }),
  z.object({ id: str, kind: z.literal("open_kundli"), label: str }),
  z.object({ id: str, kind: z.literal("view_profile"), label: str }),
  z.object({ id: str, kind: z.literal("ask"), label: str, prompt: str.min(1) }),
  z.object({
    id: str,
    kind: z.literal("catalog"),
    label: str,
    actionKey: z.custom<GrioActionKey>((v) => typeof v === "string" && isGrioActionKey(v)),
  }),
]);

const ConciergeResponseSchema = z.object({
  ok: z.boolean(),
  reply: str.optional(),
  code: str.optional(),
  message: str.optional(),
  roster: rows(RosterEntrySchema).optional(),
  intent: IntentSchema.optional().catch(undefined),
  profileId: id.optional().catch(undefined),
  header: HeaderSchema.optional().catch(undefined),
  evidence: EvidenceSchema.nullable().optional().catch(undefined),
  profileActions: rows(ProfileActionSchema).optional(),
  followUps: rows(SuggestionSchema).optional(),
  answeredBy: z.enum(["ai", "code", "code-fallback"]).optional().catch(undefined),
  sendTarget: z.object({ matchId: id, name: str }).nullable().optional().catch(undefined),
});

/** Null when the body is not a concierge answer at all. */
export function parseConciergeResponse(raw: unknown): ConciergeTurnResult | null {
  const parsed = ConciergeResponseSchema.safeParse(raw);
  if (!parsed.success) return null;
  const d = parsed.data;
  return {
    ok: d.ok,
    reply: d.reply?.trim() ? d.reply : null,
    code: d.code ?? null,
    message: d.message ?? null,
    roster: d.roster ?? null,
    intent: d.intent ?? null,
    profileId: d.profileId ?? null,
    header: d.header ?? null,
    evidence: d.evidence ?? null,
    profileActions: d.profileActions ?? [],
    followUps: d.followUps ?? [],
    answeredBy: d.answeredBy ?? null,
    sendTarget: d.sendTarget ?? null,
  };
}

export const BriefingSchema = z.object({
  ok: z.boolean(),
  text: str.optional(),
  roster: rows(RosterEntrySchema).optional(),
});

export const WalkthroughSchema = z.object({
  ok: z.boolean().optional(),
  steps: rows<ConciergeWalkthroughStep>(z.object({ profileId: id, name: str })),
});

export const PeopleSchema = z.object({
  ok: z.boolean(),
  people: rows<ConciergePersonOption>(
    z.object({ profileId: id, name: str, source: z.enum(["shortlist", "interest_received", "same_vote"]) }),
  ).optional(),
});

export const MatchesSchema = z.object({
  ok: z.boolean(),
  matches: rows<ConciergeMatchOption>(z.object({ matchId: id, name: str, photoUrl: str.nullable() })).optional(),
});

export const CardsSchema = z.object({
  ok: z.boolean(),
  message: str.optional(),
  cards: rows<GrioProfileCard>(
    z.object({
      profileId: id,
      name: str,
      age: z.number().nullable(),
      city: str.nullable(),
      profession: str.nullable(),
      verified: z.boolean(),
      photoUrl: str.nullable(),
      photoLock: PhotoLockSchema,
      shortlisted: z.boolean(),
      interestSent: z.boolean(),
      matchId: id.nullable(),
      chatOpen: z.boolean(),
    }),
  ).optional(),
});

export const ProfileBriefSchema: z.ZodType<GrioProfileBriefResponse> = z.object({
  ok: z.boolean(),
  message: str.optional(),
  header: HeaderSchema.optional().catch(undefined),
  suggestions: rows(SuggestionSchema).optional(),
  signals: z
    .object({
      familyKnown: z.boolean(),
      lifestyleKnown: z.boolean(),
      kundliAvailable: z.boolean(),
      overlapCount: z.number(),
      missingCount: z.number(),
      preferenceState: z.enum(["NOT_PROVIDED", "PARTIAL", "COMPARABLE"]),
    })
    .optional()
    .catch(undefined),
});

export const MemorySchema = z.object({
  ok: z.boolean(),
  message: str.optional(),
  items: rows(z.object({ id, body: str })).optional(),
});

export const AskQuestionSchema = z.object({
  ok: z.boolean(),
  alreadyAsked: z.boolean().optional(),
  heldForReview: z.boolean().optional(),
  message: str.optional(),
});

/** `/api/interests`, `/api/shortlist/:id`, `/api/messages/:id`, the self `do` endpoints — only what the runner reads. */
export const CallResultSchema = z
  .object({
    ok: z.boolean().optional(),
    message: str.optional(),
    matched: z.boolean().optional(),
    matchId: id.nullable().optional(),
  })
  .catch({});
