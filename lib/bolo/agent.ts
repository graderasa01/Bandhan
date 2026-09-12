/**
 * Grio's brief for the spoken front door (`/bolo`), and the eight tools it may
 * call — the whole contract between the live model and the page.
 *
 * Built from the field catalog so the options Grio offers out loud are the
 * options the form accepts; a value outside them is rejected by
 * `acceptAnswers` and the rejection is read back to the model in the same
 * turn, which is the only correction loop a real-time voice needs.
 *
 * Isomorphic: the token route locks this exact instruction and tool list into
 * the ephemeral credential it mints (so a leaked token cannot be turned into
 * a general-purpose Gemini session), and the browser sends the same values in
 * its setup message. One module, two readers, zero drift.
 *
 * ## Why the model never touches data directly
 *
 * Every tool runs in the browser against the guest draft (`lib/bolo/draft.ts`),
 * and only `finish` reaches the server — which re-validates everything from
 * scratch. The model can therefore be as chatty and as wrong as a live model
 * sometimes is, and the worst outcome is a re-asked question, never a saved
 * guess. That is the same "AI never invents data" boundary the typed interview
 * enforces in `/api/profile/interview`, just moved to where the latency is.
 */

import { FIELD_BY_KEY } from "@/lib/profile/fields";
import { MINIMUM_LIVE_FIELDS } from "@/lib/profile/readiness";
import { BOLO_PREFERENCE_KEYS } from "./draft";

/** The native-audio Live model. Preview ids get retired — re-check ai.google.dev/gemini-api/docs/models when the socket starts 4xx-ing. */
export const BOLO_LIVE_MODEL = "gemini-3.1-flash-live-preview";

export const BOLO_TOOL_NAMES = [
  "save_answers",
  "show_review",
  "confirm_review",
  "request_otp",
  "verify_otp",
  "save_preferences",
  "finish",
  "go_next",
] as const;

/**
 * The two optional preferences Grio offers after the contact is verified and
 * *before* `finish` — so they travel in the same request that creates the
 * profile and are persisted by the same `acceptAnswers` + `saveDraft` path,
 * not by a second call to an account that already exists. The keys live in
 * `draft.ts` (the page validates against them); this only reads the catalog
 * so the options Grio reads out are the options the profile accepts.
 */
export { BOLO_PREFERENCE_KEYS };

function describePreferenceFields(): string {
  return BOLO_PREFERENCE_KEYS.map((key) => {
    const f = FIELD_BY_KEY[key];
    const options = f?.options ? f.options.map((o) => `"${o}"`).join(", ") : "";
    return `- ${key} (${f?.label ?? key}): sirf inme se${f?.type === "multiselect" ? " (ek se zyada ho to comma se)" : ""}: ${options}`;
  }).join("\n");
}
export type BoloToolName = (typeof BOLO_TOOL_NAMES)[number];

function describeMinimumFields(): string {
  return MINIMUM_LIVE_FIELDS.map((f) => {
    const extra =
      f.type === "select" && f.options
        ? f.key === "height"
          ? `feet-inches me, jaise 5'8" — "5.8" bhi chalega`
          : `sirf inme se: ${f.options.map((o) => `"${o}"`).join(", ")}`
        : f.type === "date"
          ? "DD/MM/YYYY (jaise 12/05/1995 — user jo bole use isi format me bhejo)"
          : "chhota text";
    return `- ${f.key} (${f.label}): ${extra}`;
  }).join("\n");
}

/**
 * The instruction text. Hinglish, because the person on the other end is a
 * family in India and Grio's job is to sound like a helpful relative, not a
 * form. Kept short: a live model reads this on every turn.
 */
