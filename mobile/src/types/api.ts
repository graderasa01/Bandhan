/**
 * The BandhanTak API's response shapes, as the native app reads them.
 *
 * Mirrored by hand from the web app's contracts (the source file is named on
 * each block) — only the fields the app actually uses, and never widened: if
 * the server stops sending a field, TypeScript here is the place that should
 * start failing. The server is the authority on every value.
 */

/* ------------------------------------------------------------------ */
/* Auth — lib/contracts/auth.ts, lib/auth/dto.ts                        */
/* ------------------------------------------------------------------ */

export type Role = "USER" | "PARTNER" | "ADMIN" | "SUPPORT";
export type UserStatus = "INCOMPLETE" | "ACTIVE" | "BLOCKED" | "SUSPENDED" | "DELETED";

export interface UserDto {
  id: string;
  role: Role;
  status: UserStatus;
  full_name: string;
  mobile: string | null;
  email: string | null;
  mobile_verified_at: string | null;
  email_verified_at: string | null;
  last_login_at: string | null;
  created_at: string;
}

export interface SessionResponse {
  user: UserDto | null;
  landing: string | null;
  sessionToken?: string;
}

export interface LoginResponse {
  user: UserDto;
  landing: string;
  sessionToken?: string;
}

export interface OtpChannels {
  mobile: boolean;
  email: boolean;
}

export type OtpSendResponse =
  | { ok: true; masked: string; existingUser: boolean; expiresInSeconds: number; kind: "mobile" | "email" }
  | {
      ok: false;
      error: "invalid" | "not_configured" | "cooldown" | "rate_limited" | "provider_error" | "no_account";
      message: string;
      retryAfterSeconds?: number;
      existingUser?: boolean;
      kind?: "mobile" | "email";
      channels?: OtpChannels;
    };

export type OtpVerifyResponse =
  | { ok: true; loggedIn: true; user: UserDto; landing: string; sessionToken?: string }
  | { ok: true; loggedIn: false; proof: string; existingUser: boolean }
  | { ok: false; error: string; message: string; attemptsLeft?: number };

export type FillingFor = "self" | "son" | "daughter";

/** `/api/bolo/complete` — lib/services/bolo/completeService.ts */
export type CompleteAccountResponse =
  | {
      ok: true;
      live: boolean;
      landing: string;
      existingAccount: boolean;
      verified: boolean;
      missing: string[];
      hasPassword: boolean;
      sessionToken?: string;
    }
  | { ok: false; error: string; message: string; rejected?: Array<{ field: string; heard: string }> };

/* ------------------------------------------------------------------ */
/* Photo gate — lib/contracts/photoLock.ts                             */
/* ------------------------------------------------------------------ */

export type PhotoLock = "open" | "add_own_photo" | "match_only";

/* ------------------------------------------------------------------ */
/* Reel — lib/contracts/reel.ts                                        */
/* ------------------------------------------------------------------ */

export type ReelSwipeDirection = "LEFT" | "RIGHT" | "UP" | "DOWN";
export type PreferenceEvidenceState = "NOT_PROVIDED" | "PARTIAL" | "COMPARABLE";
export type KundliTone = "ok" | "info" | "caution";

export interface KundliNote {
  id: "gotra" | "manglik";
  tone: KundliTone;
  title: string;
  detail: string;
}

export interface ReelSlide {
  id: string;
  url: string;
  note: string | null;
  focalY: number | null;
}

export interface ReelRingSegment {
  key: string;
  label: string;
  value: number;
  color: string;
}

export interface WhyReason {
  text: string;
  kind: "fact" | "ai";
}

export interface WhyThisMatch {
  reasons: WhyReason[];
  valueConnection: string | null;
  unclear: string | null;
  starter: string | null;
}

export type CandidateFactGroup = "basic" | "family" | "lifestyle" | "expectation" | "background" | "private" | "bio";

export interface ReelFact {
  group: CandidateFactGroup;
  label: string;
  value: string;
}

export type ReelProfileGap = "family" | "about" | "expectations" | "values" | "lifestyle";

