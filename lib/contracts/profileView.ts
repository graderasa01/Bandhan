/** Rishta Profile page — the candidate view a viewer gets at L1/L2/L3. */

import type { KundliNote } from "@/lib/services/kundli/kundliService";
import type { ProfileVisibilityLevel } from "@/lib/services/profile/visibility";
import type { ReelSlide } from "@/lib/contracts/reel";

export interface ProfileViewRow {
  label: string;
  value: string;
}

export interface ProfileViewSection {
  title: string;
  rows: ProfileViewRow[];
}

/**
 * What the *next* level would open, shown as an honest strip instead of a
 * teaser. It names real fields, never a count of "12 hidden details" — an
 * invented number is exactly the kind of thing this app doesn't do.
 */
export interface ProfileLockedHint {
  title: string;
  description: string;
}

export interface ProfileViewModel {
  profileId: string;
  displayName: string;
  age: number | null;
  city: string | null;
  /** "B.Tech · Software Engineer" — whichever halves exist. */
  headline: string | null;
  bio: string | null;

  photoUrl: string | null;
  /** Consent gate — true only at L3, exactly as the reel and shortlist do it. */
  photoUnlocked: boolean;
  /** 0..100 vertical focal point for `object-cover` crops — null = center (50). Same withheld-not-hidden rule as photoUrl. */
  photoFocalY: number | null;
  /** Owner-curated photo slides (Phase 2) — empty unless `photoUnlocked`, same rule as photoUrl. */
  slides: ReelSlide[];
  photoVerified: boolean;
  mobileVerified: boolean;
  trustScore: number | null;
  trustScoreLabel: string | null;

  level: ProfileVisibilityLevel;
  isSelf: boolean;
  sections: ProfileViewSection[];
  kundliNotes: KundliNote[];
  lockedHint: ProfileLockedHint | null;

  interestSent: boolean;
  interestReceived: boolean;
  matchId: string | null;
  shortlisted: boolean;

  /** Phase D — mirrors ReelCardViewModel.askedStatus; see profileQuestionService. */
  askedStatus: "NONE" | "PENDING" | "ANSWERED" | "DECLINED" | "EXPIRED";
  askBridgeEnabled: boolean;
}
