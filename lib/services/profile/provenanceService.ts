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

/**
 * Sources a browser may never talk its way into.
 *
 * `PARTNER_ENTERED`/`FAMILY_ENTERED` mean "a third party proposed this and the
 * owner then confirmed it" — a claim about *who vouched for a fact*, and one
 * the fact's own author must not be able to make about themselves. The
 * `SOURCE_MAP` above already cannot produce either (its whole vocabulary is
 * three client words), so this set is belt-and-braces: it makes the rule
 * explicit at the boundary instead of implicit in a lookup table somebody
 * might later extend "to keep the client and server in sync".
 *
 * The only writer is `saveContributedFieldProvenance` below, which takes a
 * `SignalSource` directly and is reachable only from
 * `lib/services/managedProfile/ownerReviewService.ts` — i.e. only after a real
 * owner accepted a real proposal on a real claimed draft.
 */
export const SERVER_OWNED_SOURCES: readonly SignalSource[] = ["PARTNER_ENTERED", "FAMILY_ENTERED"];
const SERVER_OWNED_SET = new Set<string>(SERVER_OWNED_SOURCES);

/** True when a client tried to name a source only the server may assign. */
export function isServerOwnedSource(raw: unknown): boolean {
  return typeof raw === "string" && SERVER_OWNED_SET.has(raw);
}

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
  // A request body naming a server-owned source is not an error to report back
  // — it is a spoof attempt, and the honest answer is that the value came from
  // whoever is logged in, which is USER_ENTERED.
  if (isServerOwnedSource(meta.source)) return "USER_ENTERED";
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

/* ------------------------------------------------------------------ */
/* Server-owned contributions                                          */
/* ------------------------------------------------------------------ */

export interface ContributedProvenance {
  fieldKey: string;
  source: SignalSource;
  respondentType: RespondentType;
  confirmed: boolean;
  sourceContext?: string | null;
  confidence?: number | null;
}

/**
 * Provenance for a value that reached the profile through the managed-draft
 * review — the one path that may write `PARTNER_ENTERED`/`FAMILY_ENTERED`.
 *
 * Unlike `saveFieldProvenance`, this takes a `SignalSource` rather than a
 * client word, because the caller is a service that already knows who
 * contributed and that the owner accepted. The two rules it encodes:
 *
 *  - **Accepted** keeps the contributor as the source with `confirmed: true`.
 *    The partner is still where the fact came from; the owner is the witness.
 *    Flattening it to USER_ENTERED would erase the only record that a third
 *    party supplied it, which is exactly what an audit needs.
 *  - **Corrected** is written by the caller as USER_ENTERED/SELF, because the
 *    value that actually landed is the owner's own words. The superseded
 *    proposal survives on `ManagedProfileDraftField.value`, not here.
 */
export async function saveContributedFieldProvenance(
  profileId: string,
  entries: ContributedProvenance[],
): Promise<void> {
  const valid = entries.filter((e) => Boolean(FIELD_BY_KEY[e.fieldKey]));
  if (valid.length === 0) return;

  await Promise.all(
    valid.map((e) => {
      const data = {
        source: e.source,
        confidence: e.confidence ?? null,
        confirmed: e.confirmed,
        confirmedAt: e.confirmed ? new Date() : null,
        sourceContext: e.sourceContext ?? null,
        respondentType: e.respondentType,
      };
      return prisma.profileFieldProvenance.upsert({
        where: { profileId_fieldKey: { profileId, fieldKey: e.fieldKey } },
        create: { profileId, fieldKey: e.fieldKey, ...data },
        update: data,
      });
    }),
  );
}