export interface ReelCard {
  id: string; // profileId
  displayName: string;
  age: number | null;
  city: string | null;
  education: string | null;
  profession: string | null;
  verified: boolean;
  mobileVerified: boolean;
  trustScore: number | null;
  photoUrl: string | null;
  photoUnlocked: boolean;
  photoLock: PhotoLock;
  spotlight: boolean;
  photoFocalY: number | null;
  slides: ReelSlide[];
  bioNote: string | null;
  voiceNote: { mediaId: string; seconds: number } | null;
  nearby: boolean;
  seenBefore: boolean;
  lastDecision: "LEFT" | "RIGHT" | "DOWN" | null;
  matchId: string | null;
  rankScore: number | null;
  segments: ReelRingSegment[];
  preference: { state: PreferenceEvidenceState; score: number | null; note: string | null };
  strengths: string[];
  concern: string | null;
  sharedTags: string[];
  liked: boolean;
  shortlisted: boolean;
  interestSent: boolean;
  completeness: { percent: number; gaps: ReelProfileGap[] };
  kundli: {
    milan: { total: number; max: 36; band: string; tone: KundliTone; headline: string } | null;
    note: string | null;
    notes: KundliNote[];
  };
  mission: { headline: string; suggestion: string } | null;
  vibeBadge: { label: string; description: string } | null;
  askedStatus: "NONE" | "PENDING" | "ANSWERED" | "DECLINED" | "EXPIRED";
  whyThisMatch: WhyThisMatch;
  facts: ReelFact[];
}

export interface ReelRefineQuestion {
  key: string;
  question: string;
  options: string[];
  multi: boolean;
}

export interface ReelViewer {
  name: string;
  photoUrl: string | null;
  needsOwnPhoto: boolean;
  photoInReview: boolean;
  canPhotoEnhance: boolean;
  canPhotoUltraEnhance: boolean;
  city: string | null;
}

export type ReelLane = "VIEWED" | "LIKED" | "SHORTLIST" | "INTEREST" | "MESSAGE";
export type ReelLaneCounts = Record<ReelLane, number>;

export interface ReelViewModel {
  reelId: string;
  reelDate: string;
  cards: ReelCard[];
  seenCursor: string | null;
  viewer: ReelViewer;
  laneCounts: ReelLaneCounts;
  refineQuestions: ReelRefineQuestion[];
  preferenceNotice: {
    state: "NOT_PROVIDED" | "PARTIAL";
    title: string;
    body: string;
    ctaLabel: string;
    ctaHref: string;
  } | null;
  todayDecisions: { seen: number; sent: number; shortlisted: number };
  emptyState: { title: string; description: string } | null;
  unreadMessages: number;
  profileGaps: string[];
  feedQuestions: ReelRefineQuestion[];
  voiceEnabled: boolean;
  askBridgeEnabled: boolean;
  voiceQuest: { title: string; rewardLabel: string } | null;
}

export interface ReelMoreResponse {
  ok: boolean;
  cards: ReelCard[];
  exhausted: boolean;
  seenCursor?: string | null;
  message?: string;
}

export type ReelLibraryCard = ReelCard & { laneNote: string };

export interface ReelLibraryPage {
  ok: boolean;
  lane: ReelLane;
  cards: ReelLibraryCard[];
  nextCursor: string | null;
  total: number;
  message?: string;
}

export interface SwipeResponse {
  ok: boolean;
  matched: boolean;
  matchId: string | null;
}

export interface ReelIcebreakerResponse {
  ok: boolean;
  suggestion?: string;
  code?: "not_configured" | "upstream_error" | "bad_request";
  message?: string;
}

/* ------------------------------------------------------------------ */
/* Kundli — lib/contracts/kundli.ts                                    */
/* The other person's birth date, time or place is never in any of     */
/* these — only the conclusions (rashi, nakshatra, the koota scores).  */
/* ------------------------------------------------------------------ */

export interface KootaResult {
  key: "varna" | "vashya" | "tara" | "yoni" | "grahaMaitri" | "gana" | "bhakoot" | "nadi";
  label: string;
  score: number;
  max: number;
  boyValue: string;
  girlValue: string;
  meaning: string;
  verdict: string;
  tone: KundliTone;
}

export interface GunaMilan {
  total: number;
  max: 36;
  kootas: KootaResult[];
  band: string;
  bandTone: KundliTone;
  headline: string;
  dosha: Array<{ key: "nadi" | "bhakoot"; title: string; detail: string }>;
  boy: { rashiName: string; nakshatraName: string };
  girl: { rashiName: string; nakshatraName: string };
}

export interface KundliMatchView {
  notes: KundliNote[];
  milan: GunaMilan | null;
  /** Why milan is absent — a prompt, not an error. */
  milanBlockedReason: "viewer-missing-dob" | "candidate-missing-dob" | "same-gender" | null;
}

/** `GET /api/kundli/milan/:profileId`. */
export interface KundliMilanResponse {
  ok: boolean;
  message?: string;
  name?: string;
  view?: KundliMatchView;
  /** The viewer's own birth time was missing — the only side they can fix. */
  viewerAssumed?: boolean;
  /** Either side's Moon came from local noon, so the total is not final. */
  approximate?: boolean;
}

