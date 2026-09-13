import type { MarketingPlan } from "./marketingPlanSchema";
import type { CreativeMediaRow, DeploymentPlatform, DeploymentRow, DeploymentSummary } from "./marketingExecution";

/**
 * Growth Saathi — the admin-only AI Marketing Manager (Phase MKT-1).
 *
 * The vocabulary shared between `/admin/marketing-ai`, its API routes and
 * the services under `lib/services/marketing/`. Same split as `growth.ts`:
 * the services are `server-only`, the console is a client component, and a
 * value imported across that line pulls Prisma into the browser bundle — so
 * every constant a screen needs lives here and every query lives there.
 *
 * See docs/bandhantak/12_ai_marketing_manager_plan.md. Section numbers in
 * comments below refer to that document.
 */

export type { MarketingPlan } from "./marketingPlanSchema";

// ============================================================
// Connections — Zone C (§2), connector rules (§13)
// ============================================================

export const MARKETING_PROVIDERS = [
  "GOOGLE_ANALYTICS",
  "SEARCH_CONSOLE",
  "GOOGLE_ADS",
  "META_ADS",
  "FACEBOOK_PAGE",
  "INSTAGRAM",
  "VIDEO_PROVIDER",
] as const;

export type MarketingProviderKey = (typeof MARKETING_PROVIDERS)[number];

export function isMarketingProvider(value: string): value is MarketingProviderKey {
  return (MARKETING_PROVIDERS as readonly string[]).includes(value);
}

/** How a provider is authorised. Decides which controls the connection sheet shows. */
export type ConnectionAuthKind = "google-oauth" | "meta-token" | "not-available";

export interface MarketingProviderMeta {
  label: string;
  blurb: string;
  auth: ConnectionAuthKind;
  /** What the admin types into the account-reference field. */
  accountRefLabel: string;
  accountRefHint: string;
  /** Google OAuth scopes / Meta permissions this provider needs to READ — the minimum, nothing shared (§13). */
  scopes: string[];
  /** Permissions the MKT-2 executor additionally needs to WRITE (Meta `ads_management`). Shown separately from read scopes (doc 14 §9). */
  writeScopes?: string[];
  /** A pasted secret this provider also needs, from `ProviderCredential`. */
  credential: "META_MARKETING" | "GOOGLE_ADS_DEVELOPER" | null;
  /** The pasted secret is legacy/optional — its absence is not a "not connected" (Google Ads developer token since 2026-09-09). */
  credentialOptional?: boolean;
}

export const MARKETING_PROVIDER_META: Record<MarketingProviderKey, MarketingProviderMeta> = {
  GOOGLE_ANALYTICS: {
    label: "Google Analytics",
    blurb: "GA4 — landing pages, traffic source, registration/profile/verification events.",
    auth: "google-oauth",
    accountRefLabel: "GA4 property ID",
    accountRefHint: "Sirf number, jaise 123456789 (Admin → Property settings).",
    scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
    credential: null,
  },
  SEARCH_CONSOLE: {
    label: "Google Search Console",
    blurb: "Kin queries par BandhanTak dikhta hai — impressions, clicks, CTR, position.",
    auth: "google-oauth",
    accountRefLabel: "Property",
    accountRefHint: "sc-domain:bandhantak.com ya https://bandhantak.com/ — jaise Search Console me hai.",
    scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
    credential: null,
  },
  GOOGLE_ADS: {
    label: "Google Ads",
    blurb: "Keyword ideas, search volume, aur existing campaigns ka performance.",
    auth: "google-oauth",
    accountRefLabel: "Customer ID",
    accountRefHint: "10 digit, bina dash — jaise 1234567890. Manager account se access ho to settings me login-customer-id bhi.",
    scopes: ["https://www.googleapis.com/auth/adwords"],
    credential: "GOOGLE_ADS_DEVELOPER",
    // Google sunset developer tokens on 2026-09-09; API access level is the
    // Cloud project's (Test/Basic/Standard/Explorer). A pasted token is
    // sent when present and never required (doc 14 Gap B).
    credentialOptional: true,
  },
  META_ADS: {
    label: "Meta Ads",
    blurb: "Facebook/Instagram campaigns — spend, reach, clicks, results. MKT-2B: paused campaign create + separate activation.",
    auth: "meta-token",
    accountRefLabel: "Ad account ID",
    accountRefHint: "act_ ke bina sirf number — Ads Manager URL me act=… wala.",
    scopes: ["ads_read"],
    writeScopes: ["ads_management"],
    credential: "META_MARKETING",
  },
  FACEBOOK_PAGE: {
    label: "Facebook Page",
    blurb: "BandhanTak ka Page — followers aur recent posts.",
    auth: "meta-token",
    accountRefLabel: "Page ID",
    accountRefHint: "Page → About → Page transparency me hota hai.",
    scopes: ["pages_read_engagement", "pages_show_list"],
    credential: "META_MARKETING",
  },
  INSTAGRAM: {
    label: "Instagram Professional",
    blurb: "Reels aur posts ka reach, saves, shares — sirf Business/Creator account.",
    auth: "meta-token",
    accountRefLabel: "Instagram user ID",
    accountRefHint: "Page se juda IG Business account ka numeric ID (username nahi).",
    scopes: ["instagram_basic", "instagram_manage_insights"],
    credential: "META_MARKETING",
  },
  VIDEO_PROVIDER: {
    label: "Video provider",
    blurb: "AI video rendering — Phase MKT-3 me aayega. Tab tak Reel concepts script/storyboard ke roop me bante hain.",
    auth: "not-available",
    accountRefLabel: "—",
    accountRefHint: "",
    scopes: [],
    credential: null,
  },
};