export const BOLO_SYSTEM_INSTRUCTION = `Tum Grio ho — BandhanTak (ek Indian matrimony app) ki awaaz. Ek visitor se baat karke 2-3 minute me shaadi ki profile banwani hai. Bina account, bina password — sirf baat-cheet.

# Tumhara andaaz
- Hinglish me bolo (Hindi, casual, izzat ke saath — "aap"). Agar user English ya kisi aur bhasha me bole to usi me jawab do.
- Har jawab EK line, zyada se zyada 15-20 shabd. Lambi bhoomika nahi, list mat padho, jo save ho gaya use dohrao mat.
- Garmjoshi se, par tez. Ek baar "Namaste" — phir seedha kaam.
- Ek baar me 2-3 se zyada cheezein mat poochho.
- Password kabhi mat maango, kabhi mat suggest karo. Login OTP se hota hai.
- Jo user ne nahi kaha wo kabhi mat bharo. Samajh na aaye to ek baar phir poochho.
- Agar tumhe beech me roka gaya ho, ya jo suna wo saaf na ho (shor, adhoora, bematlab), to safai mat do aur naya sawaal mat shuru karo — bas wahi sawaal ek line me dobara poochho.

# Kram (isi order me)
1. Pehle poochho: profile kiske liye — "aapke liye, ya bete/beti ke liye?" Jawab milte hi save_answers me fillingFor bhejo ("self" | "son" | "daughter"). Bete/beti ke liye ho to aage ke sawaal "unka/unki" me poochho.
2. Ab 8 zaroori baatein, is tarah teen chhote batch me: (a) "Poora naam aur date of birth?" (b) "Height, aur abhi kaunse sheher me?" (c) "Marital status, education aur profession?" Gender aksar naam/context se saaf ho jaata hai — pakka na ho to poochho.
3. Jaise hi koi value mile, TURANT save_answers call karo — poore batch ka intezaar mat karo. Response me "missing" list aati hai: sirf wahi poochho jo baaki hai. "rejected" aaye to ek line me batao kya suna aur sahi option poochho.
4. Sab 8 bhar jaayein to show_review call karo aur bolo: "Screen par sab dikh raha hai — sahi hai?" Galti ho to save_answers se theek karo.
5. User "sahi hai", "theek hai", "haan", "next", "aage chalo" — kuch bhi haan jaisa bole — to TURANT confirm_review call karo (isse screen khud agle step par chali jaati hai; user ko button dhoondhna na pade). Response "confirmed" aaye to contact poochho; "incomplete" aaye to jo missing hai wahi poochho aur phir se confirm_review. Contact: "Ab bas aapka 10-digit mobile number bataiye" (bete/beti ke liye bhar rahe hon to "aapka apna naam aur mobile number"). Email bhi chalta hai. Number ek baar padh kar poochho "— sahi?" aur RUKO. User haan bole TABHI request_otp call karo, pehle nahi.
6. request_otp ka status dekho:
   - "sent": bolo "OTP bheja hai — jo 6 digit code aaya hai, boliye ya type kar dijiye." Code milte hi verify_otp. "verified" aaye to step 7.
   - "skipped": OTP is waqt uplabdh nahi — ek line me bolo "bina OTP ke hi live kar deti hoon" aur step 7.
   - "already_registered": "Is number se account pehle se hai." Agar OTP bheja gaya ho to verify ke baad step 7 (login ho jayega); nahi to bolo "Login page se login kar lijiye" aur ruk jao.
   - "invalid": number galat — phir poochho.
7. (Optional, finish se PEHLE — sirf tab jab tool response me next: "preferences" aaya ho, yaani 8 field poore hain) Ek chhoti si baat: "Bas 2 pasand aur bata dijiye, taaki pehle rishte zyada relevant hon — partner ki umar kitni ho, aur kaunse sheher se? Ya abhi skip kar dein?"
   - Pasand SIRF user ke shabdon se lo. Khud se koi umar ya sheher mat chuno, na hi andaaza lagao. Jo user bole wo neeche diye options me fit na ho to options padh kar sunao aur poochho.
   - Jab user bata de, ek line me padh kar sunao — "Umar 25–29, sheher Jaipur — sahi?" — aur RUKO. User haan bole TABHI save_preferences call karo, confirmed: true ke saath. Sirf wahi keys bhejo jo user ne batayi (ek bhi chalegi). "rejected" aaye to options padh kar ek baar phir poochho.
   - User "skip", "nahi", "baad me", "aage chalo" bole to save_preferences call mat karo, seedha step 8.
   - Tool response me next: "finish" aaya ho to ye step chhod do.
8. finish call karo — poori baat-cheet me sirf EK baar; pasand isi ke saath save hoti hai. "live" mile to ek line me badhai: "Badhai ho, profile live hai." "saved" mile to bolo "Profile save ho gayi." Dono me seedha step 9.
9. Ab EK baar poochho: "Rishte dekhein — chalein?" User haan / chalo / next / theek hai bole to TURANT go_next call karo aur bas ek shabd me alvida — "Chaliye, milte hain." Uske baad KUCH mat bolo, koi naya sawaal nahi. go_next ke baad baat-cheet khatam hai. User "nahi"/"ruko" bole to bas ruk jao — screen par Continue button hai.

# 8 zaroori fields (keys exactly aise bhejo)
${describeMinimumFields()}

# 2 optional pasand (step 7 me, keys exactly aise bhejo)
${describePreferenceFields()}

Photo, income, caste, kundli — ye sab abhi NAHI poochne. Baad me app me bharenge. Step 7 ki 2 pasand ke alawa koi aur preference bhi nahi.
User beech me kuch aur poochhe (kya hai ye app, paisa lagta hai?) to ek line me jawab do — "Profile banana free hai" — aur wapas kaam par aao.`;

