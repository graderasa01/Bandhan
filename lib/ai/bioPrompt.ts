/**
 * System prompt + schema for the bio writer — 02_product_spec §19.
 *
 * Static, so prompt caching gets a byte-identical prefix on every request
 * (D-31). Everything user-specific rides in the user message.
 */

import { BIO_TONES, type BioTone } from "@/lib/contracts/bio";
import { LANGUAGE_META, type SpokenLanguage } from "@/lib/contracts/interview";
import { ageFromDate } from "@/lib/services/match/age";

export const BIO_SYSTEM_PROMPT = `Aap BandhanTak ke liye shaadi ki profile ka "apne baare me" hissa likhte ho.

Log apne baare me likhne me atak jaate hain — isliye unse chhoti-chhoti baatein poochhi gayi hain, aur unhi se aapko teen tarah ka bio likhna hai.

# Sabse zaroori niyam

1. **Sirf di gayi baaton se likhiye.** Jo aapko diya gaya hai, bas wahi. Ek bhi baat apne se mat jodiye.

2. **Ye kabhi mat likhiye, chahe kitna hi natural lage:**
   - Koi bhi khoobi jo user ne khud na batayi ho — "mehnati", "zimmedaar", "hansmukh", "family oriented", "sabka khayal rakhne wala". Ye sabse aam galti hai. Agar user ne nahi kaha, to nahi likhna.
   - Paisa, salary, package — kabhi nahi.
   - Jaati, dharm, gotra, manglik — kabhi nahi.
   - Ghar ka pata, mohalla, office ka naam.
   - Kundli, rashi, janm ka samay.
   - Aisi koi baat jo "achhi lage" par di na gayi ho.

3. **Umar likhiye, janm tithi nahi.** "27 saal" theek hai, tareekh nahi.

4. **Bade-bade daave mat kijiye.** "Sabse achha", "bahut sundar", "koi kami nahi" — nahi. Jo hai, saaf-saaf likh dijiye. Shaadi ki profile me bharosa dikhawe se banta hai.

5. **Har bio 2 se 4 line ka.** Isse lamba koi nahi padhta.

# Kaun likh raha hai

- \`self\` : bio pehle purush me — "main", "mera", "mujhe".
- \`son\` / \`daughter\` : bio unke baare me teesre purush me — "mera beta", "meri beti" nahi, balki seedha unke baare me: "Rahul Jaipur me software engineer hain…". Maa-baap ka apna kaam bio me tabhi aaye jab family ke hisse me ho.

# Teen tone

1. **simple** — chhota aur saaf. Bhaari shabd nahi. Jo baat hai, wo seedhe.
2. **family** — jaise rishta dekhne wale ghar walon ko padhna hai. Parivaar aur ghar ke maahaul ka zikr pehle, phir kaam.
3. **professional** — padhai aur kaam pehle, phir baaki. Resume nahi banana, par gambhir lehja.

Teeno me **wahi jaankari** ho — sirf kehne ka tareeka aur tarteeb badle. Ek tone me koi nayi baat aa jaye jo doosri me nahi hai, to wo galat hai.

# Bhasha

Bio usi bhasha me likhiye jo bataayi jaye, uski apni grammar aur shabdon ke saath. Wo English shabd jo us bhasha me rozmarra me English me hi bolte hain (jaise "software engineer", "B.Tech", "joint family") English me hi rakhiye — unka kitaabi anuvaad mat gadhiye.

# Output

Sirf schema ke hisaab se JSON. Teen drafts, teeno tone ke.`;

export const BIO_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["drafts"],
  properties: {
    drafts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["tone", "text"],
        properties: {
          tone: { type: "string", enum: BIO_TONES.map((t) => t.id) as unknown as BioTone[] },
          text: { type: "string" },
        },
      },
    },
  },
} as const;

const SUBJECT: Record<"self" | "son" | "daughter", string> = {
  self: "self — bio pehle purush me likhiye ('main', 'mera').",
  son: "son — bio ladke ke baare me teesre purush me likhiye.",
  daughter: "daughter — bio ladki ke baare me teesre purush me likhiye.",
};

/** Turns a DD/MM/YYYY date into years, so the model never sees the date. */
export function ageFromDob(dob: string): number | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dob.trim());
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const birth = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  if (Number.isNaN(birth.getTime())) return null;
  const age = ageFromDate(birth);
  return age != null && age >= 18 && age <= 100 ? age : null;
}

export function buildBioUserMessage(input: {
  answers: { prompt: string; answer: string }[];
  knownFields: Record<string, string>;
  language: SpokenLanguage;
  fillingFor: "self" | "son" | "daughter";
}): string {
  const facts = Object.entries(input.knownFields)
    .filter(([, v]) => v && v.trim().length > 0)
    .map(([k, v]) => `${k}: ${v}`);

  const said = input.answers
    .filter((a) => a.answer.trim().length > 0)
    .map((a) => `- Poocha: ${a.prompt}\n  Jawab: ${a.answer}`);

  return [
    `BHASHA: ${LANGUAGE_META[input.language].native} (${input.language})`,
    `KAUN: ${SUBJECT[input.fillingFor]}`,
    "",
    facts.length > 0 ? `PROFILE SE JO PATA HAI:\n${facts.join("\n")}` : "PROFILE SE: kuch nahi.",
    "",
    said.length > 0
      ? `USER NE KHUD YE BATAYA:\n${said.join("\n")}`
      : "USER NE ALAG SE KUCH NAHI BATAYA — sirf profile ki jaankari se likhiye.",
    "",
    "In dono ke baahar ka kuch bhi bio me nahi aana chahiye.",
  ].join("\n");
}
