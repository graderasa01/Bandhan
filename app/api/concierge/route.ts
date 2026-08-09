import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { callAi } from "@/lib/ai/providers";
import { mapAiError } from "@/lib/ai/routeError";
import { getPlanContext, isFeatureAvailable } from "@/lib/services/plans/entitlements";
import { consumeReward } from "@/lib/services/rewards/rewardService";
import { getPlanCatalog, planFeaturesOf } from "@/lib/services/plans/planCatalog";
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
import { buildCandidateDossier } from "@/lib/services/grio/dossier";
import { getMemory, formatMemory } from "@/lib/services/grio/memory";
import type { AiFeatureKey } from "@/lib/ai/models";

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
 * 3. **Actions are proposals, not effects — `remember` excepted.** The model
 *    can emit `<<<ACT:key>>>` markers, which the client turns into buttons.
 *    Nothing fires without a tap, every `do` endpoint re-authorizes the
 *    request on its own terms, and the button's wording comes from the
 *    catalog rather than the model. This is the same shape `<<<SEND>>>` has
 *    always had — except `remember`, which the client saves the moment it
 *    appears, no tap. See the "confirm gate" note on `GrioActionKind` in
 *    `lib/contracts/grio.ts` for why that one case is safe to auto-run.
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

const BodySchema = z
  .object({
    messages: z.array(MessageSchema).min(1).max(MAX_TURNS),
    /**
     * Opt-in scope (Phase 1 send flow) — when set, Grio is helping draft a line
     * for *this one* match specifically. Only then does it see that match's
     * display name and recent messages, and only then does the system prompt
     * offer the <<<SEND>>> marker. Unscoped calls stay exactly as general and
     * data-blind as before (D-32's boundary).
     */
    matchId: z.string().min(1).optional(),
    /**
     * Rishta Lens scope — when set, Grio is explaining *this one* candidate's
     * fit to the viewer. Premium, and strictly one profile per request: see
     * `lib/services/grio/dossier.ts` for why that singularity is the feature's
     * whole safety argument rather than a limitation.
     */
    candidateProfileId: z.string().min(1).optional(),
  })
  // Two scopes are two different jobs — drafting a message to someone who
  // already said yes, and understanding someone who hasn't been asked. Allowing
  // both in one request would put a candidate dossier and a live chat
  // transcript in the same prompt, which is the one combination that could let
  // Grio write a message using facts the recipient never shared in that chat.
  .refine((b) => !(b.matchId && b.candidateProfileId), {
    message: "Ek request me sirf ek scope.",
    path: ["candidateProfileId"],
  });

const SEND_MARKER_INSTRUCTIONS = (otherName: string, transcript: string) => `

Abhi user apne match "${otherName}" ke liye ek real message likhne me madad maang raha hai — ye us "kisi specific insaan ke baare me opinion" waali paabandi se alag hai, ye sirf unhi ke liye ek line likhne me madad hai jo user khud bhejega.

Unki conversation ke last messages (sirf context ke liye — invent mat karna, isse aage kuch mat maano):
${transcript}

Har suggestion ${otherName} ke liye tailored ho, generic template jaisa na lage: agar conversation me unhone khud koi topic, interest, ya cheez mention ki hai, use naturally use karo. Agar abhi tak koi conversation nahi hui, to unke naam ke alawa kuch invent mat karo — sirf ek general warm opening do.

Suggested line (${SEND_MARKER_START} ke andar wali) bhi usi language me likho jis language me user ne ABHI apna sawaal poocha hai — Hinglish sawaal ho to Hinglish line, English sawaal ho to English line. Ye tags ke bahar wale jawab jaisa hi rule hai, sirf isliye dobara likha hai kyunki suggested line alag content hai aur apni language khud English default mat le le.

Tone conversation ki depth dekh kar rakho: shuru me ya kam messages hue hain to respectful, curious aur halka warm rakho — filmy ya bahut romantic lines abhi nahi (matrimony context hai, dating app nahi). Conversation jitni aage badh chuki ho, sweet ya romantic quote/line utni hi appropriate ho jaati hai. Agar user khud "pyari line" ya "quote" maange, apni ek chhoti original line likho jo unki conversation se match kare — kisi gaane ya shayar ki exact lines copy mat karna.

Jab bhi tum ek exact line suggest karo jo ${otherName} ko bheji ja sakti hai, use ${SEND_MARKER_START} aur ${SEND_MARKER_END} tags ke beech likho — sirf wahi text jo bhejna hai, koi extra explanation tags ke andar nahi. Tags ke bahar tum normal tarah samjha sakte ho. Agar user options/icebreaker maange (jaise "icebreaker do" ya "options do"), to 2-3 alag-alag ${SEND_MARKER_START}...${SEND_MARKER_END} blocks de sakte ho, har ek apni alag line ke saath. Warna sirf ek hi block dena.`;

