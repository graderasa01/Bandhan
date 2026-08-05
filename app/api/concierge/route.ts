import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { callAi } from "@/lib/ai/providers";
import { mapAiError } from "@/lib/ai/routeError";
import { isFeatureAvailable } from "@/lib/services/plans/entitlements";
import { getThreadData } from "@/lib/data/messagesData";
import { canChatInMatch } from "@/lib/services/circle/connectionService";
import { SEND_MARKER_START, SEND_MARKER_END, type ConciergeResponse } from "@/lib/contracts/concierge";
import {
  ACT_MARKER_START,
  ACT_MARKER_END,
  GRIO_ACTIONS,
  type GrioActionKey,
} from "@/lib/contracts/grio";
import { buildGrioContext } from "@/lib/services/grio/context";
import { getMemory, formatMemory } from "@/lib/services/grio/memory";

export const runtime = "nodejs";

/**
 * Grio (Phase E as "AI Rishta Concierge", extended into an action layer in
 * Phase G — see docs/bandhantak/11_ai_action_layer_and_growth_plan.md).
 *
 * Three design calls worth stating:
 *
 * 1. **No conversation table.** Every other AI feature in this app is a
 *    single request/response (askProfile, icebreaker, questionRewrite) —
 *    nothing here needed multi-turn *transcript* storage server-side. The
 *    client resends the trailing turns each call (capped below), the same way
 *    any stateless chat endpoint works. Cost and abuse are bounded by
 *    MAX_TURNS + MAX_TOKENS, not by a database row. (`GrioMemory` is not a
 *    counter-example: it stores a handful of user-approved facts, never the
 *    conversation.)
 *
 * 2. **Own data yes, other people's data no.** The original version of this
 *    route was blind to everything, for a reason worth restating precisely:
 *    a concierge that could see "your matches" would immediately be pulled
 *    into ranking or recommending a specific person — exactly what D-32
 *    reserves for the deterministic pipeline. Phase G keeps that hazard
 *    closed while opening the harmless half: Grio now reads the user's *own*
 *    state (completion %, plan, counts, unread inbox) and still never sees a
 *    candidate's attributes. `lib/services/grio/context.ts` is where that
 *    line is drawn and defended; today's reel appears there as three numbers
 *    precisely because a count cannot be ranked.
 *
 * 3. **Actions are proposals, not effects.** The model can emit
 *    `<<<ACT:key>>>` markers, which the client turns into buttons. Nothing
 *    fires without a tap, every `do` endpoint re-authorizes the request on its
 *    own terms, and the button's wording comes from the catalog rather than
 *    the model. This is the same shape `<<<SEND>>>` has always had.
 */

const MAX_TURNS = 12;
const MAX_MESSAGE_LENGTH = 1000;

const SYSTEM_PROMPT = `Aap BandhanTak ke AI assistant "Grio" hain — ek Indian matrimony platform ka general guidance assistant.

Aap madad kar sakte hain:
- Achhi bio/profile kaise likhein
- Pehli baat-cheet me kya poochein, kya avoid karein
- Family se kaise baat karein rishtey ke baare me
- Red flags ya healthy conversation ke general signs
- Platform ke features kaise use karein (voice notes, Ask Bridge, Vibe Hub, Deep Profile)

Aap KABHI NAHI kar sakte:
- Kisi specific insaan (candidate, match) ke baare me opinion dena ya recommend karna ki kisi se baat karein ya na karein — ye faisla hamesha user ka apna hai, platform ka matching system karta hai, aap nahi.
- Legal, financial, ya medical advice dena — sirf general disclaimers dein aur professional se poochne ko kahein.
- Koi bhi data invent karna. Neeche "AAPKE USER KI ABHI KI SITUATION" me jo diya hai bas wahi sach hai — usse aage koi number, naam ya detail mat maano. Doosre logon ki profile, unki umar, sheher ya score aapko kabhi nahi milte; agar user aisa kuch poochhe to saaf kah dijiye ki wo jaankari aapke paas nahi hai.
- Matrimony ke alawa topics par baat karna — politely wapas is topic par le aayein.

User jis language me apna sawaal likhta hai, usi language me jawab dijiye — Hinglish sawaal ka jawab Hinglish me, pure English sawaal ka jawab English me, Hindi (Devanagari) sawaal ka jawab Hindi me. Default Hinglish hai sirf jab language clear na ho. Warm aur respectful tone me, chhote jawab dijiye (3-4 lines max jab tak zyada na maanga jaye).`;

/**
 * Built from the catalog, never hand-written, so a new action can't ship with
 * the model unaware of it (or — worse — the model aware of an action that was
 * removed). `remember` is listed last and separately because it is the one
 * action whose argument is free text.
 */
