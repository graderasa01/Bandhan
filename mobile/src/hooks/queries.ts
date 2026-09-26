import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { chatService } from "~/services/chat";
import { interestsService } from "~/services/interests";
import { kundliService } from "~/services/kundli";
import { noticesService } from "~/services/notices";
import { profileService, type SaveInput } from "~/services/profile";
import { reelService, type SwipeInput } from "~/services/reel";
import { searchService, type SearchRequest } from "~/services/search";
import { useSession } from "~/store/session";
import type { GrioDataEvent } from "~/features/grio/engine/types";
import type { ReelLane, ReelViewModel } from "~/types/api";

/**
 * Every server read and write the screens use, in one place, with one set of
 * keys — so "what refreshes after I send an interest" is answered here, not
 * re-decided on every screen.
 */
export const qk = {
  me: ["me"] as const,
  reel: ["reel"] as const,
  lane: (lane: ReelLane) => ["lane", lane] as const,
  interests: ["interests"] as const,
  conversations: ["conversations"] as const,
  thread: (matchId: string) => ["thread", matchId] as const,
  /** What opening one locked chat would take — the web unlock card's quote. */
  chatUnlock: (matchId: string) => ["chat-unlock", matchId] as const,
  notices: ["notices"] as const,
  counts: ["counts"] as const,
  profile: (id: string) => ["profile", id] as const,
  search: (req: unknown) => ["search", req] as const,
  /** The faces under Grio's replies (`/api/grio/cards`) — keyed by the ids shown. */
  grioCards: (ids: readonly string[]) => ["grio-cards", ids.join(",")] as const,
  /** Guna milan with one person — `["kundli"]` is every one of them. */
  kundli: (profileId: string) => ["kundli", profileId] as const,
  myKundli: ["my-kundli"] as const,
  /** Meri List's five counts, fresh from the server. */
  lanes: ["lanes"] as const,
};

/** The profile fields a kundli (own chart, milan or the gotra/manglik notes) is built from. */
const KUNDLI_FIELDS = new Set(["dateOfBirth", "birthTime", "birthPlace", "gender", "gotra", "manglikStatus"]);

function signedIn() {
  return useSession.getState().status === "signedIn";
}

export function useMyProfile() {
  const status = useSession((s) => s.status);
  return useQuery({ queryKey: qk.me, queryFn: profileService.getMe, enabled: status === "signedIn", staleTime: 30_000 });
}

/** Today's deck. `enabled` lets Home skip it for a member whose profile is not live yet. */
export function useReel(enabled = true) {
  const status = useSession((s) => s.status);
  return useQuery({ queryKey: qk.reel, queryFn: reelService.getReel, enabled: enabled && status === "signedIn", staleTime: 5 * 60_000 });
}

export function useLane(lane: ReelLane, enabled = true) {
  return useQuery({ queryKey: qk.lane(lane), queryFn: () => reelService.library(lane, null), enabled: enabled && signedIn() });
}

