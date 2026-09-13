/**
 * MKT-2 — the vocabulary of paid-ads execution, shared by the console, the
 * API routes and `lib/services/marketing/execution/*`.
 *
 * Same rule as `marketingAi.ts`: constants a screen needs live here, queries
 * live in the services. Nothing in this file imports Prisma or zod, so the
 * client bundle stays free of both — the typed approval payload schemas are
 * in `marketingExecutionPayloads.ts` for the server side.
 *
 * Section numbers refer to
 * docs/bandhantak/13_ai_marketing_manager_mkt2_execution_plan.md (Google,
 * MKT-2A) and docs/bandhantak/14_ai_marketing_manager_mkt2b_meta_execution_plan.md
 * (Meta, MKT-2B).
 */

export type DeploymentPlatform = "GOOGLE_SEARCH" | "META";

export const PLATFORM_LABEL: Record<DeploymentPlatform, string> = {
  GOOGLE_SEARCH: "Google Search",
  META: "Meta",
};

/**
 * Which platforms this release can actually write to. A create/activate
 * approval for a platform outside this set is shown as "next phase" and
 * refused by the executor — the action enum being executable is not enough
 * on its own (§18). Meta joined in MKT-2B's enable milestone (doc 14 §17,
 * §28) after its permission, media, mapping, checkpoint/no-duplicate and
 * campaign-last activation cases passed in
 * `scripts/marketing-meta-execution-check.ts`. This is still only one of the
 * gates: every Meta write also needs its registry switch, a green
 * readiness check on the connection, and its own approved card.
 */
export const EXECUTABLE_PLATFORMS: ReadonlySet<DeploymentPlatform> = new Set<DeploymentPlatform>(["GOOGLE_SEARCH", "META"]);

export type DeploymentPhase = "CREATE" | "ACTIVATE";

// ============================================================
// State machine (§5)
// ============================================================

export const DEPLOYMENT_STATUSES = [
  "CREATE_PENDING",
  "QUEUED",
  "PREFLIGHT",
  "VALIDATING",
  "CREATING",
  "UNKNOWN_OUTCOME",
  "RECONCILING",
  "PARTIAL",
  "PAUSED_READY",
  "ACTIVATION_PENDING",
  "ACTIVATION_QUEUED",
  "ACTIVATING",
  "LIVE",
  "BLOCKED_CONFIG",
  "BLOCKED_CREATIVE",
  "FAILED_RETRYABLE",
  "FAILED_FINAL",
  "CANCELLED",
] as const;
export type DeploymentStatusKey = (typeof DEPLOYMENT_STATUSES)[number];

export type DeploymentTone = "gold" | "wine" | "trust" | "neutral" | "danger";

/**
 * §14 status copy — every label says whether money can move. `LIVE` is
 * kept as the internal "activated" state for MKT-2A compatibility, but its
 * label never claims delivery (doc 14 Gap C): a configured-active campaign
 * may be in policy review, ineligible, unbilled or simply have no traffic.
 * "Delivering" is a separate, provider-evidenced word — see `deliveryLabel`.
 */
export const DEPLOYMENT_STATUS_META: Record<DeploymentStatusKey, { label: string; tone: DeploymentTone }> = {
  CREATE_PENDING: { label: "Waiting for paused-create approval", tone: "gold" },
  QUEUED: { label: "Queued — creating safely in paused mode", tone: "wine" },
  PREFLIGHT: { label: "Preflight — account & spec check", tone: "wine" },
  VALIDATING: { label: "Validating with provider (no write yet)", tone: "wine" },
  CREATING: { label: "Creating safely in paused mode", tone: "wine" },
  UNKNOWN_OUTCOME: { label: "Needs review — result uncertain", tone: "danger" },
  RECONCILING: { label: "Checking provider result", tone: "wine" },
  PARTIAL: { label: "Partially created — needs review", tone: "danger" },
  PAUSED_READY: { label: "Created and paused — no spend yet", tone: "trust" },
  ACTIVATION_PENDING: { label: "Paused — waiting for activation approval", tone: "gold" },
  ACTIVATION_QUEUED: { label: "Activation queued", tone: "wine" },
  ACTIVATING: { label: "Activating", tone: "wine" },
  LIVE: { label: "Activated — spend may occur", tone: "trust" },
  BLOCKED_CONFIG: { label: "Configuration needed", tone: "danger" },
  BLOCKED_CREATIVE: { label: "Creative required", tone: "danger" },
  FAILED_RETRYABLE: { label: "Failed — safe to retry", tone: "danger" },
  FAILED_FINAL: { label: "Failed — needs correction", tone: "danger" },
  CANCELLED: { label: "Cancelled before execution", tone: "neutral" },
};

