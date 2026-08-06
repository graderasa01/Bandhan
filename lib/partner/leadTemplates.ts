import type { LeadStatus } from "@/lib/contracts/partner";

/**
 * The follow-up copy a partner sends a lead — one definition, three consumers.
 *
 * These strings used to live inside `LeadRow.tsx`, which was fine while the
 * only way to send one was the partner tapping a `wa.me` link on their own
 * phone. There are now three senders: that same self-send link, the
 * server-side "BandhanTak se bhejein" button, and the automated nudge job. A
 * lead who gets a WhatsApp today and an email next week should recognise the
 * same voice in both, and that only holds if there is one source for it.
 *
 * Still deterministic templates, never AI-generated — same reason
 * `buildInsight()` in lib/data/partnerData.ts is: a partner is putting their
 * own name at the bottom of this message, so they have to be able to predict
 * exactly what it says before they press send.
 *
 * Client-safe on purpose (no `server-only`, no Prisma): `LeadRow` imports it
 * straight into the browser bundle for the self-send link.
 */

export type LeadTemplateContext = {
  firstName: string;
  partnerName: string;
  /** Origin only — each template appends its own path. */
  appUrl: string;
};

export type LeadTemplate = {
  /** Stable across copy edits — this is the dedupe key the nudge job counts on. */
  key: string;
  /** What the partner sees on the button. */
  label: string;
  /** Whether the nudge job may send this one unattended. */
  automated: boolean;
  /** Don't send the same key to the same lead again inside this window. */
  cooldownDays: number;
  whatsapp: (ctx: LeadTemplateContext) => string;
  email: (ctx: LeadTemplateContext) => { subject: string; body: string };
};

/** Every template signs off with the partner's name — the lead knows them, not us. */
function sign(partnerName: string): string {
  return `\n\n- ${partnerName}\n(BandhanTak ke through bheja gaya)`;
}

const PROFILE_START: LeadTemplate = {
  key: "profile_start",
  label: "Profile shuru karne ko kahein",
  automated: true,
  cooldownDays: 7,
  whatsapp: ({ firstName, partnerName, appUrl }) =>
    `Namaste ${firstName} ji 🙏\nAapka BandhanTak account ban gaya hai, lekin profile abhi khaali hai. Sirf 5 minute lagenge — uske baad hi aapko rishte dikhna shuru honge.\n\n${appUrl}/user/profile${sign(partnerName)}`,
  email: ({ firstName, partnerName, appUrl }) => ({
    subject: `${firstName} ji, aapki BandhanTak profile abhi adhoori hai`,
    body: `Namaste ${firstName} ji,\n\nAapka BandhanTak account to ban gaya hai, lekin profile abhi bhari nahi gayi. Jab tak profile nahi bharti, aapko rishte dikhna shuru nahi honge.\n\nSirf 5 minute ka kaam hai:\n${appUrl}/user/profile${sign(partnerName)}`,
  }),
};

const PROFILE_FINISH: LeadTemplate = {
  key: "profile_finish",
  label: "Profile poori karne ko kahein",
  automated: true,
  cooldownDays: 7,
  whatsapp: ({ firstName, partnerName, appUrl }) =>
    `Namaste ${firstName} ji 🙏\nBandhanTak par aapki profile dekhi — bas thodi si baaki hai. Ek baar poori kar lijiye, profile jitni poori hogi utne acche rishte milenge.\n\n${appUrl}/user/profile${sign(partnerName)}`,
  email: ({ firstName, partnerName, appUrl }) => ({
    subject: `${firstName} ji, bas thodi si profile baaki hai`,
    body: `Namaste ${firstName} ji,\n\nAapki BandhanTak profile ka kaafi hissa ban chuka hai — bas thoda sa baaki hai. Poori profile wale logon ko kaafi zyada aur behtar rishte dikhte hain.\n\nYahan se poori kar lijiye:\n${appUrl}/user/profile${sign(partnerName)}`,
  }),
};

