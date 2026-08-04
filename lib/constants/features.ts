/**
 * The engagement layer's feature catalog.
 *
 * Same shape and spirit as lib/ai/models.ts: the *catalog* is code (so a key
 * can never exist without a label and a sane default), while the *live state*
 * is a DB row an admin edits from /admin/features with no redeploy.
 *
 * Why a flag layer at all, given D-11's plan ladder already exists: the ladder
 * answers "what does this tier include", which is a pricing question and is
 * locked. A flag answers "is this thing switched on right now, and for whom",
 * which is an operations question — piloting a feature with ten users, opening
 * everything during a launch week, or killing something at 2am. Mixing the two
 * would mean editing pricing to run a pilot.
 */
import type { FeatureRollout } from "@prisma/client";

export const FEATURE_KEYS = [
  "voiceNotes",
  "quests",
  "vibeHub",
  "mindsetArena",
  "askBridge",
  "parentBlessing",
  "boost",
  "deepReport",
  "ghostingNudge",
  "payments",
  "aiConcierge",
  "deepProfileMatchShare",
  "seriousCircle",
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

export interface FeatureDef {
  label: string;
  description: string;
  /**
   * Where this feature sits in the build. `false` means the UI does not exist
   * yet, so any rollout other than OFF is a no-op — the admin page says so
   * plainly rather than letting someone flip a switch and wonder why nothing
   * happened.
   */
  built: boolean;
  /** Used when no FeatureFlag row exists yet. Unbuilt features default OFF. */
  defaultRollout: FeatureRollout;
}

export const FEATURES: Record<FeatureKey, FeatureDef> = {
  voiceNotes: {
    label: "Voice Notes",
    description:
      "10-second clip kisi candidate ko bhejna, aur receiver ke liye locked teaser. " +
      "Bhejna sabke liye khula hai (Interest quota se jaata hai) — kholna plan par depend karta hai.",
    built: true,
    // PLAN_GATED with no predicate at the send path, which means everyone can
    // send. That is deliberate: a free user's note is what lands in a second
    // user's inbox as a locked teaser. The paid half is `voiceUnlock`.
    defaultRollout: "PLAN_GATED",
  },
  quests: {
    label: "AI Match Quests",
    description: "Roz ke chhote missions jinke badle reward milta hai. Abhi 2 quests hain, dono voice note par.",
    built: true,
    defaultRollout: "PLAN_GATED",
  },
  vibeHub: {
    label: "Vibe Hub (daily sawaal)",
    description: "Roz ek sawaal jo profile ko bina form bhare gehra karta hai.",
    built: true,
    defaultRollout: "PLAN_GATED",
  },
  mindsetArena: {
    label: "Mindset Arena (polls)",
    description: "Public polls, vibe badges, aur same-vote leads.",
    // Badges + same-vote leads (C4/C5) aren't built yet — only the poll
    // itself (C3) and the streak (C6). Label stays as the eventual full
    // feature name; this flag just gates what exists today.
    built: true,
    defaultRollout: "PLAN_GATED",
  },
  askBridge: {
    label: "Ask AI to Ask",
    description: "Candidate se ek sawaal poochhna jiska jawab wo voice me deta hai.",
    built: true,
    // Same PLAN_GATED default as voiceNotes: asking is deliberately open to
    // everyone (that's the growth loop), the paid half is unlocking the
    // received answer — which voiceUnlock/VOICE_UNLOCK already gate.
    defaultRollout: "PLAN_GATED",
  },
  parentBlessing: {
    label: "Parent Voice Blessing",
    description: "Parent ka 10-second clip profile par, verification ke baad.",
    built: true,
    defaultRollout: "PLAN_GATED",
  },
  boost: {
    label: "Profile Boost",
    description: "24 ghante ke liye ranking me bounded boost.",
    // Live via M5 (subscription capture → Profile.boostActiveUntil, bounded
    // +15% in pipeline.ts). Not actually gated through this FeatureFlag layer
    // — boost is driven directly off the subscription/plan, same as chat —
    // so this entry is display-accuracy only, not a working kill switch.
    built: true,
    defaultRollout: "ALL",
  },
  deepReport: {
    label: "Deep Compatibility Report",
    description: "13 dimensions ka analysis + family ke liye PDF.",
    built: true,
    defaultRollout: "PLAN_GATED",
  },
  ghostingNudge: {
    label: "Ghosting Shield",
    description: "Thandi pad chuki chat me ek relevant nudge.",
    built: true,
    defaultRollout: "PLAN_GATED",
  },
  payments: {
    label: "Payments (Razorpay)",
    description: "Checkout aur subscription. Keys aane tak dummy gateway par chalta hai.",
    // Live via Phase M — DummyGateway end-to-end, RazorpayGateway wired and
    // waiting on real keys. Also not gated through this FeatureFlag layer;
    // checkout is reachable unconditionally once a plan is chosen.
    built: true,
    defaultRollout: "ALL",
  },
  aiConcierge: {
    label: "AI Rishta Concierge",
    description: "General matchmaking guidance chat — kisi ek profile se juda nahi. Paid plans ke liye.",
    built: true,
    defaultRollout: "PLAN_GATED",
  },
  deepProfileMatchShare: {
    label: "Deep Profile — Match ko Dikhana",
    description: "Owner ke opt-in ke baad, mutual match hone par Premium viewer apna match ka Deep Profile dekh sakta hai.",
    built: true,
    defaultRollout: "PLAN_GATED",
  },
  seriousCircle: {
    label: "Serious Circle",
    description:
      "Hafte me do baar (Budhwaar/Ravivaar, 8–10 PM) live event. Entry plan se nahi, gates se — profile complete, " +
      "verified, ek family member juda hua, aur shaadi ka samay declared. Attend karne par 'Shaadi Ready' badge.",
    built: true,
    // ALL, not PLAN_GATED, and deliberately so at launch: the event's value is
    // entirely a function of how many serious people are in the room, and a
    // paywall on entry guarantees an empty first event. The gates already do
    // the filtering a plan gate would do, and better — they filter on
    // commitment rather than on wallet. Once a single event reliably fills,
    // this flips to PLAN_GATED and payment becomes the seriousness proof.
    defaultRollout: "ALL",
  },
};

export const FEATURE_ROLLOUT_LABELS: Record<FeatureRollout, string> = {
  OFF: "Band — kisi ke liye nahi",
  ALLOWLIST: "Sirf chosen users (admin override waale)",
  PLAN_GATED: "Normal — plan ladder decide karega",
  ALL: "Sabke liye khula (plan chahe koi bhi ho)",
};

export function isFeatureKey(value: string): value is FeatureKey {
  return (FEATURE_KEYS as readonly string[]).includes(value);
}