/**
 * MKT-2B (doc 14 §9) — the Meta ad-creation readiness report. Every
 * prerequisite is its own line with its own state, so "token works" is
 * never read as "can create ads". `UNVERIFIED` is an honest answer: the
 * Marketing API access tier, for one, is app-level and not readable.
 */
export type MetaReadinessState = "READY" | "MISSING" | "UNVERIFIED" | "NOT_NEEDED";

export interface MetaReadinessCheck {
  key: "TOKEN" | "READ_PERMISSION" | "WRITE_PERMISSION" | "ACCESS_TIER" | "AD_ACCOUNT" | "ACCOUNT_STATUS" | "CURRENCY" | "TIMEZONE" | "PAGE" | "INSTAGRAM";
  label: string;
  state: MetaReadinessState;
  detail: string | null;
  /** The one admin action when not READY. */
  fix: string | null;
  reconnect: boolean;
}

export interface MetaReadinessReport {
  checkedAt: string;
  apiVersion: string;
  /** Every required line READY (UNVERIFIED lines do not block; NOT_NEEDED never does). */
  ok: boolean;
  checks: MetaReadinessCheck[];
  account: { id: string; name: string | null; currency: string | null; timeZone: string | null; accountStatus: number | null; disableReason: number | null } | null;
  page: { id: string; name: string | null } | null;
  instagram: { id: string; username: string | null } | null;
  /** The first blocking check's execution error code, for the deployment row. */
  errorCode: string | null;
  message: string;
}

export type ConnectionHealth = "CONNECTED" | "NEEDS_ATTENTION" | "NOT_CONNECTED";

export const CONNECTION_HEALTH_LABEL: Record<ConnectionHealth, string> = {
  CONNECTED: "Connected",
  NEEDS_ATTENTION: "Needs attention",
  NOT_CONNECTED: "Not connected",
};

/** One chip on the health strip. Never carries a token, a key, or any part of one. */
export interface ConnectionStatusRow {
  provider: MarketingProviderKey | "BANDHANTAK";
  label: string;
  health: ConnectionHealth;
  accountRef: string | null;
  /** Saved on the page ("DB") or the env fallback ("ENV" — the three Meta ids only); null when there is none. */
  accountRefSource: "DB" | "ENV" | null;
  accountLabel: string | null;
  /** Non-secret settings the sheet can edit (e.g. `loginCustomerId`). */
  settings: Record<string, string>;
  /** Whether the pasted secret this provider needs is set — presence only. */
  credentialSet: boolean | null;
  credentialHint: string | null;
  grantedAt: string | null;
  lastSyncAt: string | null;
  /** Sanitised — never a raw provider payload. */
  lastError: string | null;
  /** The one thing to do next, or null when nothing is needed. */
  todo: string | null;
}

