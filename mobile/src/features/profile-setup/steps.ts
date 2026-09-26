import type { LucideIcon } from "lucide-react-native";
import {
  Briefcase,
  Camera,
  ClipboardCheck,
  GraduationCap,
  Heart,
  House,
  MapPin,
  Orbit,
  PenLine,
  Sprout,
  UserRound,
} from "lucide-react-native";
import { FIELD_BY_KEY, isAnswered, isValidFieldValue, type FieldDef } from "~/catalog";
import type { MyProfile } from "~/types/api";

export type StepKey =
  | "basic"
  | "photos"
  | "family"
  | "education"
  | "profession"
  | "location"
  | "lifestyle"
  | "background"
  | "preferences"
  | "about"
  | "review";

export interface SetupStep {
  key: StepKey;
  title: string;
  /** One line on why this step is worth doing (Hinglish). */
  hint: string;
  icon: LucideIcon;
  /** Catalog field keys, in the order asked. */
  fields: string[];
  optional?: boolean;
}

/**
 * Profile setup as small, understandable steps instead of one long form.
 * Every field comes from the web's catalog (fields.ts) and is answered with
 * the web's tap-first specs (quickPicks.ts), so the same value the web would
 * store is the value stored here. The eight minimum fields (Full Name, Gender,
 * Date of Birth, Height, Current City, Marital Status, Education, Profession)
 * sit in the first steps — the profile goes live the moment they are in.
 */
export const SETUP_STEPS: SetupStep[] = [
  {
    key: "basic",
    title: "Basic Information",
    hint: "Naam, umar aur kad — sabse pehle yahi dikhta hai.",
    icon: UserRound,
    fields: ["fullName", "gender", "dateOfBirth", "height", "maritalStatus", "motherTongue"],
  },
  { key: "photos", title: "Photos", hint: "Ek saaf, muskurati face photo se bharosa sabse zyada badhta hai.", icon: Camera, fields: [] },
  {
    key: "family",
    title: "Family",
    hint: "Rishta sirf do logon ka nahi hota — ye dono taraf poochha jaata hai.",
    icon: House,
    fields: ["familyType", "familyValues", "fatherOccupation", "motherOccupation", "siblings", "siblingsMarried"],
  },
  { key: "education", title: "Education", hint: "Zyadatar log sabse pehle yahi dekhte hain.", icon: GraduationCap, fields: ["education"] },
  {
    key: "profession",
    title: "Profession",
    hint: "Kaam kya karte hain — company ka naam nahi chahiye.",
    icon: Briefcase,
    fields: ["profession", "workLocation", "annualIncome"],
  },
  { key: "location", title: "Location", hint: "Sheher se aas-paas ke rishte milte hain.", icon: MapPin, fields: ["currentCity", "nativePlace"] },
  {
    key: "lifestyle",
    title: "Lifestyle",
    hint: "Roz ki aadatein — yahi baad me sabse zyada matter karti hain.",
    icon: Sprout,
    fields: ["diet", "smoking", "drinking", "languagesKnown", "hobbies"],
  },
  {
    key: "background",
    title: "Background & Kundli",
    hint: "Poori tarah optional. Jo na batana ho, chhod dijiye.",
    icon: Orbit,
    fields: ["religion", "caste", "manglikStatus", "gotra", "birthTime", "birthPlace"],
    optional: true,
  },
  {
    key: "preferences",
    title: "Partner Preferences",
    hint: "Aap kaisa rishta chahte hain — isse aapke matches sabse zyada badalte hain.",
    icon: Heart,
    fields: [
      "partnerAgeRange",
      "partnerCityPreference",
      "partnerEducation",
      "partnerReligionPreference",
      "partnerCastePreference",
      "partnerManglikPreference",
      "partnerWorkExpectation",
      "relocateWilling",
      "dealBreakers",
    ],
  },
  { key: "about", title: "About Me", hint: "Teen-chaar lines jo aapki soch dikhayein.", icon: PenLine, fields: ["aboutMe"] },
  { key: "review", title: "Review", hint: "Ek nazar — phir profile live.", icon: ClipboardCheck, fields: [] },
];

export const STEP_BY_KEY: Record<StepKey, SetupStep> = Object.fromEntries(SETUP_STEPS.map((s) => [s.key, s])) as Record<StepKey, SetupStep>;

export function stepFields(step: SetupStep): FieldDef[] {
  return step.fields.map((k) => FIELD_BY_KEY[k]).filter((f): f is FieldDef => Boolean(f));
}

export interface StepProgress {
  step: SetupStep;
  answered: number;
  total: number;
  done: boolean;
}

/** How far each step is — photos count as done with one photo; review is done when the profile is live. */
export function stepProgress(me: MyProfile | undefined): StepProgress[] {
  const values = me?.values ?? {};
  return SETUP_STEPS.map((step) => {
    if (step.key === "photos") {
      const n = me?.photos.length ?? 0;
      return { step, answered: Math.min(n, 1), total: 1, done: n > 0 };
    }
    if (step.key === "review") return { step, answered: me?.isLive ? 1 : 0, total: 1, done: Boolean(me?.isLive) };
    const fields = stepFields(step);
    const answered = fields.filter((f) => isAnswered(f, values)).length;
    const requiredDone = fields.filter((f) => f.required).every((f) => isValidFieldValue(f, values[f.key]));
    return { step, answered, total: fields.length, done: answered === fields.length || (requiredDone && answered > 0 && Boolean(step.optional)) };
  });
}

/** The first step that still has something missing — where "Continue setup" lands. */
export function nextStep(me: MyProfile | undefined): StepKey {
  const progress = stepProgress(me);
  const firstRequiredGap = progress.find((p) => stepFields(p.step).some((f) => f.required && !isValidFieldValue(f, me?.values[f.key])));
  if (firstRequiredGap) return firstRequiredGap.step.key;
  return progress.find((p) => !p.done && !p.step.optional && p.step.key !== "review")?.step.key ?? "review";
}
