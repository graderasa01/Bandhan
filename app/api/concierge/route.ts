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
import {
  SEND_MARKER_START,
  SEND_MARKER_END,
  ASK_MARKER_START,
  WHO_MARKER_START,
  WHO_MARKER_END,
  DO_MARKER_START,
  type ConciergeResponse,
  type ConciergeRosterEntry,
} from "@/lib/contracts/concierge";
import {
  ACT_MARKER_START,
  ACT_MARKER_END,
  GRIO_ACTIONS,
  GRIO_LIMITS,
  type GrioActionKey,
} from "@/lib/contracts/grio";
import { buildGrioContext } from "@/lib/services/grio/context";
import {
  buildGrioRoster,
  formatGrioRoster,
  GRIO_WHO_INSTRUCTIONS,
} from "@/lib/services/grio/roster";
import { buildActionConsequences, GRIO_ACTION_RULES } from "@/lib/services/grio/consequences";
import { buildPendingBriefing } from "@/lib/services/grio/pending";
import { matchGrioQuickAnswer } from "@/lib/services/grio/quickAnswer";
import { buildCandidateDossier } from "@/lib/services/grio/dossier";
import {
  authorizeLearnMarkers,
  buildLearnAllowlist,
  buildSelfKnowledge,
  formatSelfKnowledge,
  GRIO_KNOWLEDGE_RULES,
  GRIO_LEARN_INSTRUCTIONS,
} from "@/lib/services/grio/selfKnowledge";
import { buildTodayBoard, formatTodayBoard } from "@/lib/services/today/priorityEngine";
import { buildBandhanJourney, formatBandhanJourney } from "@/lib/services/journey/bandhanJourney";
import { getRishtaSummary, formatRishtaSummary } from "@/lib/services/rishta/journeyService";
import { prisma } from "@/lib/db/prisma";
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
 *
 * 4. **Phase H: the model picks the verb, the user picks the person.** Some
 *    actions now land on somebody (interest, shortlist, voice note) and a
 *    second text marker, `<<<ASK>>>`, drafts an Ask Bridge question. Neither
 *    widens what the model *knows*: a targeted marker carries no id, so the
 *    client resolves the target from the open profile or a picker the model
 *    never sees. What it can propose grew; who it can name did not.
 *
 *    The other half of that is `buildActionConsequences` — every "agar aap ye
 *    karein to ye hoga" sentence is computed from the same functions the UI
 *    uses and handed to the model as facts, because an assistant that has
 *    buttons and improvises their consequences is worse than one with neither.
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
- Koi bhi data invent karna. Neeche jo blocks diye gaye hain bas wahi sach hai — unse aage koi number, naam ya detail mat maano. Doosre logon ki umar, sheher, kaam ya parivaar aapko tab tak nahi milte jab tak app kisi ek par focus na kar de; agar user usse pehle aisa kuch poochhe to saaf kah dijiye ki wo jaankari abhi aapke paas nahi hai.
- Matrimony ke alawa topics par baat karna — politely wapas is topic par le aayein.

User jis language me apna sawaal likhta hai, usi language me jawab dijiye — Hinglish sawaal ka jawab Hinglish me, pure English sawaal ka jawab English me, Hindi (Devanagari) sawaal ka jawab Hindi me. Default Hinglish hai sirf jab language clear na ho. Warm aur respectful tone me, chhote jawab dijiye (3-4 lines max jab tak zyada na maanga jaye).`;

/** `<<<DO:` shares `<<<ACT:`'s terminator; aliased so the prompt reads symmetrically. */
const DO_MARKER_END = ACT_MARKER_END;

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
    .map((key) => {
      const spec = GRIO_ACTIONS[key];
      // The `needs` suffix is generated, not hand-written per row, so a future
      // targeted action cannot ship without the model being told the one thing
      // it must not do with it: name the person.
      const targeted =
        "needs" in spec && spec.needs
          ? " — [ye kisi ek insaan par hota hai. Agar user ne kisi ka zikr kiya hai to pehle usi turn me uska <<<WHO:n>>> likh dijiye — button apne aap unhi par lag jayega. Warna sirf button dijiye, app khud poochh lega ki kis par. Kisi bhi soorat me profile id ya 'pehle profile kholiye' jaisa kuch mat likhiye]"
          : "";
      return `- ${ACT_MARKER_START}${key}${ACT_MARKER_END} — ${spec.when}${targeted}`;
    })
    .join("\n");

  return `