const ACTION_INSTRUCTIONS = (() => {
  const keys = Object.keys(GRIO_ACTIONS) as GrioActionKey[];
  const listed = keys
    .filter((key) => key !== "remember")
    .map((key) => `- ${ACT_MARKER_START}${key}${ACT_MARKER_END} — ${GRIO_ACTIONS[key].when}`)
    .join("\n");

  return `

BUTTONS — aap apne jawab ke aakhir me app ke andar ka ek button laga sakte hain. Button ka marker aise likhein, apni line me:

${listed}
- ${ACT_MARKER_START}remember:<baat>${ACT_MARKER_END} — ${GRIO_ACTIONS.remember.when}

Button ke niyam:
- Ek jawab me zyada se zyada 2 button. Aksar 0 hi sahi hota hai — button tabhi lagayein jab wo user ke abhi ke sawaal ka seedha agla kadam ho.
- Marker ke andar sirf key likhein, apna koi text nahi. Button par kya likha jayega wo app khud tay karta hai — aap uska naam mat likhiye, aur "neeche button dabaiye" jaisa kuch bhi mat likhiye.
- Jo baat aapko "AAPKE USER KI ABHI KI SITUATION" me nahi mili, uske liye button mat lagayein. Jaise Deep Profile pehle se analyze ho chuki ho to analyze karne ka button mat dijiye.
- Button ek suggestion hai — dabaana ya na dabaana user ki marzi hai. Aap kabhi ye maan kar aage mat badhiye ki kaam ho gaya.`;
})();

const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(MAX_MESSAGE_LENGTH),
});

const BodySchema = z.object({
  messages: z.array(MessageSchema).min(1).max(MAX_TURNS),
  /**
   * Opt-in scope (Phase 1 send flow) — when set, Grio is helping draft a line
   * for *this one* match specifically. Only then does it see that match's
   * display name and recent messages, and only then does the system prompt
   * offer the <<<SEND>>> marker. Unscoped calls stay exactly as general and
   * data-blind as before (D-32's boundary).
   */
  matchId: z.string().min(1).optional(),
});

const SEND_MARKER_INSTRUCTIONS = (otherName: string, transcript: string) => `

Abhi user apne match "${otherName}" ke liye ek real message likhne me madad maang raha hai — ye us "kisi specific insaan ke baare me opinion" waali paabandi se alag hai, ye sirf unhi ke liye ek line likhne me madad hai jo user khud bhejega.

Unki conversation ke last messages (sirf context ke liye — invent mat karna, isse aage kuch mat maano):
${transcript}

Har suggestion ${otherName} ke liye tailored ho, generic template jaisa na lage: agar conversation me unhone khud koi topic, interest, ya cheez mention ki hai, use naturally use karo. Agar abhi tak koi conversation nahi hui, to unke naam ke alawa kuch invent mat karo — sirf ek general warm opening do.

Suggested line (${SEND_MARKER_START} ke andar wali) bhi usi language me likho jis language me user ne ABHI apna sawaal poocha hai — Hinglish sawaal ho to Hinglish line, English sawaal ho to English line. Ye tags ke bahar wale jawab jaisa hi rule hai, sirf isliye dobara likha hai kyunki suggested line alag content hai aur apni language khud English default mat le le.

Tone conversation ki depth dekh kar rakho: shuru me ya kam messages hue hain to respectful, curious aur halka warm rakho — filmy ya bahut romantic lines abhi nahi (matrimony context hai, dating app nahi). Conversation jitni aage badh chuki ho, sweet ya romantic quote/line utni hi appropriate ho jaati hai. Agar user khud "pyari line" ya "quote" maange, apni ek chhoti original line likho jo unki conversation se match kare — kisi gaane ya shayar ki exact lines copy mat karna.

Jab bhi tum ek exact line suggest karo jo ${otherName} ko bheji ja sakti hai, use ${SEND_MARKER_START} aur ${SEND_MARKER_END} tags ke beech likho — sirf wahi text jo bhejna hai, koi extra explanation tags ke andar nahi. Tags ke bahar tum normal tarah samjha sakte ho. Agar user options/icebreaker maange (jaise "icebreaker do" ya "options do"), to 2-3 alag-alag ${SEND_MARKER_START}...${SEND_MARKER_END} blocks de sakte ho, har ek apni alag line ke saath. Warna sirf ek hi block dena.`;