/** A worker owns (or is about to own) the row. The UI polls only while one of these is present (§14). */
export const ACTIVE_DEPLOYMENT_STATUSES: ReadonlySet<DeploymentStatusKey> = new Set<DeploymentStatusKey>([
  "QUEUED",
  "PREFLIGHT",
  "VALIDATING",
  "CREATING",
  "RECONCILING",
  "ACTIVATION_QUEUED",
  "ACTIVATING",
]);

/** A worker's lease is meaningful only here — nowhere else is a row "in progress". */
export const LOCKED_DEPLOYMENT_STATUSES: ReadonlySet<DeploymentStatusKey> = new Set<DeploymentStatusKey>([
  "PREFLIGHT",
  "VALIDATING",
  "CREATING",
  "RECONCILING",
  "ACTIVATING",
]);

/** Provider objects exist (or may exist). A revision must not make a second set (§17). */
export const EXTERNAL_DEPLOYMENT_STATUSES: ReadonlySet<DeploymentStatusKey> = new Set<DeploymentStatusKey>([
  "QUEUED",
  "PREFLIGHT",
  "VALIDATING",
  "CREATING",
  "UNKNOWN_OUTCOME",
  "RECONCILING",
  "PARTIAL",
  "PAUSED_READY",
  "ACTIVATION_PENDING",
  "ACTIVATION_QUEUED",
  "ACTIVATING",
  "LIVE",
]);

export function isDeploymentStatus(value: string): value is DeploymentStatusKey {
  return (DEPLOYMENT_STATUSES as readonly string[]).includes(value);
}

// ============================================================
// Errors (§16, doc 14 §9)
// ============================================================

export const EXECUTION_ERROR_CODES = [
  "AUTH_EXPIRED",
  "PERMISSION_MISSING",
  "ACCOUNT_NOT_READY",
  "BILLING_NOT_READY",
  "INVALID_CONVERSION_ACTION",
  "INVALID_GEO_OR_LANGUAGE",
  "INVALID_BUDGET",
  "INVALID_BIDDING",
  "INVALID_LANDING",
  "SPEC_INVALID",
  "POLICY_REJECTED",
  "CREATIVE_MISSING",
  "CREATIVE_INVALID",
  "SPEC_CHANGED",
  "APPROVAL_INVALID",
  "GUARDRAIL_FAILED",
  "PROVIDER_VALIDATION_FAILED",
  "RATE_LIMITED",
  "NETWORK_UNKNOWN_OUTCOME",
  "PROVIDER_PARTIAL_FAILURE",
  "RECONCILIATION_AMBIGUOUS",
  "READBACK_MISMATCH",
  "EXTERNAL_DRIFT",
  "NOT_EXECUTABLE_YET",
  "INTERNAL_ERROR",
  // MKT-2B — Meta readiness, each separated so the fix is exact (doc 14 §9).
  "META_TOKEN_INVALID",
  "META_ADS_MANAGEMENT_MISSING",
  "META_ACCESS_TIER_BLOCKED",
  "META_AD_ACCOUNT_FORBIDDEN",
  "META_AD_ACCOUNT_DISABLED",
  "META_PAGE_NOT_ASSIGNED",
  "META_INSTAGRAM_NOT_ASSIGNED",
  "META_ACCOUNT_CURRENCY_MISMATCH",
] as const;
export type ExecutionErrorCode = (typeof EXECUTION_ERROR_CODES)[number];