BUTTONS — aap app ke andar ka ek button laga sakte hain. Button ka marker jawab ki sabse pehli lines me likhein, apni baat se pehle, har marker apni alag line me (kyun — neeche "MARKER KAISE LIKHNE HAIN" me):

${listed}
- ${ACT_MARKER_START}remember:<baat>${ACT_MARKER_END} — ${GRIO_ACTIONS.remember.when}

JAB USER KHUD KEHKAR BOLE — do tarah ke marker hain, aur farak sirf itna hai ki kisne maanga:
- ${ACT_MARKER_START}key${ACT_MARKER_END} — AAP sujha rahe hain. User ko button milta hai, dabana ya na dabana unki marzi.
- ${DO_MARKER_START}key${DO_MARKER_END} — USER ne khud saaf kaha. Ye button nahi banta, kaam turant ho jaata hai.

${DO_MARKER_START}key${DO_MARKER_END} sirf tab jab user ne is turn me khud saaf kaha ho: "interest bhej do", "shortlist kar do", "mujhe reel par le chalo", "wo page kholo". Agar unhone sirf poochha hai ("interest bhejun kya?", "iska kya matlab hai?", "kaise karte hain?") to ye sawaal hai, hukum nahi — waise me ${ACT_MARKER_START}key${ACT_MARKER_END} dijiye. Shak ho to hamesha ${ACT_MARKER_START}key${ACT_MARKER_END}: button na dabaya jaana wapas liya ja sakta hai, bheja hua interest 24 ghante baad nahi.
- Ek jawab me sirf ek ${DO_MARKER_START}key${DO_MARKER_END}. Do kaam ek saath maange jayein to pehla kar dijiye aur doosre ka button de dijiye.
- Jo kaam kisi ek insaan par hota hai, usme ${DO_MARKER_START}key${DO_MARKER_END} ke saath usi turn me ${WHO_MARKER_START}n${WHO_MARKER_END} bhi likhna zaroori hai — warna app ko pata hi nahi chalega kis par karna hai aur wo user se poochhega. Agar aapko khud nahi pata ki kaun, to ${DO_MARKER_START}key${DO_MARKER_END} mat likhiye.
- Kaam ho jaane ke baad app khud user ko bata deta hai ki kya hua. Aap "bhej diya" jaisa daava mat likhiye — bas itna ki aap kar rahe hain.
- Voice note aur aaye hue sawaal ka jawab: inme ${DO_MARKER_START}key${DO_MARKER_END} se recorder khulta hai, kuch bheja nahi jaata. Awaaz user ki honi hai, isliye bhejne ka aakhri kadam hamesha unka hai.

Button ke niyam:
- Ek jawab me zyada se zyada 2 button. Aksar 0 hi sahi hota hai — button tabhi lagayein jab wo user ke abhi ke sawaal ka seedha agla kadam ho.
- Marker ke andar sirf key likhein, apna koi text nahi. Button par kya likha jayega wo app khud tay karta hai — aap uska naam mat likhiye, aur "neeche button dabaiye" jaisa kuch bhi mat likhiye.
- Jo baat aapko "AAPKE USER KI ABHI KI SITUATION" me nahi mili, uske liye button mat lagayein. Jaise Deep Profile pehle se analyze ho chuki ho to analyze karne ka button mat dijiye.
- Button ek suggestion hai — dabaana ya na dabaana user ki marzi hai. Aap kabhi ye maan kar aage mat badhiye ki kaam ho gaya.
- Jo button kisi ek insaan par hota hai (upar [] me likha hai), usme bhi aap sirf kaam chunte hain — insaan hamesha user khud chunta hai. Isliye jab user aisa kaam maange, to us kaam ka button dijiye; uske badle "pehle profile kholiye" ya "shortlist par jaiye" wala page-button mat dijiye. App khud poochh lega ki kis par.

