import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { callAi } from "@/lib/ai/providers";
import { mapAiError } from "@/lib/ai/routeError";
import { isFeatureAvailable } from "@/lib/services/plans/entitlements";
import { getThreadData } from "@/lib/data/messagesData";
import { canChatInMatch } from "@/lib/services/circle/connectionService";
import { SEND_MARKER_START, SEND_MARKER_END, type ConciergeResponse } from "@/lib/contracts/concierge";

export const runtime = "nodejs";

/**
 * AI Rishta Concierge (Phase E) — general matchmaking guidance, deliberately
 * stateless and deliberately not wired to the user's own matches/profile.
 *
 * Two design calls worth stating:
 *
 * 1. **No conversation table.** Every other AI feature in this app is a
 *    single request/response (askProfile, icebreaker, questionRewrite) —
 *    nothing here needed multi-turn *memory* server-side before. Rather than
 *    add a new persisted-chat model for one feature, the client resends the
 *    trailing turns each call (capped below), the same way any stateless chat
 *    endpoint works. Cost and abuse are bounded by MAX_TURNS + MAX_TOKENS,
 *    not by a database row.
 *
 * 2. **No tool access to the user's real data.** A concierge that could see
 *    "your matches" would immediately be pulled into ranking or recommending
 *    a specific person — exactly what D-32 reserves for the deterministic
 *    pipeline. This one only ever gives *general* guidance (how to write a
 *    bio, what to ask early on, how much to share) — the system prompt below
 *    is the whole boundary, enforced by never handing it anyone's data to
 *    reason over in the first place.
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
- Kisi bhi user ka data invent karna — aapko kisi ke profile ya match ki jaankari nahi di gayi hai, aur na hi maangni hai.
- Matrimony ke alawa topics par baat karna — politely wapas is topic par le aayein.

User jis language me apna sawaal likhta hai, usi language me jawab dijiye — Hinglish sawaal ka jawab Hinglish me, pure English sawaal ka jawab English me, Hindi (Devanagari) sawaal ka jawab Hindi me. Default Hinglish hai sirf jab language clear na ho. Warm aur respectful tone me, chhote jawab dijiye (3-4 lines max jab tak zyada na maanga jaye).`;

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

  let system = SYSTEM_PROMPT;
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
    system = SYSTEM_PROMPT + SEND_MARKER_INSTRUCTIONS(thread.other.displayName, matchTranscript);
  }

  // The provider call takes one content string; the running turns are folded
  // in as plain transcript rather than a native multi-message array, since
  // `callAi`'s shared signature (used by every other feature) is single-turn.
  const transcript = parsed.data.messages
    .map((m) => `${m.role === "user" ? "User" : "Grio"}: ${m.content}`)
    .join("\n");

  const result = await callAi({
    configFeature: "rishtaConcierge",
    logFeature: "rishta_concierge",
    userId: user.id,
    system,
    content: transcript,
    maxTokens: 500,
  });

  if (!result.ok) {
    const { status, code } = mapAiError(result.kind);
    return NextResponse.json(
      { ok: false, code, message: result.kind === "upstream_error" ? "Jawab nahi ban paaya." : result.message } satisfies ConciergeResponse,
      { status },
    );
  }

  return NextResponse.json({ ok: true, reply: result.text.trim() } satisfies ConciergeResponse);
}
