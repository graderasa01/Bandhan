import { NextResponse } from "next/server";
import { callAi } from "@/lib/ai/providers";
import { FIELD_BY_KEY, questionFor } from "@/lib/profile/fields";
import { HI_ACTIONS, LANGUAGE_META } from "@/lib/contracts/interview";
import type {
  ActionLabels,
  AskRequest,
  AskResponse,
  InterviewErrorCode,
  SpokenLanguage,
} from "@/lib/contracts/interview";
import { getCurrentUser } from "@/lib/auth/session";

export const runtime = "nodejs";

function bad(code: InterviewErrorCode, message: string, status: number) {
  return NextResponse.json({ ok: false, code, message } satisfies AskResponse, { status });
}

/**
 * Phrasings are stable, so the same (field, language, who) triple is asked for
 * once per server process and then served from memory. A user typically sees
 * ten questions, which means ten cheap calls on their first pass and none
 * after — cheaper and far faster than translating on every turn.
 *
 * A process-local Map is deliberate for now: it needs no infrastructure, and
 * losing it on deploy costs one re-translation. Redis is the obvious upgrade
 * once these strings are worth persisting.
 */
const cache = new Map<string, { question: string; optionLabels?: Record<string, string> }>();

/**
 * The two in-conversation controls, cached per language rather than per field —
 * they are the same two strings on every question, so translating them once per
 * language instead of once per field is 30x fewer of them to get right.
 */
const actionCache = new Map<SpokenLanguage, ActionLabels>();

const ACTIONS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["type", "skip"],
  properties: {
    type: { type: "string" },
    skip: { type: "string" },
  },
} as const;

const TRANSLATE_SYSTEM = `Aap ek matrimony app ke sawaal doosri Indian bhashaon me likhte ho. Source sawaal Hindi/Hinglish me hai.

Niyam:

1. **Poora sawaal target bhasha me likhiye — uski apni grammar aur apne shabdon ke saath.** Ye sabse zaroori niyam hai.
   - Hindi ke shabd Devanagari me likh dena tarjuma NAHI hai. Marathi me "ladka/ladki" nahi, **"मुलगा/मुलगी"**. Telugu me "అబ్బాయి/అమ్మాయి".
   - Verb form us bhasha ki sahi honi chahiye — Marathi me "तुम्ही ... आहात", "आहो" galat hai.
   - Agar tarjuma padh kar us bhasha ka aadmi ruk jaye ("ye kis bhasha me likha hai?"), to galat hai.

2. **Ek apwaad:** wo English shabd jo us bhasha ke log rozmarra me English me hi bolte hain, unhe English me hi rakhiye — "height", "joint family", "nuclear family", "MBA", "B.Tech", "veg", "non-veg", "manglik", "gotra". Inka shudh anuvaad mat gadhiye, wo kitaabi lagta hai.

3. Lehja aam bolchaal ka — jaise ghar me koi bada pyaar se poochh raha ho. Sarkari ya kitaabi bhasha bilkul nahi.

4. Matlab, lehja aur lambai wahi rahe. Naya sawaal mat banaiye, kuch jodiye mat.

5. Options ke labels par bhi yahi dono niyam lagte hain — content shabd target bhasha me, English loanwords English me. Option ki **value** kabhi mat badliye, sirf dikhane ka label diye.

6. Sirf JSON dijiye, koi safai ya samjhaish nahi.`;

const ASK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["question", "optionLabels"],
  properties: {
    question: { type: "string" },
    /** Original option string → how to show it. Values are never changed. */
    optionLabels: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["value", "label"],
        properties: {
          value: { type: "string" },
          label: { type: "string" },
        },
      },
    },
  },
} as const;

