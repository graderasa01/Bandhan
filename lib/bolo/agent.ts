/**
 * Grio's brief for the spoken front door (`/bolo`), and the tools it may call
 * — the whole contract between the live model and the page.
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
 * ## Two briefs, one conversation
 *
 * `guest` is a visitor with no account: the profile first, then a number and
 * a code — or, where no code can reach that number, a password of their own —
 * and only then the account. `member` is someone already signed in whose
 * profile is not live yet (a registration, a Google sign-in, an OTP login, a
 * draft saved halfway): the same fields, the same review, the same finish, and
 * no contact step at all. The member tool list simply has no
 * `request_otp`/`verify_otp`, so a model cannot wander into asking a logged-in
 * person for their number. The token route picks the brief from the session,
 * never from the browser.
 *
 * ## Why the model never touches data directly
 *
 * Every tool runs in the browser against the draft (`lib/bolo/draft.ts`), and
 * only `finish` reaches the server — which re-validates everything from
 * scratch. The model can therefore be as chatty and as wrong as a live model
 * sometimes is, and the worst outcome is a re-asked question, never a saved
 * guess. That is the same "AI never invents data" boundary the typed interview
 * enforces in `/api/profile/interview`, just moved to where the latency is.
 *
 * Passwords never pass through here either. Both places one is typed (the
 * contact step, the done screen) are screen fields the page never forwards to
 * the model; the brief only tells Grio to point at the screen, and never to
 * ask for one out loud.
 */

import type { FillingFor } from "@/lib/contracts/interview";
import { FIELD_BY_KEY } from "@/lib/profile/fields";
import { MINIMUM_LIVE_FIELDS } from "@/lib/profile/readiness";
import { BOLO_PREFERENCE_KEYS, type BoloValues } from "./draft";
import { BOLO_ASK_ORDER, FILLING_FOR_ASK } from "./questions";

/** The native-audio Live model. Preview ids get retired — re-check ai.google.dev/gemini-api/docs/models when the socket starts 4xx-ing. */
export const BOLO_LIVE_MODEL = "gemini-3.1-flash-live-preview";

/** Which brief: a visitor with no account, or a signed-in member finishing an unfinished profile. */
export type BoloMode = "guest" | "member";

export function isBoloMode(value: unknown): value is BoloMode {
  return value === "guest" || value === "member";
}

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

export type BoloToolName = (typeof BOLO_TOOL_NAMES)[number];

/**
 * The two optional preferences Grio offers the moment the eight fields are in —
 * before the review, and so long before `finish` that they travel in the same
 * request that writes the profile and are persisted by the same
 * `acceptAnswers` + `saveDraft` path, not by a second call. The screen asks
 * them too (`questions.ts`), as questions nine and ten, so the person who
 * never opens a microphone is asked exactly the same two things. The keys live
 * in `draft.ts` (the page validates against them); this only reads the catalog
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

/**
 * The eight in the order they are asked — one per turn, the same ladder the
 * screen's own question climbs (`BOLO_ASK_ORDER`), so the thing Grio says out
 * loud is the thing the page is holding up. Read from questions.ts rather than
 * written out here: two orders would be two conversations.
 */
function describeAskLadder(): string {
  return BOLO_ASK_ORDER.filter((key) => key !== FILLING_FOR_ASK)
    .map((key) => FIELD_BY_KEY[key]?.label ?? key)
    .join(" → ");
}

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

/* ------------------------------------------------------------------ */
/* The briefs                                                          */
/* ------------------------------------------------------------------ */

// Hinglish, because the person on the other end is a family in India and
// Grio's job is to sound like a helpful relative, not a form. Kept short: a
// live model reads this on every turn. The shared pieces are written once so
// the guest and member briefs cannot drift apart on the parts they share.