/** A whole lane, page by page (`/api/reel/library`'s own cursor) — Meri List's screen. */
export function useLanePages(lane: ReelLane) {
  return useInfiniteQuery({
    queryKey: [...qk.lane(lane), "pages"],
    queryFn: ({ pageParam }) => reelService.library(lane, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: signedIn(),
  });
}

export function useInterests() {
  return useQuery({ queryKey: qk.interests, queryFn: interestsService.list, enabled: signedIn(), staleTime: 20_000 });
}

export function useConversations() {
  return useQuery({ queryKey: qk.conversations, queryFn: chatService.conversations, enabled: signedIn(), refetchInterval: 30_000 });
}

/** An open thread polls every few seconds — the realtime seam is `chatService`, not this hook. */
export function useThread(matchId: string) {
  return useQuery({ queryKey: qk.thread(matchId), queryFn: () => chatService.thread(matchId), refetchInterval: 5_000 });
}

/** Only asked while the chat is locked: price, a held free unlock, or why it cannot be opened. */
export function useChatUnlockQuote(matchId: string, enabled: boolean) {
  return useQuery({
    queryKey: qk.chatUnlock(matchId),
    queryFn: () => chatService.unlockQuote(matchId),
    enabled: enabled && signedIn(),
  });
}

export function useNotices() {
  return useQuery({ queryKey: qk.notices, queryFn: noticesService.list, enabled: signedIn() });
}

export function useCounts() {
  const status = useSession((s) => s.status);
  const user = useSession((s) => s.user);
  return useQuery({
    queryKey: qk.counts,
    queryFn: noticesService.counts,
    enabled: status === "signedIn" && user?.status === "ACTIVE",
    refetchInterval: 60_000,
    staleTime: 20_000,
  });
}

export function useProfile(profileId: string) {
  return useQuery({ queryKey: qk.profile(profileId), queryFn: () => profileService.getProfile(profileId) });
}

/** The 36-guna milan with one person, fetched only while the sheet asking for it is open. */
export function useKundliMilan(profileId: string | null, enabled = true) {
  return useQuery({
    queryKey: qk.kundli(profileId ?? ""),
    queryFn: () => kundliService.milan(profileId!),
    enabled: enabled && Boolean(profileId) && signedIn(),
    staleTime: 5 * 60_000,
  });
}

export function useMyKundli() {
  return useQuery({ queryKey: qk.myKundli, queryFn: kundliService.mine, enabled: signedIn(), staleTime: 60_000 });
}

/** Meri List's counts — asked when the list opens, so a like or save made since the deck arrived is counted. */
export function useLaneCounts(enabled: boolean) {
  return useQuery({ queryKey: qk.lanes, queryFn: reelService.laneCounts, enabled: enabled && signedIn(), staleTime: 0 });
}

export function useSearch(req: SearchRequest, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: qk.search(req),
    queryFn: ({ pageParam }) => searchService.search({ ...req, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled,
    staleTime: 60_000,
  });
}

/* ------------------------------------------------------------------ */
/* Writes                                                              */
/* ------------------------------------------------------------------ */

function patchReelCard(qc: QueryClient, profileId: string, patch: Partial<ReelViewModel["cards"][number]>) {
  qc.setQueryData<ReelViewModel>(qk.reel, (old) =>
    old ? { ...old, cards: old.cards.map((c) => (c.id === profileId ? { ...c, ...patch } : c)) } : old,
  );
}

/** Takes a person out of today's deck — after a block, nobody should meet them again on this screen. */
export function dropReelCard(qc: QueryClient, profileId: string) {
  qc.setQueryData<ReelViewModel>(qk.reel, (old) => (old ? { ...old, cards: old.cards.filter((c) => c.id !== profileId) } : old));
  void qc.invalidateQueries({ queryKey: ["lane"] });
  void qc.invalidateQueries({ queryKey: qk.lanes });
  void qc.invalidateQueries({ queryKey: qk.profile(profileId) });
  void qc.invalidateQueries({ queryKey: qk.interests });
  void qc.invalidateQueries({ queryKey: qk.conversations });
}

export function useSaveProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveInput) => profileService.save(input),
    onSuccess: (res, input) => {
      void qc.invalidateQueries({ queryKey: qk.me });
      if (res.justActivated || res.isLive) useSession.getState().markActive();
      if (res.justActivated) void qc.invalidateQueries({ queryKey: qk.reel });
      // A birth detail changed: every milan and the member's own chart are stale.
      if (Object.keys(input.values).some((k) => KUNDLI_FIELDS.has(k))) {
        void qc.invalidateQueries({ queryKey: ["kundli"] });
        void qc.invalidateQueries({ queryKey: qk.myKundli });
      }
    },
  });
}

export function useUploadPhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ uri, mimeType }: { uri: string; mimeType: string }) => profileService.uploadPhoto(uri, mimeType),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.me });
      void qc.invalidateQueries({ queryKey: qk.reel });
    },
  });
}

export function useDeletePhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (photoId: string) => profileService.deletePhoto(photoId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.me }),
  });
}

export function useMakePrimary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (photoId: string) => profileService.makePrimary(photoId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.me }),
  });
}

/** Send an interest from anywhere (a profile, a card). Resolves with `{ matched, matchId }`. */
export function useSendInterest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (profileId: string) => interestsService.send(profileId),
    onSuccess: (res, profileId) => {
      patchReelCard(qc, profileId, { interestSent: true, ...(res.matchId ? { matchId: res.matchId } : {}) });
      void qc.invalidateQueries({ queryKey: qk.interests });
      void qc.invalidateQueries({ queryKey: qk.profile(profileId) });
      void qc.invalidateQueries({ queryKey: qk.counts });
      if (res.matched) void qc.invalidateQueries({ queryKey: qk.conversations });
    },
  });
}

export function useRespondInterest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: "ACCEPTED" | "DECLINED" }) => interestsService.respond(id, status),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.interests });
      void qc.invalidateQueries({ queryKey: qk.counts });
      void qc.invalidateQueries({ queryKey: qk.conversations });
      void qc.invalidateQueries({ queryKey: qk.reel });
    },
  });
}