SAWAAL POOCHHNA — agar user kisi rishtey se koi ek sawaal poochhna chahta hai (Ask Bridge), to sawaal ka text ${ASK_MARKER_START} aur ${SEND_MARKER_END} ke beech likhiye — sirf sawaal, koi explanation tags ke andar nahi. User use bhejne se pehle badal sakta hai.
- Ye sirf tab jab dono ki baat abhi shuru nahi hui. Jinse chat pehle se khuli hai unhe seedha message bhejte hain, sawaal nahi.
- Ek insaan se zindagi me ek hi sawaal ja sakta hai, isliye ek jawab me ek hi ${ASK_MARKER_START} block dijiye — options nahi.
- Sawaal chhota, respectful aur aisa ho jiska jawab ek chhoti si baat me diya ja sake.

JO AAP NAHI KAR SAKTE — ye aapki seemayein hain. Jab user in me se kuch maange, to mana kar ke chup mat ho jaiye: seemá bhi bataiye aur raasta bhi.
${GRIO_LIMITS.map((l) => `- ${l}`).join("\n")}`;
})();

/**
 * The one action key the examples below name out loud.
 *
 * Typed as `GrioActionKey` rather than written inline for the same reason
 * `ACTION_INSTRUCTIONS` is generated from the catalog instead of hand-written:
 * an example that teaches a key which no longer exists is worse than no example
 * at all, because `parseGrioSegments` drops an unknown key without a word and
 * the model has been shown, in its most-trusted form, exactly how to produce
 * nothing. The annotation turns that into a build failure the moment the key is
 * renamed or removed — which is the only kind of check a prompt string can get.
 */
const EXAMPLE_TARGETED_ACTION: GrioActionKey = "sendInterestToProfile";

/**
 * Worked examples of the marker formats — added after the model started being
 * switchable to cheaper providers.
 *
 * Everything above this states the marker rules in prose. Prose is enough for a
 * frontier model and demonstrably not enough for a small one, and the gap
 * matters more here than it would in most prompts because of how this app reads
 * the output: every marker failure in `parseGrioSegments` is *silent*. A
 * `<<<WHO:#2>>>` is not an error, it is a reply with one fewer button than the
 * model intended — indistinguishable, from the user's side, from Grio simply
 * choosing not to offer one. So the usual signal that a model is too weak for a
 * job (visible breakage) never arrives; the feature just quietly does less.
 *
 * Hence the negatives at the end. They are not padding: each one is a string
 * that `Number(body.trim())` turns into `NaN`, or a key `isGrioActionKey`
 * rejects, and they are the four shapes a model actually reaches for when it
 * understands the *intent* of the marker but not its grammar — writing the
 * ordinal the way the roster displays it (`#2`), helpfully adding the name,
 * using the name alone, or describing the action in its own words.
 *
 * Static, so it stays in the cached `system` prefix and costs one cache write
 * per deploy rather than anything per turn (see the note above `system`).
 * `<<<SEND>>>` is deliberately absent: it is only offered inside match scope, and
 * teaching it here would hand every unscoped turn a marker it must not use.
 */