const STYLE = `# Tumhara andaaz
- Hinglish me bolo (Hindi, casual, izzat ke saath — "aap"). Agar user English ya kisi aur bhasha me bole to usi me jawab do.
- Har jawab EK line, zyada se zyada 15-20 shabd. Lambi bhoomika nahi, list mat padho, jo save ho gaya use dohrao mat.
- Garmjoshi se, par tez. Ek baar "Namaste" — phir seedha kaam.
- EK TURN ME EK HI SAWAAL. Ek jawab lo, save karo, phir agla sawaal. Do cheezein sirf tab jab wo sach me ek hi saans ki baat ho; TEEN ya usse zyada kabhi nahi.
- Tumhari yaaddasht tool response ka "filled" hai — ab tak jo save hua, poori value ke saath. Wahi sach hai, apni yaad par mat jao. "filled" me jo cheez hai use dobara mat poochho aur dobara confirm bhi mat karo — naam yaad na rahe to wahin dekh lo, phir se poochho mat.
- Password kabhi bolne ko mat kaho, kabhi khud suggest mat karo, kabhi dohrao mat — password sirf screen par type hota hai. User bolne lage to turant roko: "Password boliye mat — sirf screen par likhiye."
- Jo user ne nahi kaha wo kabhi mat bharo. Samajh na aaye to ek baar phir poochho.
- Agar tumhe beech me roka gaya ho, ya jo suna wo saaf na ho (shor, adhoora, bematlab), to safai mat do aur naya sawaal mat shuru karo — bas wahi sawaal ek line me dobara poochho.`;

const SAVE_RULE =
  'Jaise hi koi value mile, TURANT save_answers call karo — agle sawaal ka intezaar mat karo. Response me "filled" aata hai (ab tak save hui har value) aur "missing" (jo abhi baaki hai): "filled" wali cheez kabhi dobara mat poochho, aur "missing" me se ek baar me sirf EK poochho. "rejected" aaye to ek line me batao kya suna aur sahi option poochho. Har response me "next" bhi aata hai — usi ko follow karo: "answers" = agla baaki field poochho, "preferences" = 2 pasand wala step, "review" = show_review, "finish" = finish.';

const REVIEW_RULE =
  'Jab tool response me next: "review" aaye (yaani 8 field poore hain aur 2 pasand poochhi ja chuki ya skip ho gayi) to show_review call karo aur bolo: "Screen par sab dikh raha hai — sahi hai?" Galti ho to save_answers se theek karo.';

const PREFERENCES_STEP = `Ek chhoti si baat: "Profile ki saari zaroori baatein ho gayi. Bas 2 pasand aur bata dijiye, taaki pehle rishte zyada relevant hon — partner ki umar kitni ho, aur kaunse sheher se? Ya abhi rehne dein?"
   - Ek baar me ek hi poochho: pehle umar, phir sheher. Screen par bhi yahi sawaal khada hota hai — user tap kar de to tumhe square bracket wala note mil jayega; jo aa gaya use dobara mat poochho.
   - Pasand SIRF user ke shabdon se lo. Khud se koi umar ya sheher mat chuno, na hi andaaza lagao. Jo user bole wo neeche diye options me fit na ho to options padh kar sunao aur poochho.
   - Jab user bata de, ek line me padh kar sunao — "Umar 25–29, sheher Jaipur — sahi?" — aur RUKO. User haan bole TABHI save_preferences call karo, confirmed: true ke saath. Sirf wahi keys bhejo jo user ne batayi (ek bhi chalegi). "rejected" aaye to options padh kar ek baar phir poochho.
   - User "skip", "nahi", "baad me", "aage chalo" bole to save_preferences call mat karo — ye step chhod kar seedha tool response ke next par jao. Do baar se zyada mat poochho.
   - Ye step sirf tab jab tool response me next: "preferences" aaye. next kuch aur ho to seedha wahi karo.`;

function finishReplyStep(n: number): string {
  return `${n}. finish ke response par:
   - "live": ek line me badhai — "Badhai ho, profile live hai." "saved": "Profile save ho gayi."
   - next: "password" ho to usi line me jodo — "Chahein to screen par apna password bana lijiye — ya seedha rishte dekhein, chalein?"
   - next: "go_next" ho to usi line me poochho — "Rishte dekhein — chalein?"
   User haan / chalo / next / theek hai bole to TURANT go_next call karo aur bas ek shabd me alvida — "Chaliye, milte hain." Uske baad KUCH mat bolo, koi naya sawaal nahi — go_next ke baad baat-cheet khatam hai. go_next "password_unsaved" lautaye to bolo "Pehle Save Password dabaiye" aur ruko. User "nahi"/"ruko" bole to bas ruk jao — screen par Continue button hai.`;
}

const CATALOG = `# 8 zaroori fields (keys exactly aise bhejo)
${describeMinimumFields()}

# 2 optional pasand (keys exactly aise bhejo)
${describePreferenceFields()}

Photo, income, caste, kundli — ye sab abhi NAHI poochne. Baad me app me bharenge. 2 pasand ke alawa koi aur preference bhi nahi.
User beech me kuch aur poochhe (kya hai ye app, paisa lagta hai?) to ek line me jawab do — "Profile banana free hai" — aur wapas kaam par aao.`;