/** What the admin sees about a failure — never a token, never a raw provider body. */
export interface SafeExecutionError {
  code: ExecutionErrorCode;
  message: string;
  /** The one thing to do next, or null when only a new package can fix it. */
  fix: string | null;
  retrySafe: boolean;
  requestId: string | null;
  /** The fix starts with re-connecting / re-issuing the token (doc 14 §9 "whether reconnect is required"). */
  reconnect?: boolean;
}

// ============================================================
// Task detail rows (§19)
// ============================================================

/** Google's five steps, and Meta's checkpointed eight (doc 14 §13). */
export type DeploymentStepKey = "PREFLIGHT" | "VALIDATE" | "CREATE" | "VERIFY" | "ACTIVATE" | "CAMPAIGN" | "ADSETS" | "MEDIA" | "CREATIVES" | "ADS";
export type DeploymentStepState = "done" | "active" | "todo" | "error";

export const DEPLOYMENT_STEP_LABEL: Record<DeploymentStepKey, string> = {
  PREFLIGHT: "Preflight",
  VALIDATE: "Validate",
  CREATE: "Create (paused)",
  VERIFY: "Verify",
  ACTIVATE: "Activate",
  CAMPAIGN: "Campaign (paused)",
  ADSETS: "Ad sets (paused)",
  MEDIA: "Media",
  CREATIVES: "Creatives",
  ADS: "Ads (paused)",
};

export const GOOGLE_STEP_ORDER: DeploymentStepKey[] = ["PREFLIGHT", "VALIDATE", "CREATE", "VERIFY", "ACTIVATE"];
export const META_STEP_ORDER: DeploymentStepKey[] = ["PREFLIGHT", "CAMPAIGN", "ADSETS", "MEDIA", "CREATIVES", "ADS", "VERIFY", "ACTIVATE"];

export type DeploymentActionKey = "SYNC" | "RETRY" | "RECHECK" | "REQUEST_ACTIVATION";

export const DEPLOYMENT_ACTION_LABEL: Record<DeploymentActionKey, string> = {
  SYNC: "Sync from provider",
  RETRY: "Retry safely",
  RECHECK: "Re-check readiness",
  REQUEST_ACTIVATION: "Request activation",
};

/** Platform-specific button copy for the generic verbs (doc 14 §18). */
export function deploymentActionLabel(action: DeploymentActionKey, platform: DeploymentPlatform): string {
  if (platform !== "META") return DEPLOYMENT_ACTION_LABEL[action];
  switch (action) {
    case "SYNC":
      return "Sync from Meta";
    case "RECHECK":
      return "Re-check Meta readiness";
    default:
      return DEPLOYMENT_ACTION_LABEL[action];
  }
}

export interface DeploymentEventRow {
  step: string;
  level: "info" | "ok" | "error";
  message: string;
  at: string;
}

/**
 * Doc 14 §7.4 — the provider's own words about the campaign, kept apart
 * from BandhanTak's state. `configuredStatus` is what we set; the rest is
 * what the provider reports. `LIVE` + a non-delivering effective status is
 * a real, common combination and the UI must be able to show it.
 */
export interface DeliverySnapshot {
  configuredStatus: string | null;
  effectiveStatus: string | null;
  deliveryStatus: string | null;
  policyStatus: string | null;
  issues: string[];
  snapshotAt: string;
}

/**
 * "Delivering" only when the provider says so — Google `servingStatus:
 * SERVING` with an eligible primary status; Meta: the campaign *and* at least
 * one intended ad effectively ACTIVE (`metaDeliveryOf` — a campaign whose ads
 * are all in review is activated, not delivering). Everything else is named
 * for what it is.
 */