export interface KundliGraha {
  graha: string;
  longitude: number;
  rashi: number;
  rashiName: string;
  degreeInRashi: number;
  nakshatra: number;
  nakshatraName: string;
  pada: number;
  bhava: number | null;
  retrograde: boolean;
}

/** The member's own chart — only ever sent to its owner. */
export interface KundliChart {
  hasBirthTime: boolean;
  hasBirthPlace: boolean;
  placeName: string | null;
  birthTimeResolved: string | null;
  dateOfBirth: string;
  assumptions: Array<"moon-at-noon" | "timezone-ist" | "timezone-unknown">;
  lagna: { rashi: number; rashiName: string; degreeInRashi: number } | null;
  chandra: { rashi: number; rashiName: string; nakshatra: number; nakshatraName: string; pada: number; nakshatraLord: string };
  grahas: KundliGraha[];
  manglik: { fromLagna: boolean | null; fromMoon: boolean; marsHouseFromLagna: number | null; marsHouseFromMoon: number };
  precision: "full" | "no-place" | "no-time";
}

export interface MatchMilanRow {
  profileId: string;
  name: string;
  total: number | null;
  band: string | null;
  hasDosha: boolean;
  assumedTime: boolean;
  blocked: "missing-data" | null;
}

/** `GET /api/mobile/kundli` — what `/user/kundli` renders. */
export interface MyKundliResponse {
  ok: boolean;
  chart: KundliChart | null;
  /** `mangalSummary` — the web card's own words. */
  mangal: { status: string; detail: string } | null;
  milanRows: MatchMilanRow[];
  pdfEntitled: boolean;
  manualUsable: boolean;
}

/* ------------------------------------------------------------------ */
/* Interests & matches — lib/contracts/discovery.ts                    */
/* ------------------------------------------------------------------ */

export interface InterestPerson {
  displayName: string;
  age?: number;
  city?: string;
}

export interface InterestItem {
  id: string;
  fromUser: InterestPerson;
  toUser: InterestPerson;
  status: "RECEIVED" | "SENT" | "ACCEPTED" | "DECLINED" | "WITHDRAWN";
  sentDate: string;
  message?: string;
  profileId?: string;
  canWithdraw?: boolean;
}

export interface InterestsViewModel {
  received: InterestItem[];
  sent: InterestItem[];
  emptyReceived: { title: string; description: string };
  emptySent: { title: string; description: string };
}

export interface MatchCard {
  id: string; // matchId
  displayName: string;
  age: number;
  city: string;
  education: string;
  profession: string;
  trustScore: number | null;
  verified: boolean;
  profileId: string;
  photoUrl: string | null;
}

export interface MatchesViewModel {
  matches: MatchCard[];
  emptyState: { title: string; description: string };
}

export interface InterestsResponse {
  ok: boolean;
  interests: InterestsViewModel;
  matches: MatchesViewModel;
}

export interface SendInterestResponse {
  ok: boolean;
  matched: boolean;
  matchId: string | null;
}

/* ------------------------------------------------------------------ */
/* Chat — lib/contracts/messages.ts                                    */
/* ------------------------------------------------------------------ */

export interface ChatParticipant {
  userId: string;
  profileId: string | null;
  displayName: string;
  photoUrl: string | null;
  verified: boolean;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
  readAt: string | null;
  voice?: { url: string; durationMs: number } | null;
}

export interface Conversation {
  matchId: string;
  other: ChatParticipant;
  lastMessage: { body: string; senderId: string; createdAt: string } | null;
  unreadCount: number;
  updatedAt: string;
  chatOpen: boolean;
}

export interface Thread {
  matchId: string;
  other: ChatParticipant;
  messages: ChatMessage[];
}

/* ------------------------------------------------------------------ */
/* Chat Unlock — lib/contracts/chatUnlock.ts (D-90)                    */
/* ------------------------------------------------------------------ */

/** The one plan still sold, as the unlock line mentions it. */
export interface PassOffer {
  name: string;
  pricePaise: number;
}

/** GET /api/chat-unlock/:matchId — what opening this chat would take. */
export type ChatUnlockQuote =
  | { state: "open" }
  | { state: "credit"; credits: number; welcome: boolean; pass: PassOffer | null }
  | { state: "pay"; pricePaise: number; pass: PassOffer | null }
  | { state: "unavailable"; message: string };

