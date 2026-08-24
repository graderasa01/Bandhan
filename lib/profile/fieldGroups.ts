import { PROFILE_FIELDS, type ProfileFieldDef } from "./fields";
import { isAnswered, type ProfileValues } from "./stages";

/**
 * The catalog, grouped the way a person thinks about their own profile.
 *
 * `fields.ts` orders everything by *stage* — how soon we dare ask for it — and
 * that is the right axis for an interview, where the only question is "what
 * next". It is the wrong axis for a list someone browses: stage 2 alone mixes
 * a mother's occupation, an annual income and seven partner preferences, so a
 * dashboard rendering it in catalog order asks the reader to do the sorting.
 *
 * Categories are that second axis. Nothing here changes what is asked, what is
 * required, or what the gap engine picks — this is purely a view over the same
 * catalog, which is why it lives beside `stages.ts` rather than inside
 * `fields.ts`: adding a category must never look like adding a field.
 *
 * ## Why `partner` is one bucket and not folded into stage 2
 *
 * The seven `partner*` fields plus relocation and deal-breakers are the only
 * group in the catalog that is about *somebody else*. Answering them is a
 * different mental mode from listing your own facts, and they are also the
 * group that most directly moves match quality — which is why they get their
 * own entry point on the dashboard rather than being nine chips scattered
 * through a flat list of thirty-nine.
 */

export type FieldCategoryKey =
  | "basics"
  | "career"
  | "family"
  | "background"
  | "lifestyle"
  | "partner"
  | "kundli"
  | "photos";

export type FieldCategory = {
  key: FieldCategoryKey;
  label: string;
  /** One line on why this group is worth finishing. Shown under the heading. */
  hint: string;
};

/**
 * Display order — roughly "most load-bearing first". Required-heavy groups come
 * before optional ones so a half-finished profile shows its real gaps at the
 * top instead of burying them under kundli detail.
 */
export const FIELD_CATEGORIES: FieldCategory[] = [
  {
    key: "basics",
    label: "Aapke baare me",
    hint: "Ye sabse pehle dikhta hai — inke bina profile live nahi hoti.",
  },
  {
    key: "career",
    label: "Padhai aur kaam",
    hint: "Zyadatar log sabse pehle yahi dekhte hain.",
  },
  {
    key: "family",
    label: "Ghar-parivaar",
    hint: "Rishta sirf do logon ka nahi hota — ye dono taraf poochha jaata hai.",
  },
  {
    key: "background",
    label: "Samaj aur background",
    hint: "Poori tarah optional. Jo na batana ho, khaali chhod dijiye.",
  },
  {
    key: "lifestyle",
    label: "Rehen-sehen",
    hint: "Roz ki aadatein — yahi baad me sabse zyada matter karti hain.",
  },
  {
    key: "partner",
    label: "Partner ki ummeed",
    hint: "Aap kaisa rishta chahte hain. Isse aapke matches sabse zyada badalte hain.",
  },
  {
    key: "kundli",
    label: "Kundli ki baatein",
    hint: "Sirf kundli milan ke liye. Na maante ho to chhod dijiye.",
  },
  {
    key: "photos",
    label: "Photos",
    hint: "Ek saaf face photo se profile par bharosa sabse zyada badhta hai.",
  },
];

export const FIELD_CATEGORY_BY_KEY: Record<FieldCategoryKey, FieldCategory> = Object.fromEntries(
  FIELD_CATEGORIES.map((c) => [c.key, c]),
) as Record<FieldCategoryKey, FieldCategory>;

/**
 * Every field key in the catalog, assigned by hand.
 *
 * Written out rather than derived from stage or a key prefix on purpose. A
 * `startsWith("partner")` rule would look tidy and then silently misfile
 * `partnerWorkExpectation` the day someone renames it, and `relocateWilling` —
 * which genuinely belongs with the partner questions despite being about the
 * user — would never match any prefix rule at all.
 *
 * `scripts/profile-groups-check.ts` asserts this covers the catalog exactly,
 * so a field added to `fields.ts` without a home here fails a check rather
 * than quietly landing in the fallback bucket.
 */
