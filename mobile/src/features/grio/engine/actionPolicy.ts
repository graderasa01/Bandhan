import { GRIO_ACTIONS, type GrioActionCall, type GrioActionKey, type GrioActionSpec } from "~/shared/grio/grio";
import { appTargetFor, type AppTarget } from "~/utils/webRoutes";
import type { GrioTarget } from "./types";

/**
 * How the app carries out each row of the web's action catalog (`GRIO_ACTIONS`,
 * vendored from lib/contracts/grio.ts). The catalog says *what* a row is — its
 * label, its endpoint, whether it lands on a person. This file says only how
 * far the app lets it go without the member's finger, and it is typed against
 * the catalog: a row added on the web that is not classified here fails the
 * app's typecheck instead of shipping as an unknown button.
 *
 *   navigate     a link to a screen the member can already reach. Runs when the
 *                member asked for it (`<<<DO:>>>`), a chip otherwise. A page the
 *                app has no screen for opens the website — and only on a tap,
 *                never by itself.
 *   private      reversible, and nobody else ever learns of it (the shortlist).
 *                Runs on an explicit ask, on a person code resolved, with Undo.
 *   social       reaches another person (an interest). Always the confirm sheet
 *                naming them — a spoken or typed "bhej do" opens it, it does not
 *                skip it.
 *   self         spends a credit, pings a human team, or runs a heavy analysis.
 *                Always the confirm sheet.
 *   unavailable  a recorder or form the app does not have yet (voice note,
 *                today's poll, rishta notes). Said plainly, with where it can be
 *                done — never pretended.
 *   memory       `remember`: saved as the web saves it, shown with Undo.
 *
 * Payment, plan changes, deletion and unlocking photos or contacts are not in
 * the catalog at all, so there is nothing here to classify for them — the model
 * cannot propose them in any tier.
 */

export type GrioTier = "navigate" | "private" | "social" | "self" | "unavailable" | "memory";

export interface GrioMobilePolicy {
  tier: GrioTier;
  /** private — the call that takes it back. */
  undo?: (profileId: string) => GrioActionCall;
  /** unavailable — the website page where it can be done; `{profileId}` is filled from the person. */
  website?: string;
}

export const GRIO_MOBILE_POLICY = {
  openProfileSetup: { tier: "navigate" },
  openReel: { tier: "navigate" },
  openInbox: { tier: "navigate" },
  openMatches: { tier: "navigate" },
  openShortlist: { tier: "navigate" },
  openDeepProfile: { tier: "navigate" },
  openVibe: { tier: "navigate" },
  openBiodata: { tier: "navigate" },
  openCircle: { tier: "navigate" },
  openSubscription: { tier: "navigate" },
  openBoost: { tier: "navigate" },
  openKundli: { tier: "navigate" },
  openFamily: { tier: "navigate" },
  openInterests: { tier: "navigate" },
  openAdvancedDiscovery: { tier: "navigate" },
  openContactVerification: { tier: "navigate" },

  analyzeDeepProfile: { tier: "self" },
  requestMatchmaker: { tier: "self" },
  activateBoost: { tier: "self" },

  shortlistProfile: {
    tier: "private",
    undo: (profileId) => ({ url: `/api/shortlist/${encodeURIComponent(profileId)}`, method: "DELETE" }),
  },
  sendInterestToProfile: { tier: "social" },

  sendVoiceNote: { tier: "unavailable", website: "/user/profile/{profileId}" },
  answerPendingQuestion: { tier: "unavailable", website: "/user/inbox" },
  answerTodayPoll: { tier: "unavailable", website: "/user/vibe" },
  saveRishtaReflection: { tier: "unavailable", website: "/user/profile/{profileId}" },
  addRishtaMeeting: { tier: "unavailable", website: "/user/profile/{profileId}" },
  markRishtaTopicResolved: { tier: "unavailable", website: "/user/profile/{profileId}" },

  remember: { tier: "memory" },
} as const satisfies Record<GrioActionKey, GrioMobilePolicy>;

export function specOf(key: GrioActionKey): GrioActionSpec {
  // Widened like every read of the catalog on the web: each row's literal type
  // only carries the optional fields it actually sets.
  return GRIO_ACTIONS[key] as GrioActionSpec;
}

export function policyOf(key: GrioActionKey): GrioMobilePolicy {
  return GRIO_MOBILE_POLICY[key] as GrioMobilePolicy;
}

/** The button's words — always the catalog's, never the model's. */
export function labelOf(key: GrioActionKey): string {
  return specOf(key).label;
}

/** Whether the row lands on one person, and so needs a target code produced. */
export function needsTarget(key: GrioActionKey): boolean {
  return specOf(key).needs === "profile";
}

/**
 * Where a `navigate` row goes, through the app's one web-path translator — so a
 * catalog `href` the app has a screen for opens that screen, and anything else
 * is the website.
 */
export function navTargetOf(key: GrioActionKey): AppTarget | null {
  const spec = specOf(key);
  if (spec.kind !== "nav" || !spec.href) return null;
  return appTargetFor(spec.href);
}

/**
 * The request a catalog row makes — built exactly as the web's `runGrioAction`
 * builds it: a targeted row from its own `request(profileId)` with an id code
 * supplied, a self row from its `endpoint`. Null when there is nothing safe to
 * call (a targeted row with no target, a row with no endpoint).
 */
export function callFor(key: GrioActionKey, target: GrioTarget | null): GrioActionCall | null {
  const spec = specOf(key);
  if (spec.needs) {
    if (!target || !spec.request) return null;
    return spec.request(target.profileId);
  }
  if (!spec.endpoint) return null;
  return { url: spec.endpoint, method: "POST" };
}

/** The website page for an `unavailable` row, with the person filled in. */
export function websiteFor(key: GrioActionKey, target: GrioTarget | null): string | null {
  const path = policyOf(key).website;
  if (!path) return null;
  if (path.includes("{profileId}")) {
    return target ? path.replace("{profileId}", encodeURIComponent(target.profileId)) : null;
  }
  return path;
}