/** Gemini function declarations — OpenAPI-subset schemas, camelCase keys. */
export const BOLO_TOOL_DECLARATIONS = [
  {
    name: "save_answers",
    description:
      "Jo bhi profile value user ne abhi batayi, use turant save karo. Sirf wahi keys bhejo jo user ne kahi. Response me saved/rejected/missing aata hai.",
    parameters: {
      type: "OBJECT",
      properties: {
        fillingFor: {
          type: "STRING",
          description: 'Profile kiske liye: "self" | "son" | "daughter"',
          enum: ["self", "son", "daughter"],
        },
        ...Object.fromEntries(
          MINIMUM_LIVE_FIELDS.map((f) => [
            f.key,
            {
              type: "STRING",
              description:
                f.key === "height"
                  ? `${f.label}, feet-inches (5'8")`
                  : f.key === "dateOfBirth"
                    ? `${f.label}, DD/MM/YYYY`
                    : f.options && f.options.length <= 12
                      ? `${f.label}: ${f.options.join(" | ")}`
                      : f.label,
            },
          ]),
        ),
      },
    },
  },
  {
    name: "show_review",
    description:
      "Sab 8 zaroori values bhar jaane par screen par review card dikhao. Response me abhi bhi missing fields (agar koi) aate hain.",
    parameters: { type: "OBJECT", properties: {} },
  },
  {
    name: "confirm_review",
    description:
      'User ne review card par dikh rahi values ko haan kaha ("sahi hai", "theek hai", "next", "aage chalo"). Screen ko contact step par le jaata hai. Response status "confirmed" (ab contact poochho) ya "incomplete" (missing list ke saath — pehle wo bharo). Dobara call karna safe hai.',
    parameters: { type: "OBJECT", properties: {} },
  },
  {
    name: "request_otp",
    description:
      "User ke mobile (10 digit) ya email par one-time code bhejo. Pehle number user se confirm kar lo. accountName sirf tab jab profile bete/beti ki ho aur user ne apna naam bataya ho.",
    parameters: {
      type: "OBJECT",
      properties: {
        contact: { type: "STRING", description: "10-digit mobile ya email address" },
        accountName: { type: "STRING", description: "Account holder ka naam (bete/beti ke liye bharne wale parent ka)" },
      },
      required: ["contact"],
    },
  },
  {
    name: "verify_otp",
    description:
      'User ne jo 6-digit code bola ya type kiya, use check karo. "verified" ke saath next aata hai: "preferences" (2 pasand poochho, phir finish) ya "finish" (seedha finish).',
    parameters: {
      type: "OBJECT",
      properties: { code: { type: "STRING", description: "6 digit code" } },
      required: ["code"],
    },
  },
  {
    name: "save_preferences",
    description:
      "Finish se PEHLE user ki 2 optional pasand draft me rakho (finish inhe profile ke saath save karta hai). Sirf wahi keys jo user ne khud batayi, aur sirf tab jab user ne padh kar sunayi gayi value par haan kaha ho — confirmed: true ke bina kuch save nahi hota. Kuch bhi khud se mat bharo. Response me saved, rejected (options ke saath) aur next aata hai.",
    parameters: {
      type: "OBJECT",
      properties: {
        ...Object.fromEntries(
          BOLO_PREFERENCE_KEYS.map((key) => {
            const f = FIELD_BY_KEY[key];
            return [
              key,
              {
                type: "STRING",
                description: `${f?.label ?? key}: ${(f?.options ?? []).join(" | ")}${f?.type === "multiselect" ? " (ek se zyada ho to comma se alag)" : ""}`,
              },
            ];
          }),
        ),
        confirmed: {
          type: "BOOLEAN",
          description: "true sirf tab jab user ne in values ko padh kar sunaye jaane par haan kaha ho.",
        },
      },
      required: ["confirmed"],
    },
  },
  {
    name: "finish",
    description:
      "Account banao aur profile live karo — poori baat-cheet me sirf EK baar. Contact step ke baad hi (OTP verified, ya OTP 'skipped' aaya ho), aur 2 pasand poochhne/skip hone ke BAAD, kyunki draft me rakhi pasand isi call ke saath save hoti hai. Response 'live' ya 'saved' hota hai; dobara call karne par wahi pehla result aata hai.",
    parameters: { type: "OBJECT", properties: {} },
  },
  {
    name: "go_next",
    description:
      'User ne "Rishte dekhein — chalein?" par haan kaha. Sirf finish ke baad chalta hai. Baat-cheet band karke agla page (Rishta Reel) kholta hai — ek shabd me alvida bolo, uske baad kuch mat bolo, koi sawaal nahi.',
    parameters: { type: "OBJECT", properties: {} },
  },
] as const;