export function useWithdrawInterest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => interestsService.withdraw(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.interests });
      void qc.invalidateQueries({ queryKey: qk.reel });
    },
  });
}

/** A reel decision. The card is updated in place so the deck never re-renders from scratch. */
export function useSwipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SwipeInput) => reelService.swipe(input),
    onMutate: (input) => {
      if (input.direction === "DOWN") patchReelCard(qc, input.profileId, { shortlisted: true, lastDecision: "DOWN", seenBefore: true });
      if (input.direction === "LEFT") patchReelCard(qc, input.profileId, { lastDecision: "LEFT", seenBefore: true });
    },
    onSuccess: (res, input) => {
      if (input.direction === "RIGHT") {
        patchReelCard(qc, input.profileId, { interestSent: true, lastDecision: "RIGHT", seenBefore: true, ...(res.matchId ? { matchId: res.matchId } : {}) });
        void qc.invalidateQueries({ queryKey: qk.interests });
        void qc.invalidateQueries({ queryKey: qk.counts });
        void qc.invalidateQueries({ queryKey: ["lane"] });
        void qc.invalidateQueries({ queryKey: qk.lanes });
        if (res.matched) void qc.invalidateQueries({ queryKey: qk.conversations });
      }
    },
  });
}

export function useToggleLike() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ profileId, liked }: { profileId: string; liked: boolean }) => reelService.setLiked(profileId, liked),
    onMutate: ({ profileId, liked }) => patchReelCard(qc, profileId, { liked }),
    onError: (_e, { profileId, liked }) => patchReelCard(qc, profileId, { liked: !liked }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["lane"] });
      void qc.invalidateQueries({ queryKey: qk.lanes });
    },
  });
}

export function useToggleShortlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ profileId, on }: { profileId: string; on: boolean }) => reelService.setShortlisted(profileId, on),
    onMutate: ({ profileId, on }) => patchReelCard(qc, profileId, { shortlisted: on }),
    onError: (_e, { profileId, on }) => patchReelCard(qc, profileId, { shortlisted: !on }),
    onSettled: (_d, _e, { profileId }) => {
      void qc.invalidateQueries({ queryKey: ["lane"] });
      void qc.invalidateQueries({ queryKey: qk.lanes });
      void qc.invalidateQueries({ queryKey: qk.profile(profileId) });
    },
  });
}

export function useSendMessage(matchId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => chatService.send(matchId, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.thread(matchId) });
      void qc.invalidateQueries({ queryKey: qk.conversations });
    },
  });
}

export function useMarkNoticeRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => noticesService.markRead(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.notices });
      void qc.invalidateQueries({ queryKey: qk.counts });
    },
  });
}

/**
 * What a Grio action changed on the server — the same refreshes the screens'
 * own buttons trigger, so a shortlist or an interest made in Grio shows up on
 * the reel card, the Interests tab and the profile at once.
 */
export function refreshAfterGrio(qc: QueryClient, event: GrioDataEvent) {
  switch (event.kind) {
    case "interest":
      patchReelCard(qc, event.profileId, { interestSent: true, ...(event.matchId ? { matchId: event.matchId } : {}) });
      void qc.invalidateQueries({ queryKey: qk.interests });
      void qc.invalidateQueries({ queryKey: qk.profile(event.profileId) });
      void qc.invalidateQueries({ queryKey: qk.counts });
      void qc.invalidateQueries({ queryKey: ["lane"] });
      if (event.matched) void qc.invalidateQueries({ queryKey: qk.conversations });
      break;
    case "shortlist":
      patchReelCard(qc, event.profileId, { shortlisted: event.on });
      void qc.invalidateQueries({ queryKey: ["lane"] });
      void qc.invalidateQueries({ queryKey: qk.profile(event.profileId) });
      break;
    case "message":
      void qc.invalidateQueries({ queryKey: qk.thread(event.matchId) });
      void qc.invalidateQueries({ queryKey: qk.conversations });
      break;
    case "question":
      patchReelCard(qc, event.profileId, { askedStatus: "PENDING" });
      void qc.invalidateQueries({ queryKey: qk.profile(event.profileId) });
      break;
    case "self":
      void qc.invalidateQueries({ queryKey: qk.me });
      break;
  }
  // The cards under Grio's own replies carry the same flags (shortlisted, interest sent).
  void qc.invalidateQueries({ queryKey: ["grio-cards"] });
}

export function useMarkAllNoticesRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => noticesService.markAllRead(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.notices });
      void qc.invalidateQueries({ queryKey: qk.counts });
    },
  });
}