/**
 * POST /api/chat-unlock/:matchId, once `api()` has turned a refusal into an
 * `ApiError`: the chat is open (it already was, or a held credit opened it),
 * or it costs money and `checkoutUrl` is where that is paid. Never "paid" —
 * only the server's capture opens a paid chat.
 */
export type ChatUnlockOutcome = { state: "open" } | { state: "checkout"; checkoutUrl: string };

/* ------------------------------------------------------------------ */
/* Profile view — lib/contracts/profileView.ts                         */
/* ------------------------------------------------------------------ */

export type ProfileVisibilityLevel = "L1" | "L2" | "L3";

export interface ProfileView {
  profileId: string;
  displayName: string;
  age: number | null;
  city: string | null;
  headline: string | null;
  bio: string | null;
  photoUrl: string | null;
  photoUnlocked: boolean;
  photoLock: PhotoLock;
  photoFocalY: number | null;
  slides: ReelSlide[];
  photoVerified: boolean;
  mobileVerified: boolean;
  trustScore: number | null;
  trustScoreLabel: string | null;
  level: ProfileVisibilityLevel;
  isSelf: boolean;
  sections: Array<{ title: string; rows: Array<{ label: string; value: string }> }>;
  kundliNotes: KundliNote[];
  lockedHint: { title: string; description: string } | null;
  interestSent: boolean;
  interestReceived: boolean;
  matchId: string | null;
  shortlisted: boolean;
  askedStatus: "NONE" | "PENDING" | "ANSWERED" | "DECLINED" | "EXPIRED";
  askBridgeEnabled: boolean;
}

/* ------------------------------------------------------------------ */
/* My profile — app/api/profile/me, save-draft                         */
/* ------------------------------------------------------------------ */

export type ProfileLifecycle = "empty" | "draft" | "needs_review" | "ready" | "live";

export interface FieldMeta {
  source: "user" | "ai" | "inferred";
  confirmed: boolean;
  confidence?: number;
  sourceSpan?: string;
}

export interface ReadinessBlocker {
  key: string;
  label: string;
  reason: "missing" | "invalid" | "unconfirmed";
}

export interface Readiness {
  ready: boolean;
  done: number;
  total: number;
  blockers: ReadinessBlocker[];
  needsReview: string[];
}

export interface MyPhoto {
  id: string;
  fileUrl: string;
  isPrimary: boolean;
  verificationStatus: "PENDING" | "APPROVED" | "REJECTED";
  note: string | null;
  slotOrder: number | null;
  focalY: number | null;
}

export interface MyProfile {
  profileId: string;
  profileStatus: string;
  values: Record<string, string>;
  meta: Record<string, FieldMeta>;
  fillingFor: FillingFor;
  completionPercent: number;
  missingFields: string[];
  isLive: boolean;
  lifecycle: ProfileLifecycle;
  readiness: Readiness;
  reviewQueue: string[];
  photos: MyPhoto[];
  canPhotoEnhance: boolean;
  canPhotoUltraEnhance: boolean;
}

export interface SaveDraftResponse {
  profileId: string;
  profileStatus: string;
  values: Record<string, string>;
  completionPercent: number;
  missingFields: string[];
  isLive: boolean;
  lifecycle: ProfileLifecycle;
  readiness: Readiness;
  reviewQueue: string[];
  justActivated: boolean;
}

export interface PhotoUploadResponse {
  photoId: string;
  fileUrl: string;
  isPrimary: boolean;
  verificationStatus: "PENDING" | "APPROVED" | "REJECTED";
  slotOrder: number | null;
}

/* ------------------------------------------------------------------ */
/* Notices & counts — lib/contracts/notice.ts, /api/nav/counts         */
/* ------------------------------------------------------------------ */

export type NoticeKind =
  | "VOICE_NOTE_RECEIVED"
  | "QUESTION_ASKED"
  | "QUESTION_ANSWERED"
  | "QUEST_AVAILABLE"
  | "REWARD_EARNED"
  | "FAMILY_ACTION"
  | "MATCH_CREATED"
  | "CHAT_NUDGE"
  | "MATCHMAKER_UPDATE"
  | "PLAN_GRANTED"
  | "SERVICE_UPDATE"
  | "ANNOUNCEMENT"
  | "RISHTA_REQUEST"
  | "VERIFICATION_UPDATE"
  | string;

export interface Notice {
  id: string;
  kind: NoticeKind;
  title: string;
  body: string;
  href: string | null;
  actorMasked: boolean;
  relatedId: string | null;
  read: boolean;
  createdAt: string;
}