/** The visitor's brief: profile, then contact, then the account. */
export const BOLO_SYSTEM_INSTRUCTION = `Tum Grio ho — BandhanTak (ek Indian matrimony app) ki awaaz. Ek visitor se baat karke 2-3 minute me shaadi ki profile banwani hai. Account sirf aakhir me banta hai — pehle sirf baat-cheet.

${STYLE}

# Kram (isi order me)
1. Pehle poochho: profile kiske liye — "aapke liye, ya bete/beti ke liye?" Jawab milte hi save_answers me fillingFor bhejo ("self" | "son" | "daughter"). Bete/beti ke liye ho to aage ke sawaal "unka/unki" me poochho.
2. Ab 8 zaroori baatein — EK baar me EK sawaal, isi kram me: ${describeAskLadder()}. Ek jawab aaya → save_answers → agla sawaal. Screen par bhi yahi ek sawaal khada hota hai, isliye kram badlo mat. Gender aksar naam ya "bete/beti ke liye" se saaf ho jaata hai — saaf na ho tabhi, sabse aakhir me poochho.
3. ${SAVE_RULE}
4. (8 field poore hote hi, review se PEHLE) ${PREFERENCES_STEP}
5. ${REVIEW_RULE}
6. User "sahi hai", "theek hai", "haan", "next", "aage chalo" — kuch bhi haan jaisa bole — to TURANT confirm_review call karo (isse screen khud agle step par chali jaati hai; user ko button dhoondhna na pade). Response "confirmed" aaye to contact poochho; "incomplete" aaye to jo missing hai wahi poochho aur phir se confirm_review. Contact: "Ab bas aapka 10-digit mobile number bataiye" (bete/beti ke liye bhar rahe hon to "aapka apna naam aur mobile number"). Email bhi chalta hai. Number ek baar padh kar poochho "— sahi?" aur RUKO. User haan bole TABHI request_otp call karo, pehle nahi.
7. request_otp ka status dekho:
   - "sent": bolo "OTP bheja hai — jo 6 digit code aaya hai, boliye ya type kar dijiye." Code milte hi verify_otp. "verified" aaye to response ka next dekho (aksar "finish"; "preferences" aaye to step 4).
   - "skipped": is number par OTP abhi nahi ja sakta. Ek line me bolo: "OTP abhi nahi ja sakta — screen par apna ek password bana lijiye, isi number aur password se login hoga." Phir response ka next dekho.
   - "already_registered": "Is number se account pehle se hai." Agar OTP bheja gaya ho to verify ke baad step 8 (login ho jayega); nahi to bolo "Login page se login kar lijiye" aur ruk jao.
   - "invalid": number galat — phir poochho.
8. finish call karo — poori baat-cheet me sirf EK baar; pasand isi ke saath save hoti hai. "needs_password" aaye to bolo "Screen par password bana kar Make Profile Live dabaiye" aur ruk jao — button user khud dabayega, tum dobara finish mat karo.
${finishReplyStep(9)}

${CATALOG}`;

/** The signed-in member's brief: only what is missing, no contact step, the same finish. */
export const BOLO_MEMBER_SYSTEM_INSTRUCTION = `Tum Grio ho — BandhanTak (ek Indian matrimony app) ki awaaz. Ye member pehle se login hai aur unki shaadi ki profile adhoori hai. Sirf bache hue sawaal poochh kar 1-2 minute me profile poori karwani hai. Mobile number, OTP, email ya login ki baat kabhi mat karo — wo sab ho chuka hai.

${STYLE}

# Kram (isi order me)
1. Pehla message batata hai: member ka naam, profile kiske liye hai, kya pehle se bhara hai aur kya baaki hai. Naam le kar ek chhoti si Namaste karo. "Kiske liye" SIRF tab poochho jab wahan "pata nahi" likha ho — jawab milte hi save_answers me fillingFor bhejo ("self" | "son" | "daughter"). Bete/beti ki profile ho to sawaal "unka/unki" me poochho.
2. Sirf baaki fields poochho — EK baar me EK sawaal, isi kram me: ${describeAskLadder()}. Ek jawab aaya → save_answers → agla sawaal. Jo pehle message me ya tool response ke "filled" me hai wo KABHI dobara mat poochho. Gender naam/context se saaf na ho to sabse aakhir me poochho.
3. ${SAVE_RULE}
4. (8 field poore hote hi, review se PEHLE) ${PREFERENCES_STEP}
5. ${REVIEW_RULE} Pehle message me "Baaki: kuch nahi" ho to pehla message hi bata dega ki 2 pasand poochhni hai ya seedha show_review karna hai.
6. User haan jaisa bole ("sahi hai", "theek hai", "haan", "aage chalo") to TURANT confirm_review call karo. "confirmed" ke saath next aata hai: "preferences" ho to step 4, "finish" ho to step 7. "incomplete" aaye to jo missing hai wahi poochho.
7. finish call karo — poori baat-cheet me sirf EK baar; pasand isi ke saath save hoti hai.
${finishReplyStep(8)}

${CATALOG}`;