async function translateActions(language: SpokenLanguage, native: string, userId: string | null): Promise<ActionLabels> {
  if (language === "hi") return HI_ACTIONS;
  const hit = actionCache.get(language);
  if (hit) return hit;

  const result = await callAi({
    configFeature: "questionTranslation",
    logFeature: "profile_ask_action_labels",
    userId,
    system: TRANSLATE_SYSTEM,
    content: `BHASHA: ${native} (${language})\n\nDo button ke label tarjuma kijiye. Chhote rakhiye — button me aane chahiye.\n\ntype: "${HI_ACTIONS.type}" (matlab: bolne ke bajaye likh kar jawab dunga)\nskip: "${HI_ACTIONS.skip}" (matlab: is sawaal ko chhod kar aage badhiye)`,
    maxTokens: 300,
    // Two button labels. See `AiCallParams.thinking`.
    thinking: "off",
    jsonSchema: ACTIONS_SCHEMA,
    schemaName: "action_labels",
  });

  // Hinglish controls beat missing controls — this is a best-effort UI nicety.
  if (!result.ok) return HI_ACTIONS;

  const parsed = JSON.parse(result.text) as ActionLabels;
  const value: ActionLabels = {
    type: parsed.type?.trim() || HI_ACTIONS.type,
    skip: parsed.skip?.trim() || HI_ACTIONS.skip,
  };
  actionCache.set(language, value);
  return value;
}

export async function POST(req: Request) {
  let body: AskRequest;
  try {
    body = (await req.json()) as AskRequest;
  } catch {
    return bad("bad_request", "Request JSON padha nahi ja saka.", 400);
  }

  const field = FIELD_BY_KEY[body?.fieldKey];
  if (!field) {
    return bad("bad_request", "Aisa koi field nahi hai.", 400);
  }
  const meta = LANGUAGE_META[body.language as SpokenLanguage];
  if (!meta) {
    return bad("bad_request", "Ye bhasha support me nahi hai.", 400);
  }

  const forSelf = (body.fillingFor ?? "self") === "self";
  const source = questionFor(field, forSelf);

  // Hindi and Hinglish are what the catalog is already written in.
  if (body.language === "hi") {
    return NextResponse.json({
      ok: true,
      question: source,
      actionLabels: HI_ACTIONS,
    } satisfies AskResponse);
  }

  const currentUser = await getCurrentUser();
  const actionLabels = await translateActions(body.language, meta.native, currentUser?.id ?? null);

  const key = `${field.key}|${body.language}|${forSelf ? "self" : "child"}`;
  const hit = cache.get(key);
  if (hit) {
    return NextResponse.json({ ok: true, ...hit, actionLabels } satisfies AskResponse);
  }

  const result = await callAi({
    configFeature: "questionTranslation",
    logFeature: "profile_ask_question",
    userId: currentUser?.id ?? null,
    system: TRANSLATE_SYSTEM,
    content: [
      `BHASHA: ${meta.native} (${body.language})`,
      `SAWAAL: ${source}`,
      field.options
        ? `OPTIONS (value badalna nahi, sirf dikhane ka label dena):\n${field.options.join("\n")}`
        : "OPTIONS: koi nahi",
    ].join("\n\n"),
    maxTokens: 1024,
    // One question and its options, translated. See `AiCallParams.thinking`.
    thinking: "off",
    jsonSchema: ASK_SCHEMA,
    schemaName: "question_translation",
  });

  // A failed translation must not block the interview — fall back to the
  // Hinglish original rather than surfacing an error to the user.
  if (!result.ok) {
    if (result.kind === "upstream_error") console.error("[ai:ask] failed:", result.message);
    return NextResponse.json({ ok: true, question: source, actionLabels } satisfies AskResponse);
  }

  const parsed = JSON.parse(result.text) as {
    question: string;
    optionLabels: { value: string; label: string }[];
  };

  // Only labels for options that actually exist — a translated label must
  // never introduce a value the form cannot accept.
  const optionLabels = Object.fromEntries(
    (parsed.optionLabels ?? [])
      .filter((o) => field.options?.includes(o.value))
      .map((o) => [o.value, o.label]),
  );

  const value = {
    question: parsed.question?.trim() || source,
    optionLabels: Object.keys(optionLabels).length > 0 ? optionLabels : undefined,
  };
  cache.set(key, value);

  console.info(
    `[ai:ask] field=${field.key} lang=${body.language} provider=${result.route.provider} model=${result.route.model} ` +
      `in=${result.usage.inputTokens} out=${result.usage.outputTokens} cache_read=${result.usage.cacheReadTokens ?? 0}`,
  );

  return NextResponse.json({ ok: true, ...value, actionLabels } satisfies AskResponse);
}