export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const gate = await isFeatureAvailable(user.id, "aiConcierge", (ctx) => ctx.features.chat);
  if (!gate.allowed) {
    return NextResponse.json(
      { ok: false, code: "not_configured", message: "Ye feature abhi aapke plan me available nahi hai." } satisfies ConciergeResponse,
      { status: 403 },
    );
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, code: "bad_request", message: "Message chahiye." } satisfies ConciergeResponse,
      { status: 400 },
    );
  }

  // Both are the user's own data and neither can fail the request: a chat that
  // 500s because a count query hiccuped would be a worse product than a chat
  // that answers without today's numbers. Failure degrades Grio to exactly the
  // Phase E behaviour — general guidance, no context — which is a state this
  // route already knows how to be in.
  const [contextBlock, memoryFacts] = await Promise.all([
    buildGrioContext(user.id).catch((err) => {
      console.error("[grio] context build failed:", err instanceof Error ? err.message : String(err));
      return null;
    }),
    getMemory(user.id).catch(() => [] as string[]),
  ]);

  /*
   * Static in `system`, volatile in `content` — and this split is load-bearing
   * for cost, not just tidiness.
   *
   * `callAnthropic` marks the whole `system` block `cache_control: ephemeral`.
   * That only pays off if the block is byte-identical between calls. Grio's
   * context contains today's unread count and reel progress, so folding it
   * into `system` would change the cached prefix on literally every request:
   * every call becomes a cache *write* (pricier than a plain call) and no call
   * is ever a cache *hit*. Keeping `system` to the persona plus the action
   * catalog — both of which change only on deploy — means the expensive,
   * unchanging half of the prompt is cached across a whole conversation, and
   * only the cheap volatile half is re-sent.
   */
  const system = SYSTEM_PROMPT + ACTION_INSTRUCTIONS;
  const volatileBlocks: string[] = [];

  if (contextBlock) {
    volatileBlocks.push(`AAPKE USER KI ABHI KI SITUATION (asli data, aaj ka):
${contextBlock}

Ye sirf is user ka apna data hai. Isse baat ko zameen par rakhiye — jab relevant ho tabhi iska zikr kijiye, har jawab me poori list mat dohraaiye. Ye numbers user ke apne hain; kisi doosre insaan ki koi jaankari isme nahi hai aur na aapko kahin aur se milegi.`);
  }

  const memoryBlock = formatMemory(memoryFacts);
  if (memoryBlock) {
    volatileBlocks.push(`USER NE PEHLE KHUD YE BATAYA THA (unhone khud save kiya hai):
${memoryBlock}

Inhe yaad rakhiye, par har baar dohraaiye mat. Agar in me se kuch purana ya galat lage to user se poochh lijiye — khud badal mat dijiye.`);
  }

  if (parsed.data.matchId) {
    const thread = await getThreadData(user.id, parsed.data.matchId);
    if (!thread) {
      return NextResponse.json(
        { ok: false, code: "bad_request", message: "Match nahi mila." } satisfies ConciergeResponse,
        { status: 400 },
      );
    }
    const chatGate = await canChatInMatch(user.id, parsed.data.matchId);
    if (!chatGate.allowed) {
      return NextResponse.json(
        { ok: false, code: "not_configured", message: "Is match ke saath chat abhi available nahi hai." } satisfies ConciergeResponse,
        { status: 403 },
      );
    }
    const matchTranscript =
      thread.messages
        .slice(-6)
        .map((m) => `${m.senderId === user.id ? "User" : thread.other.displayName}: ${m.body}`)
        .join("\n") || "(abhi koi message nahi hua hai)";
    // Volatile too (this match's name and last messages), so it joins the
    // content side rather than the cached system prefix.
    volatileBlocks.push(SEND_MARKER_INSTRUCTIONS(thread.other.displayName, matchTranscript).trim());
  }

  // The provider call takes one content string; the running turns are folded
  // in as plain transcript rather than a native multi-message array, since
  // `callAi`'s shared signature (used by every other feature) is single-turn.
  const transcript = parsed.data.messages
    .map((m) => `${m.role === "user" ? "User" : "Grio"}: ${m.content}`)
    .join("\n");

  const content = [...volatileBlocks, `BAAT-CHEET ABHI TAK:\n${transcript}`].join("\n\n---\n\n");

  const result = await callAi({
    configFeature: "rishtaConcierge",
    logFeature: "rishta_concierge",
    userId: user.id,
    system,
    content,
    maxTokens: 500,
  });

  if (!result.ok) {
    const { status, code } = mapAiError(result.kind);
    // The user-facing string for `upstream_error` is deliberately vague, which
    // also made every failure here undiagnosable from the outside — a 502 with
    // no server-side trace of *why*. The provider's own message is the only
    // place that distinction lives, so it gets logged before being dropped.
    console.error(`[grio] AI call failed (${result.kind}):`, result.message);
    return NextResponse.json(
      { ok: false, code, message: result.kind === "upstream_error" ? "Jawab nahi ban paaya." : result.message } satisfies ConciergeResponse,
      { status },
    );
  }

  return NextResponse.json({ ok: true, reply: result.text.trim() } satisfies ConciergeResponse);
}