// ============================================================
// Goals — §5
// ============================================================

export const MARKETING_OBJECTIVES = [
  "COMPLETED_PROFILE",
  "LIVE_PROFILE",
  "VERIFIED_PROFILE",
  "PAID_SUBSCRIPTION",
  "PARTNER_SIGNUP",
  "RETURNING_INACTIVE_USER",
  "RISHTA_PROGRESSION",
] as const;
export type MarketingObjectiveKey = (typeof MARKETING_OBJECTIVES)[number];

export const OBJECTIVE_LABEL: Record<MarketingObjectiveKey, string> = {
  COMPLETED_PROFILE: "Completed profile",
  LIVE_PROFILE: "Live profile",
  VERIFIED_PROFILE: "Verified profile",
  PAID_SUBSCRIPTION: "Paid subscription",
  PARTNER_SIGNUP: "Partner signup",
  RETURNING_INACTIVE_USER: "Returning inactive user",
  RISHTA_PROGRESSION: "Healthy rishta progression",
};

/**
 * MKT-0's minimum event list (§15). These are the only conversion names a
 * goal or a GA4 read may use, so a package's "conversion action" is always
 * something the product can actually count.
 */
export const CONVERSION_EVENTS = [
  "landing_view",
  "registration_started",
  "registration_completed",
  "profile_completed",
  "profile_live",
  "verification_completed",
  "subscription_captured",
] as const;
export type ConversionEvent = (typeof CONVERSION_EVENTS)[number];

export const MARKETING_CHANNELS = ["GOOGLE_SEARCH", "META_FEED", "INSTAGRAM_REELS", "INSTAGRAM_STORIES", "FACEBOOK_PAGE"] as const;
export type MarketingChannel = (typeof MARKETING_CHANNELS)[number];

export const CHANNEL_LABEL: Record<MarketingChannel, string> = {
  GOOGLE_SEARCH: "Google Search",
  META_FEED: "Facebook / Instagram feed",
  INSTAGRAM_REELS: "Instagram Reels",
  INSTAGRAM_STORIES: "Instagram Stories",
  FACEBOOK_PAGE: "Facebook Page (organic)",
};

export const AUDIENCE_SIDES = ["all", "men", "women", "family", "partner"] as const;
export type AudienceSide = (typeof AUDIENCE_SIDES)[number];

/**
 * The structured half of a command (§5 "Goal object"). Everything here is
 * optional because the command box is the primary input; what the admin
 * fills in overrides anything the model extracts from the sentence, and
 * `target` can *only* come from here.
 */
export interface CommandGoalInput {
  geography?: string;
  audienceSide?: AudienceSide;
  windowDays?: number;
  primaryConversion?: ConversionEvent;
  target?: number;
  dailyBudgetRupees?: number;
  totalBudgetRupees?: number;
  channels?: MarketingChannel[];
  constraints?: string;
  stopLossRule?: string;
}

export interface CommandInput {
  request: string;
  goal?: CommandGoalInput;
  /** Continue an existing goal instead of creating one. */
  goalId?: string;
}

// ============================================================
// Tasks — Zone B (§2)
// ============================================================

export const TASK_STATUSES = [
  "NEEDS_APPROVAL",
  "WORKING",
  "SCHEDULED_LIVE",
  "RESULT_READY",
  "BLOCKED",
  "REJECTED",
  "FAILED",
] as const;
export type TaskStatusKey = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_META: Record<TaskStatusKey, { label: string; tone: "gold" | "wine" | "trust" | "neutral" | "danger" }> = {
  NEEDS_APPROVAL: { label: "Need your approval", tone: "gold" },
  WORKING: { label: "Working", tone: "wine" },
  SCHEDULED_LIVE: { label: "Scheduled / live", tone: "trust" },
  RESULT_READY: { label: "Learning / result ready", tone: "trust" },
  BLOCKED: { label: "Blocked — connection/action needed", tone: "danger" },
  REJECTED: { label: "Rejected", tone: "neutral" },
  FAILED: { label: "Failed", tone: "danger" },
};

export interface ThreadEntry {
  role: "admin" | "saathi";
  text: string;
  at: string;
}

