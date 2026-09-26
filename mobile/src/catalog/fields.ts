import raw from "./catalog.generated.json";

/**
 * The profile fields, exactly as the web's `lib/profile/fields.ts` defines
 * them (snapshotted by `scripts/sync-catalog.ts`), under the web's own names —
 * `PROFILE_FIELDS`, `FIELD_BY_KEY`, `ProfileFieldDef`, `ProfileValues` — so the
 * web modules copied into `src/shared/` (readiness, the Bolo draft and
 * questions) compile here without a line changed.
 *
 * A leaf on purpose: `src/shared/readiness.ts` imports this, and
 * `catalog/index.ts` imports that, so nothing here may import either.
 */

export type FieldType = "text" | "select" | "multiselect" | "textarea" | "date" | "photo";

export type ProfileStage = 1 | 2 | 3 | 4;

export interface FieldDef {
  key: string;
  label: string;
  stage: ProfileStage;
  type: FieldType;
  options: string[] | null;
  required: boolean;
  placeholder: string | null;
  question: string;
  questionForChild: string;
  whyNeeded: string | null;
  aiExtractable: boolean;
  sensitive: boolean;
  suggestions: string[] | null;
}

/** The web's name for a field definition. */
export type ProfileFieldDef = FieldDef;

/** `ProfileValues` in lib/profile/stages.ts. */
export type ProfileValues = Record<string, string>;

export const PROFILE_FIELDS = raw.fields as FieldDef[];
export const FIELD_BY_KEY: Record<string, FieldDef> = Object.fromEntries(PROFILE_FIELDS.map((f) => [f.key, f]));