const FORMAT_EXAMPLES = `

MARKER KAISE LIKHNE HAIN — neeche asli jawab hain, bilkul waise hi jaise likhe jaane chahiye. Marker ka shape hu-ba-hu wahi rakhiye. Ek bhi akshar idhar-udhar hua to app us marker ko chup-chaap gira deta hai: koi error nahi aata, bas user ko wo button ya focus milta hi nahi — aur aapko pata bhi nahi chalta.

SABSE ZAROORI: ${WHO_MARKER_START}n${WHO_MARKER_END}, ${ACT_MARKER_START}key${ACT_MARKER_END} aur ${DO_MARKER_START}key${DO_MARKER_END} hamesha jawab ki SABSE PEHLI lines me likhiye, apni baat likhne se PEHLE. Ye user ko wahin nahi dikhte jahan aap likhte hain — app inhe alag se button banata hai — isliye inka upar hona jawab ko badalta nahi hai. Par agar aapka jawab lamba ho gaya aur beech me kat gaya, to aakhir me likhe marker kat jaate hain aur button gayab ho jaata hai. Upar likhe hue kabhi nahi katte.

Udaharan 1 — user ne list me se ek ka naam liya, aur unhe sirf uske baare me jaanna hai. List me tha "#2 Priya — aaj ke reel me (abhi baaki hai), match score 78/100".
User: Priya ke baare me batao
Aapka poora jawab:
${WHO_MARKER_START}2${WHO_MARKER_END}
Theek hai, Priya ko dekhte hain.

Udaharan 2 — user ne saaf HUKUM diya aur naam bhi liya. Isliye ${DO_MARKER_START}...${DO_MARKER_END}, aur saath me ${WHO_MARKER_START}n${WHO_MARKER_END} taaki app ko pata ho kis par. Dono marker pehle, alag-alag line par; baat uske baad.
User: Priya ko interest bhej do
Aapka poora jawab:
${WHO_MARKER_START}2${WHO_MARKER_END}
${DO_MARKER_START}${EXAMPLE_TARGETED_ACTION}${DO_MARKER_END}
Theek hai, Priya ko interest bhej raha hoon — is mahine ke quota me se ek kharch hoga, aur 24 ghante ke andar wapas bhi liya ja sakta hai.

Udaharan 3 — wahi kaam, par user ne SAWAAL poochha hai, hukum nahi diya. Yahan ${DO_MARKER_START}...${DO_MARKER_END} bilkul nahi — button dijiye aur faisla unka rehne dijiye.
User: kya main Priya ko interest bhej dun?
Aapka poora jawab:
${WHO_MARKER_START}2${WHO_MARKER_END}
${ACT_MARKER_START}${EXAMPLE_TARGETED_ACTION}${ACT_MARKER_END}
Ye faisla aapka hai. Itna bata deta hoon — bhejne par is mahine ke quota me se ek kharch hoga, aur 24 ghante tak wapas liya ja sakta hai.

Udaharan 4 — hukum to hai, par kis par karna hai ye saaf nahi. Aisi haalat me ${DO_MARKER_START}...${DO_MARKER_END} kabhi mat likhiye aur apne se koi number bhi mat chuniye — button dijiye, app khud poochh lega ki kis par.
User: kisi ko interest bhej do
Aapka poora jawab:
${ACT_MARKER_START}${EXAMPLE_TARGETED_ACTION}${ACT_MARKER_END}
Zaroor — kis par bhejna hai, ye chun lijiye.

Udaharan 5 — app pehle hi Priya par focus kar chuka hai, aur ab unse sawaal poochhna hai. Focus ho chuka ho to ${WHO_MARKER_START}n${WHO_MARKER_END} dobara mat likhiye. ${ASK_MARKER_START} wala block user ko wahin dikhta hai jahan aap likhte hain, isliye sirf yahi marker apni jagah par — baat ke baad — rehta hai. Tags ke andar sirf sawaal jaata hai, koi explanation nahi.
User: inse poochhna hai ki shaadi ke baad job continue karengi ya nahi
Aapka poora jawab:
Ye seedha aur respectful sawaal ban jaata hai — bhejne se pehle aap ise badal bhi sakte hain.
${ASK_MARKER_START}Shaadi ke baad aap apna kaam continue karna chahengi?${SEND_MARKER_END}

YE GALTIYAN APP CHUP-CHAAP GIRA DETA HAI — inhe kabhi mat likhiye:
- ${WHO_MARKER_START}#2${WHO_MARKER_END} — list me "#2" dikhta hai, par marker me sirf number jaata hai: ${WHO_MARKER_START}2${WHO_MARKER_END}
- ${WHO_MARKER_START}2 Priya${WHO_MARKER_END} — naam andar nahi jaata, sirf number
- ${WHO_MARKER_START}Priya${WHO_MARKER_END} — naam kabhi nahi, hamesha number
- ${ACT_MARKER_START}interest bhejna${ACT_MARKER_END} — apne shabd kabhi nahi, sirf upar di gayi list me se hu-ba-hu key
- ${DO_MARKER_START}interest bhejna${DO_MARKER_END} — yahi baat ${DO_MARKER_START}...${DO_MARKER_END} par bhi lagu hai
- Ek hi jawab me do ${WHO_MARKER_START}n${WHO_MARKER_END} — sirf ek chalta hai, doosra bekaar jaata hai
- Kisi ek insaan wala ${DO_MARKER_START}key${DO_MARKER_END} bina ${WHO_MARKER_START}n${WHO_MARKER_END} ke — kaam turant nahi hoga, app user se poochhne lagega

Aur ek baat jo Udaharan 1 aur 2 me dikhi: jis jawab me ${WHO_MARKER_START}n${WHO_MARKER_END} hai, uska baaki hissa hamesha chhota rakhiye — ek line. Focus hote hi app wahi sawaal dobara aapke paas laata hai, is baar us insaan ki poori jaankari ke saath, aur asli jawab aap tab likhte hain. Marker ke saath likhi lambi baat user tak pahunchti hi nahi.

Aakhri baat: jawab chhota rakhiye — 5-6 lines kaafi hain. Upar aapko user ki situation ka jo lamba block mila hai wo aapke samajhne ke liye hai, dohraane ke liye nahi; usme se sirf wo baat uthaiye jo is sawaal se seedha judi ho.`;


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