export interface TaskGoalSummary {
  id: string;
  name: string;
  objective: MarketingObjectiveKey;
  geography: string | null;
  primaryConversion: string;
  target: number | null;
  dailyBudgetPaise: number | null;
  totalBudgetPaise: number | null;
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "DONE";
}

export interface TaskRow {
  id: string;
  request: string;
  status: TaskStatusKey;
  currentStep: string | null;
  blockingReason: string | null;
  summary: string | null;
  channels: string[];
  budgetDailyPaise: number | null;
  budgetTotalPaise: number | null;
  goal: TaskGoalSummary | null;
  /** The one approval the admin can act on right now, if any. */
  pendingApprovalId: string | null;
  /** MKT-2 — per-platform execution state, so the queue can tell a config block from a question. */
  deployments: DeploymentSummary[];
  draftCount: number;
  creativeCount: number;
  evidenceCount: number;
  createdAt: string;
  updatedAt: string;
  lastRun: {
    id: string;
    status: "RUNNING" | "SUCCEEDED" | "FAILED";
    error: string | null;
    provider: string | null;
    modelId: string | null;
    startedAt: string;
    finishedAt: string | null;
  } | null;
}

export interface MarketingOverview {
  generatedAt: string;
  connections: ConnectionStatusRow[];
  tasks: TaskRow[];
  /** `SECRETS_ENCRYPTION_KEY` present — without it no grant or token can be stored. */
  encryptionConfigured: boolean;
  /** `GOOGLE_CLIENT_ID/SECRET` present — without them "Connect with Google" cannot start. */
  googleOAuthConfigured: boolean;
  /** Which provider+model the planner will run on right now. */
  aiRoute: { provider: string; model: string };
}

// ============================================================
// Task detail — drafts, creatives, approvals, evidence
// ============================================================

export type ReviewStatusKey = "DRAFT" | "APPROVED" | "REJECTED";

export interface DraftRow {
  id: string;
  platform: "GOOGLE_SEARCH" | "META";
  name: string;
  spec: Record<string, unknown>;
  dailyBudgetPaise: number | null;
  totalBudgetPaise: number | null;
  approvalStatus: ReviewStatusKey;
  externalCampaignId: string | null;
  externalStatus: string | null;
}

export interface CreativeRow {
  id: string;
  kind: "COPY" | "IMAGE" | "REEL" | "STORY" | "TEMPLATE" | "LANDING";
  variantGroup: string | null;
  title: string;
  brief: Record<string, unknown>;
  /** Concept/package review — MKT-1's APPROVE_PACKAGE. Says nothing about a file. */
  reviewStatus: ReviewStatusKey;
  /** MKT-2B — the actual image files attached to this brief, each with its own review (doc 14 §7.3, §8). Empty for non-IMAGE briefs. */
  media: CreativeMediaRow[];
}

export const APPROVAL_ACTIONS = [
  "APPROVE_PACKAGE",
  "GENERATE_CREATIVES",
  "CREATE_PAUSED_CAMPAIGNS",
  "ACTIVATE_CAMPAIGNS",
  "PUBLISH_REEL",
  "PUBLISH_FACEBOOK_POST",
  "CHANGE_BUDGET",
  "PAUSE_CAMPAIGN",
  "PUBLISH_WEBSITE_CONTENT",
] as const;
export type ApprovalActionKey = (typeof APPROVAL_ACTIONS)[number];

export const APPROVAL_ACTION_LABEL: Record<ApprovalActionKey, string> = {
  APPROVE_PACKAGE: "Approve campaign package",
  GENERATE_CREATIVES: "Generate creatives",
  CREATE_PAUSED_CAMPAIGNS: "Create paused campaigns",
  ACTIVATE_CAMPAIGNS: "Activate campaigns",
  PUBLISH_REEL: "Publish Reel",
  PUBLISH_FACEBOOK_POST: "Publish Facebook post",
  CHANGE_BUDGET: "Change budget",
  PAUSE_CAMPAIGN: "Pause campaign",
  PUBLISH_WEBSITE_CONTENT: "Publish website content",
};

/**
 * The actions this release can actually carry out. Everything else is shown
 * as "next phase" so the admin sees what will be asked later — a card that
 * can be approved but does nothing would be worse than no card (§10: no
 * vague "Allow AI" button, and no button that lies about its effect).
 *
 * MKT-2 adds the two spend boundaries. They are executable only for the
 * platforms in `EXECUTABLE_PLATFORMS` (marketingExecution.ts) — the action
 * being in this set is necessary, not sufficient; the executor also checks
 * platform, deployment phase and deployment state (13 §18).
 */
