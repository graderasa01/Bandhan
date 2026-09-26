import { FieldsForm, useFieldsEdit, type FieldsEditState } from "~/features/profile-question/FieldsForm";

/** The three profile fields a chart is built from (`lib/profile/fields.ts`). */
export type KundliFix = "dateOfBirth" | "birthTime" | "birthPlace";

export type KundliFixState = FieldsEditState;

/**
 * Which fields a fix asks for — the web's `kundliFieldEditHref` contract: the
 * date alone, or time and place together (a lagna needs both, and a member
 * opening one usually has the other to hand), the one asked for first.
 */
export function fixKeys(fix: KundliFix): string[] {
  if (fix === "dateOfBirth") return ["dateOfBirth"];
  return fix === "birthPlace" ? ["birthPlace", "birthTime"] : ["birthTime", "birthPlace"];
}

const NONE: string[] = [];

/** The member's own birth details, edited in place (see `useFieldsEdit`); saving marks every milan stale. */
export function useKundliFix(fix: KundliFix | null): KundliFixState {
  return useFieldsEdit(fix ? fixKeys(fix) : NONE);
}

export function KundliFixForm({ state }: { fix: KundliFix; state: KundliFixState }) {
  return <FieldsForm state={state} />;
}