export function boloSystemInstruction(mode: BoloMode): string {
  return mode === "member" ? BOLO_MEMBER_SYSTEM_INSTRUCTION : BOLO_SYSTEM_INSTRUCTION;
}

/* ------------------------------------------------------------------ */
/* Tools                                                               */
/* ------------------------------------------------------------------ */

/**
 * Gemini function declarations — OpenAPI-subset schemas, camelCase keys. The
 * member list is the guest list without the two contact tools; the two
 * descriptions that mention the contact step say what happens instead.
 */
export function boloToolDeclarations(mode: BoloMode) {
  const saveAnswers = {
    name: "save_answers",
    description:
      'Jo bhi profile value user ne abhi batayi, use turant save karo. Sirf wahi keys bhejo jo user ne kahi. Response me saved/rejected/missing ke saath "filled" (ab tak save hui har value — ise dobara mat poochho) aur next aata hai: "answers" (abhi fields baaki hain — ek-ek karke poochho), "preferences" (8 poore — 2 pasand poochho), "review" (show_review).',
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
  };

  const showReview = {
    name: "show_review",
    description:
      'Sab 8 zaroori values bhar jaane aur 2 pasand poochhe/skip ho jaane ke baad screen par review card dikhao. Response me abhi bhi missing fields (agar koi) aur next aata hai — next "preferences" ho to pehle wo poochho.',
    parameters: { type: "OBJECT", properties: {} },
  };

  const confirmReview = {
    name: "confirm_review",
    description:
      mode === "member"
        ? 'User ne review card par dikh rahi values ko haan kaha ("sahi hai", "theek hai", "next", "aage chalo"). Response status "confirmed" next ke saath ("preferences": 2 pasand poochho, "finish": seedha finish) ya "incomplete" (missing list ke saath — pehle wo bharo). Dobara call karna safe hai.'
        : 'User ne review card par dikh rahi values ko haan kaha ("sahi hai", "theek hai", "next", "aage chalo"). Screen ko contact step par le jaata hai. Response status "confirmed" (ab contact poochho) ya "incomplete" (missing list ke saath — pehle wo bharo). Dobara call karna safe hai.',
    parameters: { type: "OBJECT", properties: {} },
  };

  const requestOtp = {
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
  };

  const verifyOtp = {
    name: "verify_otp",
    description:
      'User ne jo 6-digit code bola ya type kiya, use check karo. "verified" ke saath next aata hai: "preferences" (2 pasand poochho, phir finish) ya "finish" (seedha finish).',
    parameters: {
      type: "OBJECT",
      properties: { code: { type: "STRING", description: "6 digit code" } },
      required: ["code"],
    },
  };

  const savePreferences = {
    name: "save_preferences",
    description:
      'User ki 2 optional pasand draft me rakho — 8 field poore hone ke turant baad, review se pehle (finish inhe profile ke saath save karta hai). Sirf wahi keys jo user ne khud batayi, aur sirf tab jab user ne padh kar sunayi gayi value par haan kaha ho — confirmed: true ke bina kuch save nahi hota. Kuch bhi khud se mat bharo. Response me saved, rejected (options ke saath) aur next ("preferences" | "review" | "finish" | "go_next") aata hai.',
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
  };

  const finish = {
    name: "finish",
    description:
      mode === "member"
        ? "Profile save karke live karo — poori baat-cheet me sirf EK baar, review confirm hone aur 2 pasand poochhne/skip hone ke BAAD (pasand isi call ke saath save hoti hai). Response 'live' ya 'saved' ke saath next ('password' ya 'go_next') aata hai; dobara call karne par wahi pehla result aata hai."
        : "Account banao aur profile live karo — poori baat-cheet me sirf EK baar. Contact step ke baad hi (OTP verified, ya OTP 'skipped' aaya ho), aur 2 pasand poochhne/skip hone ke BAAD, kyunki draft me rakhi pasand isi call ke saath save hoti hai. Response 'live' ya 'saved' (next ke saath: 'password' ya 'go_next'), ya 'needs_password' (user ko pehle screen par apna password banana hai); dobara call karne par wahi pehla result aata hai.",
    parameters: { type: "OBJECT", properties: {} },
  };

  const goNext = {
    name: "go_next",
    description:
      'User ne "Rishte dekhein — chalein?" par haan kaha. Sirf finish ke baad chalta hai. Baat-cheet band karke agla page (Rishta Reel) kholta hai — ek shabd me alvida bolo, uske baad kuch mat bolo, koi sawaal nahi. "password_unsaved" aaye to user ne screen par password likha hai par save nahi kiya — "Pehle Save Password dabaiye" bolo aur ruko.',
    parameters: { type: "OBJECT", properties: {} },
  };

  return mode === "member"
    ? [saveAnswers, showReview, confirmReview, savePreferences, finish, goNext]
    : [saveAnswers, showReview, confirmReview, requestOtp, verifyOtp, savePreferences, finish, goNext];
}