export const EXECUTABLE_APPROVAL_ACTIONS: ReadonlySet<ApprovalActionKey> = new Set<ApprovalActionKey>([
  "APPROVE_PACKAGE",
  "CREATE_PAUSED_CAMPAIGNS",
  "ACTIVATE_CAMPAIGNS",
]);

export const APPROVAL_PHASE: Record<ApprovalActionKey, string> = {
  APPROVE_PACKAGE: "MKT-1",
  GENERATE_CREATIVES: "MKT-3",
  CREATE_PAUSED_CAMPAIGNS: "MKT-2",
  ACTIVATE_CAMPAIGNS: "MKT-2",
  PUBLISH_REEL: "MKT-3",
  PUBLISH_FACEBOOK_POST: "MKT-3",
  CHANGE_BUDGET: "MKT-4",
  PAUSE_CAMPAIGN: "MKT-4",
  // Website publishing stays in the content phase — 13 §18 keeps it out of the ads-execution release.
  PUBLISH_WEBSITE_CONTENT: "MKT-3",
};

/** §10 — the exact diff an approval card shows. */
export interface ApprovalPreview {
  account: string;
  channel: string;
  audience: string;
  contentPreview: string[];
  destination: string;
  startEnd: string;
  dailyBudget: string;
  totalBudget: string;
  conversionEvent: string;
  whatHappensNow: string;
  rollback: string;
}

export interface ApprovalRow {
  id: string;
  action: ApprovalActionKey;
  status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED" | "EXECUTED" | "FAILED";
  executable: boolean;
  /** Set on the MKT-2 write cards — the one platform this card authorises. */
  platform: DeploymentPlatform | null;
  deploymentId: string | null;
  preview: ApprovalPreview;
  payloadHash: string;
  requestedBy: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionReason: string | null;
  expiresAt: string;
  executionResult: Record<string, unknown> | null;
}

export type GuardrailFlagKind =
  | "BUDGET_CLAMPED"
  | "CLAIM_REMOVED"
  | "TARGETING_REMOVED"
  | "EVIDENCE_DROPPED"
  | "TOPIC_REJECTED"
  | "PRICE_UNVERIFIED"
  | "LENGTH_DROPPED"
  | "CHANNEL_DROPPED"
  | "LANDING_UNKNOWN"
  | "PACKAGE_INCOMPLETE";

export interface GuardrailFlag {
  kind: GuardrailFlagKind;
  /** Where in the plan — e.g. "googleSearch.adGroups[0].headlines[3]". */
  path: string;
  /** What was there / what happened, in one line. */
  detail: string;
}

export interface ToolCallRecord {
  tool: string;
  tier: "READ_AUTO" | "CREATE_DRAFT" | "EXTERNAL_WRITE_APPROVAL";
  ok: boolean;
  ms: number;
  error: string | null;
  /** Rows/ideas/campaigns the call returned — a size, never the content. */
  rows: number | null;
}

/** What the model was told about one data source — freshness is part of the fact (§17). */
export interface EvidenceSourceSummary {
  source: string;
  status: "ok" | "stale" | "not_connected" | "needs_attention" | "error" | "empty";
  window: string;
  fetchedAt: string | null;
  note: string | null;
}

export interface RunRow {
  id: string;
  status: "RUNNING" | "SUCCEEDED" | "FAILED";
  provider: string | null;
  modelId: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
  toolsCalled: ToolCallRecord[];
  sources: EvidenceSourceSummary[];
}

export interface TaskDetail extends TaskRow {
  thread: ThreadEntry[];
  plan: MarketingPlan | null;
  /** The exact aggregate context the model read on the latest run. */
  evidence: Record<string, unknown> | null;
  guardrailFlags: GuardrailFlag[];
  drafts: DraftRow[];
  creatives: CreativeRow[];
  approvals: ApprovalRow[];
  runs: RunRow[];
  /** MKT-2 — one row per platform draft the package approved (13 §19). */
  deploymentRows: DeploymentRow[];
}
