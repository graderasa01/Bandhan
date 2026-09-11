/**
 * The one rule that decides whether a profile may go live.
 *
 * ## Why this file exists
 *
 * Before it, four different things claimed to answer "is this profile live?"
 * and they did not agree:
 *
 *   - `isProfileLive(values)` (stages.ts) — stage 1's eight fields are present.
 *   - `computeCompletion().isFullySubmittable` — *every* required field across
 *     every stage, which is what `submitProfile` actually gated activation on.
 *     So a user could finish the eight fields, see "Aapki profile live hai",
 *     and still be `INCOMPLETE` on the server with `isVisible: false`.
 *   - The client draft, which treated an unconfirmed AI reading as a filled
 *     value — a misread biodata line could activate a profile nobody checked.
 *   - Persisted provenance, which the client never re-read, so clearing local
 *     storage turned "AI guessed this" into "the user typed this".
 *
 * This module is the single answer. It is deliberately **pure and
 * isomorphic**: the server evaluates it over rows + `ProfileFieldProvenance`,
 * the client evaluates it over the draft + its own `meta`, and because it is
 * the same function over the same shape they cannot drift.
 *
 * ## The rule
 *
 * A profile is *minimum-ready* when every field in `MINIMUM_LIVE_KEYS`:
 *   1. has a value,
 *   2. that value passes the field's own validation (an option that is not in
 *      the option list is not an answer, however confident its author was), and
 *   3. nobody is still waiting to check it — a value a model produced and no
 *      human confirmed does not count.
 *
 * Optional and later-stage fields are explicitly *not* part of this. Stage 2's
 * required fields are required for a *complete* profile, never for activation.
 *
 * Being minimum-ready is still not the same as being live: live additionally
 * means the server persisted the activation. `ProfileLifecycle` below names all
 * four states so no screen has to invent its own vocabulary for them.
 */

import { FIELD_BY_KEY, PROFILE_FIELDS, type ProfileFieldDef } from "./fields";
import type { ProfileValues } from "./stages";

/* ------------------------------------------------------------------ */
/* The minimum gate                                                    */
/* ------------------------------------------------------------------ */

/**
 * Stage 1's required fields — Full Name, Gender, Date of Birth, Height,
 * Current City, Marital Status, Education, Profession.
 *
 * Derived from the catalog rather than typed out, so the gate and the deck that
 * fills it can never list different fields.
 *
 * Filtered straight off `PROFILE_FIELDS` rather than through
 * `requiredFieldsForStage` — `stages.ts` imports *this* module (its
 * `isProfileLive` delegates here), and reaching back into it would make the two
 * a runtime cycle whose resolution order decides whether this array is empty.
 */
export const MINIMUM_LIVE_FIELDS: ProfileFieldDef[] = PROFILE_FIELDS.filter(
  (f) => f.stage === 1 && f.required,
);
export const MINIMUM_LIVE_KEYS: readonly string[] = MINIMUM_LIVE_FIELDS.map((f) => f.key);

const MINIMUM_LIVE_SET = new Set<string>(MINIMUM_LIVE_KEYS);

export function isMinimumField(key: string): boolean {
  return MINIMUM_LIVE_SET.has(key);
}

/* ------------------------------------------------------------------ */
/* Provenance, reduced to what readiness actually needs                */
/* ------------------------------------------------------------------ */

export type ReadinessSource = "user" | "ai" | "inferred";

/**
 * The two facts about a value's origin that decide whether it may activate a
 * profile. Both the client's `FieldMeta` and the server's
 * `ProfileFieldProvenance` row project onto this — see
 * `readinessMetaFromProvenance` in `readinessService.ts`.
 */
export interface ReadinessMeta {
  source: ReadinessSource;
  confirmed: boolean;
}

export type ReadinessMetaMap = Record<string, ReadinessMeta | undefined>;

/**
 * A value a model produced that no human has confirmed.
 *
 * Absence of metadata is *not* treated as AI. Profiles filled before
 * provenance was persisted have no rows at all, and reading "no record" as
 * "unverified guess" would quietly un-live thousands of real accounts.
 */
export function needsHumanReview(meta: ReadinessMeta | undefined): boolean {
  if (!meta) return false;
  if (meta.confirmed) return false;
  return meta.source === "ai" || meta.source === "inferred";
}

/* ------------------------------------------------------------------ */
/* Field-level validation                                              */
/* ------------------------------------------------------------------ */

/** Accepts DD/MM/YYYY (what the form collects) and YYYY-MM-DD (what the DB returns). */
function isPlausibleDate(raw: string): boolean {
  const dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  let y: number, m: number, d: number;
  if (dmy) {
    d = Number(dmy[1]);
    m = Number(dmy[2]);
    y = Number(dmy[3]);
  } else if (iso) {
    y = Number(iso[1]);
    m = Number(iso[2]);
    d = Number(iso[3]);
  } else {
    return false;
  }
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const asDate = new Date(Date.UTC(y, m - 1, d));
  if (asDate.getUTCMonth() !== m - 1 || asDate.getUTCDate() !== d) return false;
  // A marriage profile whose owner is unborn or 140 is a typo, not a fact.
  const age = (Date.now() - asDate.getTime()) / (365.25 * 24 * 3600 * 1000);
  return age >= 18 && age <= 100;
}