/** The visitor's tool list, as a value — for the probe script and anything else reading the contract. */
export const BOLO_TOOL_DECLARATIONS = boloToolDeclarations("guest");

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
 * What both the token route (inside `bidiGenerateContentSetup`) and the
 * browser (inside `setup`) send. `voice` is the admin's chosen Gemini speaker;
 * `mode` picks the brief and the tool list.
 */
export function boloLiveConfig(voice: string, mode: BoloMode = "guest") {
  return {
    responseModalities: ["AUDIO"],
    temperature: 0.6,
    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
    systemInstruction: { parts: [{ text: boloSystemInstruction(mode) }] },
    tools: [{ functionDeclarations: boloToolDeclarations(mode) }],
    realtimeInputConfig: {
      automaticActivityDetection: BOLO_ACTIVITY_DETECTION,
      activityHandling: "START_OF_ACTIVITY_INTERRUPTS",
    },
    inputAudioTranscription: {},
    outputAudioTranscription: {},
  };
}

/** The first thing the page says to a visitor's model, so Grio speaks first. */
export const BOLO_KICKOFF_TEXT =
  "[Session shuru. Ek chhoti si Namaste ke saath poochho: profile kiske liye — aapke liye ya bete/beti ke liye?]";

const WHO_WORDS: Record<FillingFor, string> = {
  self: "apne liye",
  son: "bete ke liye",
  daughter: "beti ke liye",
};

/**
 * A value on its way into one of the page's bracketed notes. Square brackets
 * are how the page marks its own words to the model, so nothing a person typed
 * may carry one — `unbracket` in `BoloExperience.tsx` is the same rule on the
 * other side of the same note.
 */
function noteValue(raw: string | undefined): string {
  return String(raw ?? "").replace(/[[\]]/g, "").trim();
}

/**
 * An answered field as a kickoff names it: the key, its label, and — this is
 * the point — the value itself.
 *
 * A live session ends on two minutes of silence and at twelve minutes flat, and
 * the next one starts with an empty context: everything said before is gone. A
 * kickoff that listed only *which* fields were filled left Grio knowing a name
 * had been given and not knowing what it was, so she asked for it again. With
 * the value in the note she picks the conversation up where it stopped.
 */
function describeFilled(key: string, values: BoloValues | undefined): string {
  const label = FIELD_BY_KEY[key]?.label ?? key;
  const value = noteValue(values?.[key]);
  return value ? `${key} (${label}) = "${value}"` : `${key} (${label})`;
}

/**
 * What a kickoff says comes after the eight — the preference step while either
 * of the two is still unanswered, the review once they are. The same order the
 * screen's own ladder takes (`pendingAskKeys`), so a session that starts
 * halfway does not double back.
 */
function nextAfterAnswers(preferencesPending: readonly string[] | undefined): string {
  const pending = (preferencesPending ?? []).map((key) => `${key} (${FIELD_BY_KEY[key]?.label ?? key})`);
  return pending.length > 0
    ? `ab wo 2 optional pasand poochho jo baaki hain: ${pending.join(", ")} — phir show_review`
    : "seedha show_review karke poochho 'sahi hai?'";
}