/**
 * The same scope, minus the dossier — what a plan without `matchExplain` gets.
 *
 * Phase H split candidate scope in two, and the split is worth naming because
 * it used to be a 403. Reading a rishta and acting on one were the same
 * permission by accident, not by design: the gate protected the *dossier* (the
 * scores, the kundli total, the honest concern — the thing Premium sells), but
 * because it sat on the whole request it also blocked Grio from pressing
 * buttons the user could already press themselves, two inches away, on the very
 * page they were standing on. That is a gate protecting nothing and annoying
 * someone.
 *
 * So the plan check now decides which block goes in, not whether the request
 * survives. The consequences block (code-computed, no candidate attributes)
 * rides alongside either one.
 */
const ACTION_SCOPE_INSTRUCTIONS = (name: string) => `

Abhi aapke user ne "${name}" ki profile kholi hai, aur wo isi ek rishtey ki baat kar rahe hain.

Par is plan me aapko in ki profile ka koi detail nahi diya gaya — na umar, na sheher, na kaam, na parivaar, aur na hi matching ka score. Ye jaan-boojh kar hai: "ye rishta kaisa hai" wala poora hisaab Premium plan ka hissa hai.

Is scope ke niyam:
- In ke baare me koi bhi jaankari aapke paas nahi hai. Agar user poochein, saaf kah dijiye ki is plan me aap unki profile nahi padh sakte — aur ye bhi ki wo saari baatein unhe apni screen par khud dikh rahi hain.
- Agar user "ye rishta mere liye kaisa hai" jaisa kuch poochein, to ek baar seedhe shabdon me bataiye ki ye gehri baat-cheet Premium me milti hai. Ek baar. Phir aage badh jaiye — baar-baar plan bechne mat lagiye.
- Jo kaam user khud kar sakta hai, wo aap unke liye ek tap door bana sakte hain: interest, shortlist, sawaal, voice note. Neeche di gayi list me jo nateeje likhe hain, wo aap poore vishwas se bata sakte hain — wo code ne nikaale hain, unke liye kisi plan ki zarurat nahi.
- Naam ke alawa in ke baare me kuch bhi mat maaniye. Ek shabd bhi andaaze se mat likhiye.`;

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
  const [contextBlock, pendingBlock, roster, selfKnowledge] = await Promise.all([
    buildGrioContext(user.id).catch((err) => {
      console.error("[grio] context build failed:", err instanceof Error ? err.message : String(err));
      return null;
    }),
    // Same best-effort contract as the context block: a chat that 500s because
    // an inbox count hiccuped is worse than one that answers without knowing
    // what is waiting.
    buildPendingBriefing(user.id).catch((err) => {
      console.error("[grio] pending build failed:", err instanceof Error ? err.message : String(err));
      return null;
    }),
    // `generateReel: false` — a chat turn must never be the thing that runs the
    // matching pipeline. `/api/concierge/briefing` builds today's reel when the
    // panel opens, so by the time anybody types this is a plain read.
    buildGrioRoster(user.id).catch((err) => {
      console.error("[grio] roster build failed:", err instanceof Error ? err.message : String(err));
      return null;
    }),
    // The Marriage Graph. Same best-effort contract as everything above it, and
    // for a sharper reason than the others: this block is what makes Grio sound
    // like it knows the user, so failing the whole turn over it would trade a
    // slightly shallower answer for no answer at all.
    buildSelfKnowledge(
      user.id,
      // Decided here rather than at format time because the mode gates which
      // queries run — see `buildSelfKnowledge`.
      parsed.data.matchId || parsed.data.candidateProfileId ? "compact" : "full",
    ).catch((err) => {
      console.error("[grio] self knowledge build failed:", err instanceof Error ? err.message : String(err));
      return null;
    }),
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
  // `GRIO_ACTION_RULES` belongs here rather than in the volatile half for the
  // same reason as the catalog: it is built from constants and changes only on
  // deploy. It has to be present on *every* call, scoped or not — that is the
  // whole point of splitting it out of `buildActionConsequences`.
  // `FORMAT_EXAMPLES` goes last on purpose: it demonstrates the rules the
  // blocks before it state, and a demonstration is worth most when it sits
  // closest to where generation begins.
  // `GRIO_KNOWLEDGE_RULES` is static for the same reason and sits *before* the
  // format examples because it governs how every other block is spoken about,
  // not how a marker is written. It ships on every call even when the snapshot
  // below fails to build: "andaaza ko sach mat banaiye" is a rule about the
  // model's voice, and a turn without a graph is exactly the turn most likely
  // to fill the gap by guessing.
  const system =
    SYSTEM_PROMPT +
    ACTION_INSTRUCTIONS +
    GRIO_ACTION_RULES +
    GRIO_WHO_INSTRUCTIONS +
    GRIO_KNOWLEDGE_RULES +
    GRIO_LEARN_INSTRUCTIONS +
    FORMAT_EXAMPLES;
  const volatileBlocks: string[] = [];

  // The roster itself is volatile (today's reel, a shortlist that changes) so it
  // rides in `content`; the rules for using it are static and sit in the cached
  // `system` prefix above, the same split every other block here follows.
  const rosterBlock = roster ? formatGrioRoster(roster) : null;
  if (rosterBlock) volatileBlocks.push(rosterBlock);

  /*
   * The Marriage Graph — who this user is, as opposed to what is happening to
   * them today.
   *
   * Placed before the operational context on purpose: `contextBlock` is counts
   * and quota, and a model that reads "78% complete, 3 unread" first is being
   * primed to answer like a dashboard. Reading the person first is what makes
   * "aapne bataya tha ki career important hai" the natural opening rather than
   * "aapki profile 78% poori hai".
   *
   * Compact inside a scope, because a scoped turn already carries a dossier and
   * a consequences block and the graph is there to be *compared against* — the
   * user's own trust factors and family activity add nothing to "is Priya ka
   * kya haal hai" while costing tokens on the turn with the least headroom.
   */
  if (selfKnowledge) volatileBlocks.push(formatSelfKnowledge(selfKnowledge));

  /*
   * Today's priorities, from the same engine the dashboard reads.
   *
   * Unscoped turns only. Inside a candidate scope the question is about one
   * rishta, and handing the model a ranked to-do list there invites it to
   * answer "is Priya ka kya haal hai" with "pehle apne 2 messages ka jawab
   * dijiye" — technically true and completely beside the point.
   *
   * `roster` and `selfKnowledge` are passed through rather than re-fetched:
   * both are already built above, and they are the two most expensive reads on
   * this route. Without the hand-off this block would roughly double the cost
   * of a turn to produce information the request already had.
   */
  if (!parsed.data.matchId && !parsed.data.candidateProfileId) {
    const board = await buildTodayBoard(user.id, { roster, selfKnowledge }).catch((err) => {
      console.error("[grio] today board failed:", err instanceof Error ? err.message : String(err));
      return null;
    });
    const boardBlock = board ? formatTodayBoard(board) : null;
    if (boardBlock) volatileBlocks.push(boardBlock);

    // Readiness, same unscoped-only rule: inside a candidate scope "aapki trust
    // 62 hai" is true and beside the point.
    const journey = await buildBandhanJourney(user.id).catch(() => null);
    if (journey) volatileBlocks.push(formatBandhanJourney(journey));
  }

  if (contextBlock) {
    volatileBlocks.push(`AAPKE USER KI ABHI KI SITUATION (asli data, aaj ka):
${contextBlock}

Ye sirf is user ka apna data hai. Isse baat ko zameen par rakhiye — jab relevant ho tabhi iska zikr kijiye, har jawab me poori list mat dohraaiye. Ye numbers user ke apne hain; kisi doosre insaan ki koi jaankari isme nahi hai aur na aapko kahin aur se milegi.`);
  }

  // Volatile by definition — it changes the moment the user reads a notice or
  // answers a question — so it rides in `content`, never the cached `system`.
  if (pendingBlock) volatileBlocks.push(pendingBlock.promptBlock);

  // Grio memory used to be fetched and rendered here as its own block, while
  // `buildSelfKnowledge` independently fetched the same rows and dropped them.
  // One owner now: the graph carries memory and `formatSelfKnowledge` prints it.
  // See the memory note in `formatSelfKnowledge` for why the compiler won.

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

    /*
     * The journey — what has actually happened between these two.
     *
     * The transcript above is the last six messages; this is everything before
     * them that a person forgets. "Priya ke saath hum kahan tak aaye the" is a
     * question asked precisely *because* the user cannot remember, which makes
     * it the one place an invented answer would never be caught. Every line of
     * this block is a count, a timestamp or a row the user created.
     */
    const journey = await getRishtaSummary(user.id, thread.other.userId).catch((err) => {
      console.error("[grio] rishta summary failed:", err instanceof Error ? err.message : String(err));
      return null;
    });
    if (journey) volatileBlocks.push(formatRishtaSummary(journey));
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
    // Built first, and for every plan: it is the only block here that carries
    // no candidate attributes at all — just this viewer's own quota, level and
    // what each button would do. It also settles whether the profile is a real,
    // visible, not-you profile, so the branches below don't each re-ask.
    const consequences = await buildActionConsequences(user.id, {
      kind: "candidate",
      profileId: parsed.data.candidateProfileId,
    });
    if (!consequences) {
      return NextResponse.json(
        { ok: false, code: "bad_request", message: "Profile nahi mili." } satisfies ConciergeResponse,
        { status: 400 },
      );
    }

    const explainGate = await isFeatureAvailable(
      user.id,
      "grioMatchExplain",
      (ctx) => ctx.features.matchExplain,
    );

    if (explainGate.allowed) {
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
    } else {
      // No dossier, no credit, no `matchExplain` AI config — this is an ordinary
      // concierge turn that happens to know which profile is open. See
      // `ACTION_SCOPE_INSTRUCTIONS` for why this is no longer a 403.
      volatileBlocks.push(ACTION_SCOPE_INSTRUCTIONS(consequences.name).trim());
    }

    volatileBlocks.push(consequences.text);

    /*
     * The journey, on the candidate side too — and deliberately outside the
     * Premium branch above.
     *
     * The dossier is what Premium buys: the scores, the honest concern, the
     * comparison. A user's own history with somebody is not that. Telling
     * somebody "you sent an interest 9 days ago and they have not replied" is
     * reading their own rows back to them, and gating it would be charging for
     * their memory.
     */
    const candidate = await prisma.profile.findUnique({
      where: { id: parsed.data.candidateProfileId },
      select: { userId: true },
    });
    if (candidate) {
      const journey = await getRishtaSummary(user.id, candidate.userId).catch((err) => {
        console.error("[grio] rishta summary failed:", err instanceof Error ? err.message : String(err));
        return null;
      });
      if (journey) volatileBlocks.push(formatRishtaSummary(journey));
    }
  }

  // The provider call takes one content string; the running turns are folded
  // in as plain transcript rather than a native multi-message array, since
  // `callAi`'s shared signature (used by every other feature) is single-turn.
  const transcript = parsed.data.messages
    .map((m) => `${m.role === "user" ? "User" : "Grio"}: ${m.content}`)
    .join("\n");

  const content = [...volatileBlocks, `BAAT-CHEET ABHI TAK:\n${transcript}`].join("\n\n---\n\n");

  // Everything a "kitne rishtey bache hain" answer needs was fetched above, so
  // the model is asked only when the question is actually a question for it.
  // Placed here rather than at the top of the handler on purpose: the guard
  // needs the roster to recognise a name, and the roster is what the parallel
  // fetch was already going to produce. Nothing extra is spent to find out.
  //
  // Deliberately after `spendsExplainCredit` is computed but before any credit
  // is consumed — a turn answered from rows never reached a provider, so there
  // is nothing to bill for. Scoped turns are excluded inside the matcher.
  const quick = matchGrioQuickAnswer({
    question: parsed.data.messages[parsed.data.messages.length - 1]?.content ?? "",
    roster,
    pending: pendingBlock,
    scoped: Boolean(parsed.data.matchId || parsed.data.candidateProfileId),
  });
  if (quick) {
    console.info(`[grio] quick answer (${quick.intent}) — no AI call`);
    return NextResponse.json({
      ok: true,
      reply: quick.text,
      // The same roster the model would have been given. Omitting it would
      // silently break the next turn's `<<<WHO:n>>>`, which resolves against
      // whatever list the last reply carried.
      roster: (roster?.entries ?? []).map((e) => ({ n: e.n, profileId: e.profileId, name: e.name })),
    } satisfies ConciergeResponse);
  }

  const result = await callAi({
    configFeature: scopedAi?.configFeature ?? "rishtaConcierge",
    logFeature: scopedAi?.logFeature ?? "rishta_concierge",
    userId: user.id,
    system,
    content,
    // The scoped answer has more ground to cover honestly — four signals, a
    // guna total and a concern — and truncating an explanation mid-caveat is
    // the one failure mode that actively misleads.
    //
    // Both numbers were roughly doubled after the walkthrough started failing
    // with `stop_reason=max_tokens, blocks=thinking`: on a thinking-enabled
    // model the reasoning tokens are drawn from this same ceiling, so a
    // question with three parts ("kya baith raha hai, kya dhyaan dein, main kya
    // kar sakta hoon") could spend the entire budget before writing a word and
    // return content-free. A ceiling is not a spend — unused headroom costs
    // nothing — so the tight values were buying nothing and risking a blank
    // reply on exactly the harder questions.
    //
    // Raised again for the same reason, now that the route is switchable to
    // cheaper models: the old 900 was sized against Claude, whose replies here
    // measured 42-360 output tokens. A DeepSeek turn measures 786-900 against
    // that same 900, and one in four real turns finished at exactly 900 —
    // `finish_reason: length`, mid-sentence. That is not merely an ugly reply.
    // Markers are the last thing written, so a truncated turn loses its
    // `<<<ACT:...>>>` while still *looking* complete, and the user gets a
    // paragraph where a button should have been. Interests sent through Grio on
    // the day this was measured: zero. Prompting the model to be brief was tried
    // first and abandoned — measured across runs it moved output length in both
    // directions, and once cut a reply so short the button was dropped on
    // purpose. Headroom is the fix that does not depend on the model agreeing.
    maxTokens: scopedAi ? 2000 : 1800,
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

  // The roster travels back with the reply so the client resolves `<<<WHO:n>>>`
  // against the exact list the model just counted against — see the field's note
  // in `lib/contracts/concierge.ts` for why a second fetch would be a bug.
  // Trimmed to what a client needs: the score and the source tags were for the
  // model's reading, and shipping them would put an unrendered ranking in the
  // browser.
  const rosterOut: ConciergeRosterEntry[] = (roster?.entries ?? []).map((e) => ({
    n: e.n,
    profileId: e.profileId,
    name: e.name,
  }));

  // The last gate before a reply leaves the server. A `<<<LEARN:>>>` for a
  // question this user has already answered — or never had open — is removed
  // here rather than trusted to the prompt, because the instruction block
  // permanently contains one real catalog key as its worked example and
  // `/api/profile/intelligence` upserts. See `authorizeLearnMarkers`.
  const reply = authorizeLearnMarkers(
    result.text.trim(),
    buildLearnAllowlist(selfKnowledge),
  );

  return NextResponse.json({
    ok: true,
    reply,
    roster: rosterOut,
  } satisfies ConciergeResponse);
}