export interface NavCounts {
  matches: number;
  interests: number;
  messages: number;
  inbox: number;
}

/* ------------------------------------------------------------------ */
/* Search — lib/discovery/contract.ts                                  */
/* ------------------------------------------------------------------ */

export type DiscoverFilters = Partial<{
  lookingForGender: "Ladka" | "Ladki";
  name: string;
  minAge: number;
  maxAge: number;
  minHeightCm: number;
  maxHeightCm: number;
  cities: string[];
  states: string[];
  countries: string[];
  nativePlace: string;
  maritalStatus: string[];
  motherTongue: string[];
  religion: string[];
  community: string[];
  gotra: string;
  educationTier: string;
  education: string[];
  professionCategory: string[];
  jobTitle: string;
  workCity: string[];
  minIncome: string;
  diet: string[];
  smoking: string[];
  drinking: string[];
  languages: string[];
  hobbies: string[];
  relocate: string[];
  familyType: string[];
  familyValues: string[];
  manglik: string[];
  verifiedOnly: boolean;
  minTrustScore: number;
  minCompleteness: number;
}>;

export type DiscoverSort = "newest" | "trust";
export type DiscoverMode = "strict" | "flexible";

export interface DiscoverResultCard {
  profileId: string;
  displayName: string;
  age: number | null;
  city: string | null;
  education: string | null;
  profession: string | null;
  professionCategory: string | null;
  maritalStatus: string | null;
  verified: boolean;
  trustScore: number | null;
  trustLabel: string | null;
  photoUrl: string | null;
  photoUnlocked: boolean;
  photoLock: PhotoLock;
  photoVerified: boolean;
  shortlisted: boolean;
  reason: { kind: string; text: string; matched: string[]; missed: string[]; unknown: string[]; total: number; matchedCount: number };
}

export interface DiscoverSearchResponse {
  ok: true;
  results: DiscoverResultCard[];
  nextCursor: string | null;
  countLabel: string;
  suggestions: Array<{ id: string; label: string; filters: DiscoverFilters; mode: DiscoverMode }>;
}

export interface DiscoverIntentResponse {
  ok: true;
  summary: string;
  filters: DiscoverFilters;
  unresolvedRequests: string[];
  clarificationQuestion: string | null;
  confidence: number;
}

/* ------------------------------------------------------------------ */
/* AI — lib/contracts/interview.ts (Grio's contract: ~/shared/grio)     */
/* ------------------------------------------------------------------ */

export interface ExtractedField {
  field: string;
  value: string | null;
  confidence: number;
  sourceSpan: string | null;
  needsConfirmation: boolean;
  reason?: string;
}

export interface InferredField {
  field: string;
  value: string;
  inferredFrom: string;
  confidence: number;
  needsConfirmation: true;
}

export interface InterviewTurnResult {
  extractedFields: ExtractedField[];
  inferredFields: InferredField[];
  unresolved: string[];
  detectedLanguage: string;
  userDeclined: boolean;
  clarification: string | null;
}

export type InterviewResponse =
  | { ok: true; result: InterviewTurnResult }
  | { ok: false; code: "not_configured" | "upstream_error" | "bad_request" | "voice_limit"; message: string };

export interface SpeechConfig {
  stt: boolean;
  tts: boolean;
  streaming: boolean;
}

/* ------------------------------------------------------------------ */
/* Theme — app/api/mobile/theme                                        */
/* ------------------------------------------------------------------ */

export interface ThemeRoomConfig {
  id: "terrace" | "ivory" | "gold" | "paper";
  label: string;
  enabled: boolean;
  background: {
    imageUrl: string;
    /** The 72px blurred copy the server cut on upload — shown while the photo loads. */
    backdropUrl?: string | null;
    width: number;
    height: number;
    color: string;
    dim: number;
    focusX: number;
    focusY: number;
    /** False when the phone borrows the desktop photo (no portrait one uploaded). */
    own?: boolean;
  } | null;
  /** The admin's glass knobs resolved for mobile (manual, or auto from the photo). Partial is filled from the shipped glass. */
  glass: Partial<import("~/theme/glass").AdminGlass> | null;
  glassMode?: "auto" | "manual" | null;
}

export interface ThemeConfigResponse {
  ok: boolean;
  defaultRoom: ThemeRoomConfig["id"];
  enabled: ThemeRoomConfig["id"][];
  rooms: ThemeRoomConfig[];
  /** The site's colour identity (/admin/theme ThemeManager); custom colours only for a CUSTOM pick. */
  brand?: import("~/theme/glass").ThemeBrand | null;
}
