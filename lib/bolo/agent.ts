/**
 * Grio's brief for the spoken front door (`/bolo`), and the five tools it may
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

import { MINIMUM_LIVE_FIELDS } from "@/lib/profile/readiness";

/** The native-audio Live model. Preview ids get retired — re-check ai.google.dev/gemini-api/docs/models when the socket starts 4xx-ing. */
export const BOLO_LIVE_MODEL = "gemini-3.1-flash-live-preview";

export const BOLO_TOOL_NAMES = ["save_answers", "show_review", "request_otp", "verify_otp", "finish"] as const;
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
5. User "sahi hai" bole to contact: "Ab bas aapka 10-digit mobile number bataiye" (bete/beti ke liye bhar rahe hon to "aapka apna naam aur mobile number"). Email bhi chalta hai. Number ek baar padh kar poochho "— sahi?" aur RUKO. User haan bole TABHI request_otp call karo, pehle nahi.
6. request_otp ka status dekho:
   - "sent": bolo "OTP bheja hai — jo 6 digit code aaya hai, boliye ya type kar dijiye." Code milte hi verify_otp.
   - "skipped": OTP is waqt uplabdh nahi — ek line me bolo "bina OTP ke hi live kar deta hoon" aur seedha finish.
   - "already_registered": "Is number se account pehle se hai." Agar OTP bheja gaya ho to verify ke baad finish (login ho jayega); nahi to bolo "Login page se login kar lijiye" aur ruk jao.
   - "invalid": number galat — phir poochho.
7. finish call karo. "live" mile to ek line me badhai: "Badhai ho, profile live hai — ab rishte dikhne lagenge." Bas. Uske baad kuch mat poochho, alvida bolo.

# 8 zaroori fields (keys exactly aise bhejo)
${describeMinimumFields()}

Photo, income, caste, kundli — ye sab abhi NAHI poochne. Baad me app me bharenge.
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
    description: "User ne jo 6-digit code bola ya type kiya, use check karo.",
    parameters: {
      type: "OBJECT",
      properties: { code: { type: "STRING", description: "6 digit code" } },
      required: ["code"],
    },
  },
  {
    name: "finish",
    description:
      "Account banao aur profile live karo. Contact step ke baad hi call karo (OTP verified, ya OTP 'skipped' aaya ho). Response 'live' ya 'saved' hota hai.",
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