/**
 * Rishta Lens' scoped block.
 *
 * The base system prompt forbids "kisi specific insaan ke baare me opinion dena
 * ya recommend karna". That rule is not lifted here — it is split. The half
 * that forbids *deciding* stays, word for word, because it is the D-32 line.
 * The half that accidentally forbade *explaining* a ranking the app itself
 * already performed and already shows the user on screen is what this scope
 * carves out, the same way `SEND_MARKER_INSTRUCTIONS` carves out drafting.
 */
const EXPLAIN_INSTRUCTIONS = (name: string, dossier: string) => `

Abhi aapke user ne "${name}" ki profile kholi hai aur usi ek rishtey ko samajhna chahte hain.

Ye us "kisi specific insaan ke baare me opinion dena" waali paabandi se alag kaam hai, aur farak saaf hai: **aap samjha rahe hain, faisla nahi kar rahe.** Ranking pehle hi ho chuki hai — code ne, deterministically. Aap sirf wo hisaab, aur jo baatein user ko is page par pehle se dikh rahi hain, unhe seedhi bhasha me kholte hain.

${dossier}

Is scope ke sakht niyam:
- Faisla kabhi mat dijiye. "Haan inse baat kar lijiye", "ye aapke liye sahi hain", "ye rehne dijiye" — kuch bhi is tarah ka nahi. Har jawab ke baad faisla user ke paas hi rehna chahiye.
- Aapke paas sirf **yahi ek** profile hai. Kisi doosre candidate se tulna mat kijiye, "isse behtar" ya "sabse achha" jaisa kuch mat kahiye — aapko doosron ka data milta hi nahi hai.
- Upar ke numbers code ne nikaale hain. Unhe badliye mat, aur "asli matlab ye hai" keh kar apna alag score mat banaiye. Number kam ho to wo kyun kam hai, wo bataiye.
- Jo cheez mel nahi khaati, wo chhupaiye mat — saaf aur respect ke saath boliye. Ek honest concern is jawab ki sabse kaam ki cheez hai.
- Jo upar diya hai bas wahi aapko pata hai. Uske bahar ki koi baat — inki income, jaati, phone, koi bhi field jo upar nahi hai — aapke paas nahi hai; saaf keh dijiye ki wo jaankari abhi khuli nahi hai aur kyun.
- "Perfect match", "guarantee", "100% compatible" — aisi bhasha kabhi nahi.
- Baat rishtey ki samajh tak rakhiye. Agar user poochein "kya karun", to unhe wo cheezein bataiye jo wo khud dekh kar tay kar sakte hain (kya poochein, kis baat par dhyaan dein) — apna faisla nahi.`;

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

  // Rishta Lens. Gated separately from the chat gate above, and *after* it.
  //
  // Worth stating because it is not obvious and it bounds who a MATCH_EXPLAIN
  // credit can actually reach: the `aiConcierge` gate above tests
  // `ctx.features.chat`, which FREE does not have. So a FREE user holding a
  // MATCH_EXPLAIN credit is turned away up there and never gets here. That is
  // the intended shape rather than an oversight — the scoped conversation is
  // still a conversation, and Grio's whole chat surface is a paid feature — so
  // the credit's real audience is BASIC/STANDARD, the plans this feature is
  // actually trying to move to Premium. Anyone wiring a quest that grants
  // MATCH_EXPLAIN should grant it to those tiers, not to FREE.
  let scopedAi: { configFeature: AiFeatureKey; logFeature: string } | null = null;
  let spendsExplainCredit = false;
  if (parsed.data.candidateProfileId) {
    const explainGate = await isFeatureAvailable(
      user.id,
      "grioMatchExplain",
      (ctx) => ctx.features.matchExplain,
    );
    if (!explainGate.allowed) {
      return NextResponse.json(
        {
          ok: false,
          code: "not_configured",
          message:
            explainGate.reason === "plan"
              ? "Kisi ek rishtey par Grio se baat Premium plan me milti hai. Score ka poora hisaab aapko abhi bhi free me dikh raha hai."
              : "Ye feature abhi band hai.",
        } satisfies ConciergeResponse,
        { status: 403 },
      );
    }

    const dossier = await buildCandidateDossier(user.id, parsed.data.candidateProfileId);
    if (!dossier) {
      return NextResponse.json(
        { ok: false, code: "bad_request", message: "Profile nahi mili." } satisfies ConciergeResponse,
        { status: 400 },
      );
    }
    // Volatile, like every other scope block: the dossier is per-candidate, so
    // folding it into the cached `system` prefix would turn every request into
    // a cache write and never a cache hit (see the note above `system`).
    volatileBlocks.push(EXPLAIN_INSTRUCTIONS(dossier.name, dossier.text).trim());
    scopedAi = { configFeature: "matchExplain", logFeature: "match_explain" };

    // Whether this call is riding on the *plan* or on a credit. Read from
    // the plan catalog directly, not `ctx.features`, because a held
    // MATCH_EXPLAIN credit already flipped that flag true — checking the merged
    // value would mean Premium subscribers silently burn credits they were
    // granted for something else, and free users burn none.
    const planCtx = await getPlanContext(user.id);
    spendsExplainCredit = !planFeaturesOf(await getPlanCatalog(), planCtx.effectivePlanCode).matchExplain;
  }

  // The provider call takes one content string; the running turns are folded
  // in as plain transcript rather than a native multi-message array, since
  // `callAi`'s shared signature (used by every other feature) is single-turn.
  const transcript = parsed.data.messages
    .map((m) => `${m.role === "user" ? "User" : "Grio"}: ${m.content}`)
    .join("\n");

  const content = [...volatileBlocks, `BAAT-CHEET ABHI TAK:\n${transcript}`].join("\n\n---\n\n");

  const result = await callAi({
    configFeature: scopedAi?.configFeature ?? "rishtaConcierge",
    logFeature: scopedAi?.logFeature ?? "rishta_concierge",
    userId: user.id,
    system,
    content,
    // The scoped answer has more ground to cover honestly — four signals, a
    // guna total and a concern — and truncating an explanation mid-caveat is
    // the one failure mode that actively misleads.
    maxTokens: scopedAi ? 700 : 500,
  });

  // Same rule as /api/reel/ask: a call that actually reached the provider —
  // success or a billed refusal — spends the credit; a config or rate-limit
  // failure does not. Spending can only log on failure, never change the
  // response, because the provider has already billed us by the time this runs.
  if (spendsExplainCredit && (result.ok || result.usage !== undefined)) {
    await consumeReward(user.id, "MATCH_EXPLAIN", 1).catch((err) => {
      console.error(
        "[grio] failed to consume MATCH_EXPLAIN credit:",
        err instanceof Error ? err.message : String(err),
      );
    });
  }

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
