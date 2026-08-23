import { prisma } from "@/lib/db/prisma";
import { FIELD_BY_KEY } from "@/lib/profile/fields";
import type { FillingFor } from "@/lib/contracts/interview";
import type { RespondentType, SignalSource } from "@prisma/client";

/**
 * Where each profile fact came from, persisted.
 *
 * `lib/profile/profileState.tsx` has tracked this since the interview shipped —
 * source, confidence, the user's own words, whether they confirmed it — and its
 * own docstring said plainly that it stayed client-side because nothing on the
 * server needed it. That stopped being true:
 *
 *   - Deep Profile reads profile fields as evidence. An AI *inference* being
 *     fed back to the AI as a fact is a loop that manufactures confidence
 *     nobody ever gave it.
 *   - Marriage Intelligence distinguishes what a candidate said from what their
 *     parent said about them. That distinction is worthless if the server only
 *     ever sees the values.
 *   - "Ye kahan se aaya?" is a question a user can reasonably ask about their
 *     own profile, and it should survive clearing the browser cache.
 *
 * So the client keeps its own copy for the interview UI (badges, confirm
 * prompts) and now also pushes it here, where it outlives the device.
 *
 * Server-side by virtue of importing `prisma`, not by a `server-only` marker —
 * the marker would also lock `scripts/intelligence-persistence-check.ts` out of
 * the real write path, and a verification that exercises a copy of the code is
 * not a verification.
 */

const SOURCE_MAP: Record<string, SignalSource> = {
  user: "USER_ENTERED",
  // The client's "ai" means "a model read this out of what the user said or
  // uploaded" — quotable back to them, which is what separates it from a guess.
  ai: "BIODATA_EXTRACTED",
  inferred: "AI_INFERRED",
};

export const RESPONDENT_FOR_FILLING: Record<FillingFor, RespondentType> = {
  self: "SELF",
  son: "PARENT",
  daughter: "PARENT",
};

export interface FieldMetaInput {
  source?: string;
  confidence?: number;
  sourceSpan?: string;
  inferredFrom?: string;
  confirmed?: boolean;
}

function resolveSource(meta: FieldMetaInput): SignalSource {
  const base = SOURCE_MAP[meta.source ?? "user"] ?? "USER_ENTERED";
  // A model's reading that the user then confirmed is a different, stronger
  // fact than either an untouched extraction or a hand-typed value.
  if (base === "BIODATA_EXTRACTED" && meta.confirmed) return "USER_CONFIRMED_AI";
  return base;
}

/** 0..1 from the extractor, 0..100 in the column. Anything else is dropped. */
function resolveConfidence(raw: number | undefined): number | null {
  if (typeof raw !== "number" || Number.isNaN(raw)) return null;
  const scaled = raw <= 1 ? raw * 100 : raw;
  return Math.max(0, Math.min(100, Math.round(scaled)));
}

/**
 * Upserts provenance for whichever fields the client sent this turn.
 *
 * The client sends only entries whose metadata actually changed since its last
 * sync, so this is one or two rows per autosave, not thirty. Unknown keys are
 * dropped rather than stored — the same rule the signal-answer catalog uses.
 */
export async function saveFieldProvenance(
  profileId: string,
  meta: Record<string, FieldMetaInput>,
  respondentType: RespondentType,
): Promise<void> {
  const entries = Object.entries(meta).filter(([key]) => Boolean(FIELD_BY_KEY[key]));
  if (entries.length === 0) return;

  await Promise.all(
    entries.map(([fieldKey, m]) => {
      const source = resolveSource(m);
      const confirmed = Boolean(m.confirmed);
      const data = {
        source,
        confidence: resolveConfidence(m.confidence),
        confirmed,
        confirmedAt: confirmed ? new Date() : null,
        sourceContext: m.sourceSpan ?? m.inferredFrom ?? null,
        respondentType,
      };
      return prisma.profileFieldProvenance.upsert({
        where: { profileId_fieldKey: { profileId, fieldKey } },
        create: { profileId, fieldKey, ...data },
        update: data,
      });
    }),
  );
}

export async function setRespondentType(profileId: string, fillingFor: FillingFor): Promise<RespondentType> {
  const respondentType = RESPONDENT_FOR_FILLING[fillingFor] ?? "SELF";
  await prisma.profile.updateMany({ where: { id: profileId }, data: { respondentType } });
  return respondentType;
}

export interface FieldProvenanceView {
  fieldKey: string;
  source: SignalSource;
  confidence: number | null;
  confirmed: boolean;
  sourceContext: string | null;
  respondentType: RespondentType;
}

export async function getFieldProvenance(profileId: string): Promise<Map<string, FieldProvenanceView>> {
  const rows = await prisma.profileFieldProvenance.findMany({ where: { profileId } });
  return new Map(
    rows.map((r) => [
      r.fieldKey,
      {
        fieldKey: r.fieldKey,
        source: r.source,
        confidence: r.confidence,
        confirmed: r.confirmed,
        sourceContext: r.sourceContext,
        respondentType: r.respondentType,
      },
    ]),
  );
}

/**
 * Fields a model produced and nobody has confirmed.
 *
 * D-32's rule, made queryable: an unconfirmed inference may be *shown* with its
 * badge, but it must never be handed to another model as an established fact —
 * see `deepProfileService`. `BIODATA_EXTRACTED` is included when unconfirmed
 * for the same reason: the model read it correctly or it did not, and only the
 * user knows which.
 */
export function isUnconfirmedInference(view: FieldProvenanceView | undefined): boolean {
  if (!view) return false;
  if (view.confirmed) return false;
  return view.source === "AI_INFERRED" || view.source === "BIODATA_EXTRACTED";
}