const PLAN_NUDGE: LeadTemplate = {
  key: "plan_nudge",
  label: "Plan lene ko kahein",
  automated: true,
  cooldownDays: 14,
  whatsapp: ({ firstName, partnerName, appUrl }) =>
    `Namaste ${firstName} ji 🙏\nAapki profile complete ho gayi hai, bahut achha! Ab plan lekar matches dekhna aur baat karna shuru kar sakte hain.\n\n${appUrl}/pricing${sign(partnerName)}`,
  email: ({ firstName, partnerName, appUrl }) => ({
    subject: `${firstName} ji, aapki profile taiyaar hai — ab rishte dekhiye`,
    body: `Namaste ${firstName} ji,\n\nAapki BandhanTak profile poori ho chuki hai. Ab aap plan lekar apne matches dekh sakte hain aur unse baat shuru kar sakte hain.\n\nPlans yahan hain:\n${appUrl}/pricing${sign(partnerName)}`,
  }),
};

const WIN_BACK: LeadTemplate = {
  key: "win_back",
  label: "Wapas bulayein",
  automated: true,
  /** The longest cooldown here on purpose — a monthly nudge to someone who
   *  already went quiet is a reminder; a weekly one is harassment. */
  cooldownDays: 30,
  whatsapp: ({ firstName, partnerName, appUrl }) =>
    `Namaste ${firstName} ji 🙏\nKaafi din se aapko BandhanTak par nahi dekha. Aapke jaise profile ke liye kaafi naye rishte aaye hain — ek baar dekh lijiye.\n\n${appUrl}/user/dashboard${sign(partnerName)}`,
  email: ({ firstName, partnerName, appUrl }) => ({
    subject: `${firstName} ji, aapke liye naye rishte aaye hain`,
    body: `Namaste ${firstName} ji,\n\nKaafi din se aapko BandhanTak par nahi dekha. Is beech aapki pasand se milte-julte kaafi naye profile jude hain.\n\nEk baar dekh lijiye:\n${appUrl}/user/dashboard${sign(partnerName)}`,
  }),
};

/**
 * Manual-only, deliberately. Everything above is a nudge toward something the
 * lead already started; this one asks a favour. That is a judgement call about
 * a real relationship the partner has and we don't — so it needs a human to
 * decide the moment, not a cron schedule.
 */
const REFER_BACK: LeadTemplate = {
  key: "refer_back",
  label: "Dhanyavaad + aur rishte poochein",
  automated: false,
  cooldownDays: 90,
  whatsapp: ({ firstName, partnerName, appUrl }) =>
    `Namaste ${firstName} ji 🙏\nAapka plan shuru ho gaya hai — shubhkamnayein! Umeed hai jaldi achha rishta mile.\n\nAgar aapke jaan-pehchaan me kisi aur ko rishte ki talash ho, to unhe bhi bata dijiyega:\n${appUrl}${sign(partnerName)}`,
  email: ({ firstName, partnerName, appUrl }) => ({
    subject: `${firstName} ji, shubhkamnayein 🙏`,
    body: `Namaste ${firstName} ji,\n\nAapka BandhanTak plan shuru ho gaya hai. Umeed hai aapko jaldi hi achha rishta mile.\n\nAgar aapke jaan-pehchaan me kisi aur ko rishte ki talash ho, to unhe bhi BandhanTak ke baare me bata dijiyega:\n${appUrl}${sign(partnerName)}`,
  }),
};

/**
 * One template per lead status. `PAID` maps to the thank-you rather than to
 * nothing, because a converted lead is the best referral source a partner has
 * and there was previously no way to say anything to them at all.
 */
export const LEAD_TEMPLATE_BY_STATUS: Record<LeadStatus, LeadTemplate> = {
  JOINED: PROFILE_START,
  PROFILE_STARTED: PROFILE_FINISH,
  PROFILE_DONE: PLAN_NUDGE,
  INACTIVE: WIN_BACK,
  PAID: REFER_BACK,
};

export const LEAD_TEMPLATES: LeadTemplate[] = [
  PROFILE_START,
  PROFILE_FINISH,
  PLAN_NUDGE,
  WIN_BACK,
  REFER_BACK,
];

export function templateForStatus(status: LeadStatus): LeadTemplate {
  return LEAD_TEMPLATE_BY_STATUS[status];
}