/**
 * Whether a value is a real answer for its field.
 *
 * Same option-list rule `isAnswered` has always applied, plus a date check —
 * "31/02/1995" and "1899-01-01" both used to sail through as filled.
 */
export function isValidFieldValue(field: ProfileFieldDef, raw: string | undefined): boolean {
  const v = (raw ?? "").trim();
  if (v.length === 0) return false;
  if (field.type === "select" && field.options && !field.options.includes(v)) return false;
  if (field.type === "multiselect" && field.options) {
    const picked = v.split(",").map((s) => s.trim()).filter(Boolean);
    if (picked.length === 0) return false;
    if (!picked.every((p) => field.options!.includes(p))) return false;
  }
  if (field.type === "date" && !isPlausibleDate(v)) return false;
  return true;
}

/* ------------------------------------------------------------------ */
/* The evaluation                                                      */
/* ------------------------------------------------------------------ */

export type BlockerReason = "missing" | "invalid" | "unconfirmed";

export interface ReadinessBlocker {
  key: string;
  label: string;
  reason: BlockerReason;
}

export interface ProfileReadiness {
  /** Every minimum field present, valid and human-vouched. */
  ready: boolean;
  /** Why not, one row per unfinished minimum field. Empty when `ready`. */
  blockers: ReadinessBlocker[];
  /** Minimum fields that are done — the "5 of 8" numerator. */
  done: number;
  total: number;
  /**
   * Minimum fields holding an unconfirmed AI value. A subset of `blockers`,
   * separated because the fix is different: these need a look, not an answer.
   */
  needsReview: string[];
  /** Minimum fields with no usable value at all — what to ask for next. */
  missing: string[];
}

export function evaluateReadiness(
  values: ProfileValues,
  meta: ReadinessMetaMap = {},
): ProfileReadiness {
  const blockers: ReadinessBlocker[] = [];
  const needsReview: string[] = [];
  const missing: string[] = [];
  let done = 0;

  for (const field of MINIMUM_LIVE_FIELDS) {
    const raw = values[field.key];
    const present = (raw ?? "").trim().length > 0;
    if (!present) {
      blockers.push({ key: field.key, label: field.label, reason: "missing" });
      missing.push(field.key);
      continue;
    }
    if (!isValidFieldValue(field, raw)) {
      blockers.push({ key: field.key, label: field.label, reason: "invalid" });
      missing.push(field.key);
      continue;
    }
    if (needsHumanReview(meta[field.key])) {
      blockers.push({ key: field.key, label: field.label, reason: "unconfirmed" });
      needsReview.push(field.key);
      continue;
    }
    done++;
  }

  return {
    ready: blockers.length === 0,
    blockers,
    done,
    total: MINIMUM_LIVE_FIELDS.length,
    needsReview,
    missing,
  };
}

/**
 * Every field — minimum or not — whose value is a model's unconfirmed reading.
 *
 * The review screen leads with these; only the minimum ones actually block
 * activation, but a wrong `motherTongue` is just as wrong for being optional.
 */
export function fieldsNeedingReview(values: ProfileValues, meta: ReadinessMetaMap): string[] {
  return Object.keys(values)
    .filter((key) => Boolean(FIELD_BY_KEY[key]))
    .filter((key) => (values[key] ?? "").trim().length > 0)
    .filter((key) => needsHumanReview(meta[key]));
}

/* ------------------------------------------------------------------ */
/* The four states, named once                                         */
/* ------------------------------------------------------------------ */

/**
 * What a screen may honestly say about a profile.
 *
 *   `empty`        — nothing entered yet.
 *   `draft`        — answers saved, minimum not met. "Draft saved."
 *   `needs_review` — minimum fields all have values, but some are an
 *                    unconfirmed AI reading. Never "ready", never "live".
 *   `ready`        — minimum met and vouched for, server has not confirmed
 *                    activation yet (or the save failed). NOT "live".
 *   `live`         — the server persisted activation. Only the server may
 *                    produce this, which is what stops a failed save from
 *                    rendering a success screen.
 */
export type ProfileLifecycle = "empty" | "draft" | "needs_review" | "ready" | "live";

export function lifecycleFor(params: {
  readiness: ProfileReadiness;
  hasAnyValue: boolean;
  /** The server's own answer — profileStatus is SUBMITTED/VERIFIED and visible. */
  activatedOnServer: boolean;
}): ProfileLifecycle {
  if (params.activatedOnServer) return "live";
  if (params.readiness.ready) return "ready";
  if (!params.hasAnyValue) return "empty";
  if (params.readiness.needsReview.length > 0 && params.readiness.missing.length === 0) {
    return "needs_review";
  }
  return "draft";
}