/**
 * How Gemini decides that the visitor has started, and stopped, talking.
 *
 * The defaults suit a headset in a quiet room: start-of-speech at HIGH
 * sensitivity commits on a few milliseconds of anything speech-like. On a
 * phone in an Indian living room that is the TV, the traffic, the relative
 * in the next chair — and, worst of all, Grio's own voice leaking from the
 * loudspeaker back into the mic past the browser's echo canceller. Every
 * false start is an `interrupted`: the client drops the rest of the line
 * and the model answers a noise. That was the report from real phones —
 * "Grio stops mid-sentence and gets thrown by background sound".
 *
 * LOW start sensitivity plus a quarter second of sustained speech before a
 * start is committed filters the bangs and the echo tail (`micGate.ts` on
 * the client handles the rest); 800 ms of silence before a turn ends lets
 * people pause mid-answer ("mera naam… Rahul Sharma") without being cut
 * off and answered halfway. Barge-in stays on — a visitor who genuinely
 * talks over Grio still interrupts, it just takes a real sentence.
 *
 * Verified against the live API inside a token lock (a wrong field name
 * here is a 400 at mint time, not a quiet no-op).
 */
export const BOLO_ACTIVITY_DETECTION = {
  disabled: false,
  startOfSpeechSensitivity: "START_SENSITIVITY_LOW",
  endOfSpeechSensitivity: "END_SENSITIVITY_HIGH",
  prefixPaddingMs: 250,
  silenceDurationMs: 800,
} as const;

/**
 * What both the token route (as `liveConnectConstraints.config`) and the
 * browser (inside `setup`) send. `voice` is the admin's chosen Gemini speaker.
 */
export function boloLiveConfig(voice: string) {
  return {
    responseModalities: ["AUDIO"],
    temperature: 0.6,
    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
    systemInstruction: { parts: [{ text: BOLO_SYSTEM_INSTRUCTION }] },
    tools: [{ functionDeclarations: BOLO_TOOL_DECLARATIONS }],
    realtimeInputConfig: {
      automaticActivityDetection: BOLO_ACTIVITY_DETECTION,
      activityHandling: "START_OF_ACTIVITY_INTERRUPTS",
    },
    inputAudioTranscription: {},
    outputAudioTranscription: {},
  };
}

/** The first thing the page says to the model, so Grio speaks first. */
export const BOLO_KICKOFF_TEXT =
  "[Session shuru. Ek chhoti si Namaste ke saath poochho: profile kiske liye — aapke liye ya bete/beti ke liye?]";
