/** M01X — Match discovery & interest contracts */
import type { MockMeta, EmptyStateModel } from "./common";
import type { MatchPreviewViewModel } from "./userDashboard";

/**
 * `id` is the Match row's id (it keys the chat thread); `profileId` is what the
 * profile page needs. Both are carried because a match card links to two
 * different places.
 *
 * `photoUrl` is unconditional here on purpose: a MatchCard only exists when a
 * Match does, which is precisely the condition the consent gate tests for.
 */
export type MatchCardViewModel = MatchPreviewViewModel & {
  compatibility?: number | null;
  matchReason?: string;
  profileId?: string;
  photoUrl?: string | null;
};

export type InterestViewModel = {
  id: string; fromUser: { displayName: string; age?: number; city?: string }; toUser: { displayName: string; age?: number; city?: string };
  status: "SENT" | "RECEIVED" | "ACCEPTED" | "DECLINED"; sentDate: string; message?: string;
  /** The other side's profile — lets an interest row open the person it's about. */
  profileId?: string;
};

export type MatchesViewModel = {
  meta: MockMeta; matches: MatchCardViewModel[]; emptyState: EmptyStateModel;
};

export type InterestsViewModel = {
  meta: MockMeta; received: InterestViewModel[]; sent: InterestViewModel[];
  emptyReceived: EmptyStateModel; emptySent: EmptyStateModel;
};