export function deliveryLabel(platform: DeploymentPlatform, d: DeliverySnapshot | null): { text: string; delivering: boolean } {
  if (!d) return { text: "Provider delivery status abhi read nahi hua", delivering: false };
  if (platform === "GOOGLE_SEARCH") {
    const serving = (d.deliveryStatus ?? "").toUpperCase() === "SERVING";
    const eligible = (d.effectiveStatus ?? "").toUpperCase() === "ELIGIBLE";
    if (serving && eligible) return { text: "Delivering (Google: SERVING · ELIGIBLE)", delivering: true };
    return { text: `Configured ${d.configuredStatus ?? "?"} · Google says ${d.effectiveStatus ?? d.deliveryStatus ?? "unknown"}${d.policyStatus ? ` · policy ${d.policyStatus}` : ""}${d.issues.length ? ` · ${d.issues.join("; ")}` : ""}`, delivering: false };
  }
  const eff = (d.effectiveStatus ?? "").toUpperCase();
  const delivery = (d.deliveryStatus ?? "").toUpperCase();
  if (eff === "ACTIVE" && delivery === "ACTIVE") return { text: "Delivering (Meta: campaign aur ads effective status ACTIVE)", delivering: true };
  return { text: `Configured ${d.configuredStatus ?? "?"} · Meta review/delivery status: ${d.deliveryStatus ?? d.effectiveStatus ?? "unknown"}${d.policyStatus ? ` · ${d.policyStatus}` : ""}${d.issues.length ? ` · ${d.issues.join("; ")}` : ""}`, delivering: false };
}

/** Meta-only facts the card shows (doc 14 §18) — identities, readiness, creative, progress. Never a token. */
export interface MetaDeploymentFacts {
  pageId: string | null;
  pageName: string | null;
  instagramActorId: string | null;
  instagramUsername: string | null;
  /** From the last readiness check on the connection — the card must not imply a write permission it never verified. */
  readPermission: "READY" | "MISSING" | "UNVERIFIED";
  writePermission: "READY" | "MISSING" | "UNVERIFIED";
  /** Whether the ad account itself is assigned to the token's system user — a separate answer from the token's scope (doc 14 §28). */
  accountAccess: "READY" | "MISSING" | "UNVERIFIED";
  accessTier: string;
  objective: string | null;
  objectiveSupport: { supported: boolean; reason: string | null };
  resolvedAudienceSummary: string | null;
  resolvedPlacementSummary: string | null;
  creativePreviews: { mediaId: string; url: string; status: string; width: number; height: number }[];
  externalIds: { campaignId: string | null; adSetIds: string[]; creativeIds: string[]; adIds: string[] };
  checkpoint: string | null;
  deferredRules: string[];
}

export interface DeploymentRow {
  id: string;
  draftId: string;
  platform: DeploymentPlatform;
  phase: DeploymentPhase;
  status: DeploymentStatusKey;
  statusLabel: string;
  tone: DeploymentTone;
  /** Non-secret: label + id suffix, e.g. "BandhanTak main (…7890)". */
  accountDisplay: string | null;
  currency: string | null;
  campaignName: string | null;
  executionMarker: string;
  externalCampaignId: string | null;
  externalCampaignRef: string | null;
  externalStatus: string | null;
  /** Counts of what exists on the provider — never the objects themselves. Google: ad groups/keywords/ads; Meta: ad sets/creatives/ads. */
  externalCounts: { adGroups: number; keywords: number; ads: number } | null;
  dailyBudgetPaise: number | null;
  totalBudgetPaise: number | null;
  startAt: string | null;
  endAt: string | null;
  lastSyncedAt: string | null;
  pausedVerifiedAt: string | null;
  activatedAt: string | null;
  attemptCount: number;
  currentStep: string;
  steps: { key: DeploymentStepKey; label: string; state: DeploymentStepState }[];
  safeError: SafeExecutionError | null;
  /** Something changed on the provider outside BandhanTak (§17). */
  drift: string | null;
  availableActions: DeploymentActionKey[];
  /** The one card the admin can act on for this deployment right now. */
  pendingApprovalId: string | null;
  /** Configured vs effective/delivery/policy — separate on purpose (doc 14 Gap C). */
  delivery: DeliverySnapshot | null;
  /** Present on Meta rows only. */
  meta: MetaDeploymentFacts | null;
  events: DeploymentEventRow[];
}