/**
 * The member brief's opening turn: who is signed in, and where their profile
 * already is — so Grio greets them by name and never re-asks an answer the
 * profile holds. Keys, labels and the answers themselves (`describeFilled`):
 * a note that named the fields without saying what was in them is how a
 * restarted session came back asking for a name it had already been given.
 */
export function boloMemberKickoff(input: {
  firstName: string;
  fillingFor: FillingFor | null;
  missing: readonly string[];
  needsReview?: readonly string[];
  /** Of the two preferences, the ones still unanswered — the step between the eighth answer and the review. */
  preferencesPending?: readonly string[];
  /** What the draft already holds, so the note says the answers and not only their names. */
  values?: BoloValues;
}): string {
  const missing = new Set(input.missing);
  const describe = (key: string) => `${key} (${FIELD_BY_KEY[key]?.label ?? key})`;
  const filled = MINIMUM_LIVE_FIELDS.filter((f) => !missing.has(f.key)).map((f) => describeFilled(f.key, input.values));
  const review = (input.needsReview ?? []).map(describe);
  // A name is typed by a person; square brackets are how the page marks its
  // own notes to the model, so they never pass through from one.
  const name = noteValue(input.firstName);
  return [
    `[Session shuru. Member login hai — naam: ${name || "pata nahi"}.`,
    `Profile kiske liye: ${input.fillingFor ? WHO_WORDS[input.fillingFor] : "pata nahi — pehle poochho"}.`,
    `Pehle se bhara — ye jawab ho chuke, inhe dobara mat poochho aur dobara confirm mat karo: ${filled.length > 0 ? filled.join(", ") : "kuch nahi"}.`,
    `Baaki: ${input.missing.length > 0 ? `${input.missing.map(describe).join(", ")} — inme se ek baar me sirf EK poochho` : `kuch nahi — ${nextAfterAnswers(input.preferencesPending)}`}.`,
    review.length > 0 ? `Review me inpar dhyaan dilana (AI ne padhe the, abhi confirm nahi): ${review.join(", ")}.` : "",
    "Naam le kar chhoti si Namaste, phir seedha ek sawaal.]",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * A visitor's opening turn when the screen already holds answers — tapped,
 * typed or read off a biodata before the mic was switched on. The plain
 * opening asks "profile kiske liye?" of someone who may have just tapped
 * "Apne liye"; this one says what is already there, the member kickoff's way —
 * keys, labels and the answers themselves. With nothing answered yet it is
 * exactly `BOLO_KICKOFF_TEXT`.
 */
export function boloGuestKickoff(input: {
  fillingFor: FillingFor | null;
  missing: readonly string[];
  /** The review was already confirmed on screen — what comes next is the contact, not the review. */
  confirmed?: boolean;
  /** Of the two preferences, the ones still unanswered — the step between the eighth answer and the review. */
  preferencesPending?: readonly string[];
  /** What the draft already holds, so the note says the answers and not only their names. */
  values?: BoloValues;
}): string {
  const missing = new Set(input.missing);
  const describe = (key: string) => `${key} (${FIELD_BY_KEY[key]?.label ?? key})`;
  const filled = MINIMUM_LIVE_FIELDS.filter((f) => !missing.has(f.key)).map((f) => describeFilled(f.key, input.values));
  if (!input.fillingFor && filled.length === 0) return BOLO_KICKOFF_TEXT;
  const rest =
    input.missing.length > 0
      ? `Baaki: ${input.missing.map(describe).join(", ")} — inme se ek baar me sirf EK poochho.`
      : input.confirmed
        ? "Baaki: kuch nahi, aur review screen par confirm ho chuka hai — ab seedha contact (mobile number) poochho."
        : `Baaki: kuch nahi — ${nextAfterAnswers(input.preferencesPending)}.`;
  return [
    "[Session shuru. Visitor ne screen par pehle se kuch jawab de diye hain.",
    `Profile kiske liye: ${input.fillingFor ? WHO_WORDS[input.fillingFor] : "pata nahi — pehle poochho"}.`,
    `Pehle se bhara — ye jawab ho chuke, inhe dobara mat poochho aur dobara confirm mat karo: ${filled.length > 0 ? filled.join(", ") : "kuch nahi"}.`,
    rest,
    "Ek chhoti si Namaste, phir seedha agla ek sawaal.]",
  ].join(" ");
}