const CATEGORY_OF: Record<string, FieldCategoryKey> = {
  // Basics — identity and where you are.
  fullName: "basics",
  gender: "basics",
  dateOfBirth: "basics",
  height: "basics",
  currentCity: "basics",
  maritalStatus: "basics",
  motherTongue: "basics",

  // Career — what you studied and what you do.
  education: "career",
  profession: "career",
  workLocation: "career",
  annualIncome: "career",

  // Family — the household, not the individual.
  familyType: "family",
  fatherOccupation: "family",
  motherOccupation: "family",
  siblings: "family",
  siblingsMarried: "family",
  familyValues: "family",

  // Background — the three the catalog marks sensitive + never-embed.
  religion: "background",
  caste: "background",
  nativePlace: "background",

  // Lifestyle — habits, interests, and how you describe yourself.
  diet: "lifestyle",
  smoking: "lifestyle",
  drinking: "lifestyle",
  hobbies: "lifestyle",
  languagesKnown: "lifestyle",
  aboutMe: "lifestyle",

  // Partner — the only group that is about somebody else.
  partnerAgeRange: "partner",
  partnerCityPreference: "partner",
  partnerEducation: "partner",
  partnerReligionPreference: "partner",
  partnerCastePreference: "partner",
  partnerManglikPreference: "partner",
  partnerWorkExpectation: "partner",
  // Not a `partner*` key, but the same question in substance: what shape do you
  // want married life to take. Filing it under "me" would leave it stranded.
  relocateWilling: "partner",
  dealBreakers: "partner",

  // Kundli — used by the milan engine, shown to nobody by default.
  manglikStatus: "kundli",
  gotra: "kundli",
  birthTime: "kundli",
  birthPlace: "kundli",

  photos: "photos",
};

/**
 * Falls back rather than throws.
 *
 * The whole point of this file is that no field goes missing from the
 * dashboard, so an unmapped key must still render *somewhere* — landing in
 * "basics" is a visible, fixable wrong; disappearing is the bug we are here to
 * remove. The check script is what stops the fallback from ever being reached
 * in practice.
 */
export function categoryOf(fieldKey: string): FieldCategoryKey {
  return CATEGORY_OF[fieldKey] ?? "basics";
}

export function isFieldCategoryKey(value: string | null | undefined): value is FieldCategoryKey {
  return !!value && FIELD_CATEGORIES.some((c) => c.key === value);
}

/**
 * Photos never live in draft values — they upload through their own table, so
 * `isAnswered` reports the photo field as empty forever (see stages.ts). Any
 * surface that counts "what's left to fill" has to exclude it or it shows a
 * permanent, unfixable gap.
 */
const FILLABLE = PROFILE_FIELDS.filter((f) => f.type !== "photo");

export function fieldsInCategory(cat: FieldCategoryKey): ProfileFieldDef[] {
  return FILLABLE.filter((f) => categoryOf(f.key) === cat);
}

export type CategoryProgress = {
  category: FieldCategory;
  filled: ProfileFieldDef[];
  /** Required first, then catalog order — the same priority the gap engine uses. */
  pending: ProfileFieldDef[];
};

/**
 * One row per category that has at least one fillable field, in display order.
 * Categories are returned even when fully filled, so a caller can show "done"
 * rather than having a section vanish the moment it is completed — a section
 * that disappears reads as a bug to the person who just finished it.
 */
export function categoryProgress(values: ProfileValues): CategoryProgress[] {
  return FIELD_CATEGORIES.map((category) => {
    const fields = fieldsInCategory(category.key);
    return {
      category,
      filled: fields.filter((f) => isAnswered(f, values)),
      pending: fields
        .filter((f) => !isAnswered(f, values))
        .sort((a, b) => {
          if (a.required !== b.required) return a.required ? -1 : 1;
          return a.stage - b.stage;
        }),
    };
  }).filter((row) => row.filled.length + row.pending.length > 0);
}