/** The queue row's compact view — enough to pick a badge and decide the blocked-vs-question UI. */
export interface DeploymentSummary {
  id: string;
  platform: DeploymentPlatform;
  status: DeploymentStatusKey;
  /** The platform has no executor in this release — informational, never a block on the task. */
  notExecutableYet: boolean;
}

// ============================================================
// Creative media (doc 14 §7.3, §8) — the task detail's rows
// ============================================================

export const MEDIA_STATUSES = ["PENDING_REVIEW", "APPROVED", "REJECTED", "INVALID"] as const;
export type MediaStatusKey = (typeof MEDIA_STATUSES)[number];

export const MEDIA_STATUS_META: Record<MediaStatusKey, { label: string; tone: DeploymentTone }> = {
  PENDING_REVIEW: { label: "Uploaded — approve for Meta Ads", tone: "gold" },
  APPROVED: { label: "Approved for Meta Ads", tone: "trust" },
  REJECTED: { label: "Rejected", tone: "neutral" },
  INVALID: { label: "Invalid", tone: "danger" },
};

export interface CreativeMediaRow {
  id: string;
  creativeAssetId: string;
  publicUrl: string;
  mimeType: string;
  width: number;
  height: number;
  sizeBytes: number;
  sha256Prefix: string;
  source: string;
  status: MediaStatusKey;
  reviewedAt: string | null;
  /** Object storage + public base URL configured — a local-disk file never reaches a real Meta create (doc 14 §8). */
  productionReady: boolean;
  createdAt: string;
}

/** Feed placements accept 1.91:1 (landscape) through 4:5 (portrait); anything else is refused at upload. */
export const MEDIA_MIN_EDGE_PX = 600;
export const MEDIA_MAX_BYTES = 8 * 1024 * 1024;
export const MEDIA_ASPECT_MIN = 0.8; // 4:5
export const MEDIA_ASPECT_MAX = 1.91; // 1.91:1
export const MEDIA_ACCEPTED_MIME = ["image/jpeg", "image/png", "image/webp"] as const;

// ============================================================
// Approval card copy (§13, doc 14 §18)
// ============================================================

/** Button labels are never a generic "Approve" for a write action (§13). */
export function approvalButtonLabel(action: string, platform: DeploymentPlatform | null): string {
  const p = platform === "META" ? "Meta" : "Google";
  if (action === "CREATE_PAUSED_CAMPAIGNS") return `Create paused on ${p}`;
  if (action === "ACTIVATE_CAMPAIGNS") return `Activate ${p} campaign`;
  return "Approve Package";
}

export const CREATE_EXECUTION_EFFECT = "Creates provider objects in PAUSED state; no spend starts";
export const ACTIVATE_EXECUTION_EFFECT = "Campaign becomes eligible to serve and spend";
export const ACTIVATION_WARNING = "Approve karne par campaign live ho sakta hai aur ad spend start ho sakta hai.";

/** Meta cards (doc 14 §18) — the literal effect strings the typed payloads pin. */
export const META_CREATE_EXECUTION_EFFECT = "Meta par campaign, ad sets, creative aur ads PAUSED banenge. Is approval se ad spend start nahi hoga.";
export const META_ACTIVATION_ORDER = "ads -> adsets -> campaign" as const;
export const META_ACTIVATE_EXECUTION_EFFECT = "Campaign active hote hi spend ho sakta hai";
export const META_ACTIVATION_WARNING =
  "Approve karne par selected ads/ad sets active honge aur campaign sabse last mein active hoga. Campaign active hote hi spend ho sakta hai. Unsafe partial result par system campaign ko PAUSED rollback kar sakta hai.";
export const META_ROLLBACK_EFFECT =
  "Agar campaign activate hone ke baad read-back me hierarchy approved state se alag mile (missing ad/ad set, badla budget/URL/target), to system usi execution me campaign ko PAUSED kar dega aur row PARTIAL/FAILED_FINAL par rukegi. Ye compensation sirf is activation ke andar hai — koi general auto-pause nahi.";
