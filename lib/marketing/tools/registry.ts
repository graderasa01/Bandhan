import type { ApprovalActionKey, MarketingProviderKey, ToolCallRecord } from "@/lib/contracts/marketingAi";
import type { DeploymentPlatform } from "@/lib/contracts/marketingExecution";

/**
 * The allow-list (§4). One AI brain, explicit tools — and the tools are the
 * boundary, not the model's judgement. A capability that is not in this
 * list does not exist as far as Growth Saathi is concerned; the model may
 * *ask* for one by name in `requestedToolCalls`, and the server decides
 * whether that name is real, what tier it sits in, and whether this release
 * can run it at all.
 *
 * Tiers:
 *   READ_AUTO                 — run before every plan, no approval.
 *   CREATE_DRAFT              — writes BandhanTak-side drafts only.
 *   EXTERNAL_WRITE_APPROVAL   — touches a platform, money or public content;
 *                               runs only behind a matching `MarketingApproval`.
 *
 * `availableFrom` is the phase that ships the executor. MKT-1 executes the
 * read and draft tiers; every external write is listed so the admin sees the
 * whole shape now, and is refused until its phase exists.
 *
 * MKT-2 (doc 13 §18): an external write is executable only when its entry
 * says so *and* names the approval action and platform the executor must
 * see on the card. Tools are never LLM-callable mutations — the model may
 * propose a name in `requestedToolCalls`; only the approval executor
 * invokes the adapter, and only through `assertExecutableWrite()`.
 */

export type ToolTier = ToolCallRecord["tier"];

export interface ToolDefinition {
  name: string;
  tier: ToolTier;
  description: string;
  /** Which connection it needs; null for BandhanTak-internal reads. */
  provider: MarketingProviderKey | null;
  availableFrom: "MKT-1" | "MKT-2" | "MKT-3" | "MKT-4";
  /** External writes only: the exact approval action and platform that may run this tool. */
  write?: { approvalAction: ApprovalActionKey; platform: DeploymentPlatform | null; executable: boolean };
}

export const MARKETING_TOOLS: ToolDefinition[] = [
  // ---- §4.1 read tools — automatic --------------------------------------
  { name: "bandhantak.growth.read", tier: "READ_AUTO", description: "Growth Console snapshot — funnel, retention, revenue, marketplace supply, gates.", provider: null, availableFrom: "MKT-1" },
  { name: "bandhantak.funnel.read", tier: "READ_AUTO", description: "Signup → live → verified funnel for the window's cohort.", provider: null, availableFrom: "MKT-1" },
  { name: "bandhantak.conversions.read", tier: "READ_AUTO", description: "Registration, profile live, verification and subscription counts.", provider: null, availableFrom: "MKT-1" },
  { name: "bandhantak.lifecycle.preview", tier: "READ_AUTO", description: "Dry-run of the lifecycle nudges — how many users each campaign would reach, and why.", provider: null, availableFrom: "MKT-1" },
  { name: "bandhantak.plans.read", tier: "READ_AUTO", description: "Live plan prices and unlocks, live one-time items — the only prices copy may quote.", provider: null, availableFrom: "MKT-1" },
  { name: "google.keyword_ideas.read", tier: "READ_AUTO", description: "Keyword Planner ideas for approved seeds in a geography.", provider: "GOOGLE_ADS", availableFrom: "MKT-1" },
  { name: "google.keyword_metrics.read", tier: "READ_AUTO", description: "Historical metrics for the seed keywords themselves.", provider: "GOOGLE_ADS", availableFrom: "MKT-1" },
  { name: "google.search_console.read", tier: "READ_AUTO", description: "Queries, pages, opportunities and rising queries for the site.", provider: "SEARCH_CONSOLE", availableFrom: "MKT-1" },
  { name: "google.analytics.read", tier: "READ_AUTO", description: "GA4 landing pages, sources, funnel events, device and city breakdowns.", provider: "GOOGLE_ANALYTICS", availableFrom: "MKT-1" },
  { name: "google.ads.performance.read", tier: "READ_AUTO", description: "Existing Google Ads campaigns and search terms, last 30 days.", provider: "GOOGLE_ADS", availableFrom: "MKT-1" },
  { name: "meta.ads.performance.read", tier: "READ_AUTO", description: "Existing Meta campaigns, last 30 days.", provider: "META_ADS", availableFrom: "MKT-1" },
  { name: "facebook.page.read", tier: "READ_AUTO", description: "Page followers and recent post engagement.", provider: "FACEBOOK_PAGE", availableFrom: "MKT-1" },
  { name: "instagram.media.performance.read", tier: "READ_AUTO", description: "Recent Reels/posts with views, reach, saves, shares.", provider: "INSTAGRAM", availableFrom: "MKT-1" },
  { name: "connections.status.read", tier: "READ_AUTO", description: "Which accounts are connected, which need attention.", provider: null, availableFrom: "MKT-1" },

  // ---- §4.2 creation tools — automatic drafts ---------------------------
  { name: "strategy.create", tier: "CREATE_DRAFT", description: "Diagnosis + recommended plan, stored on the run.", provider: null, availableFrom: "MKT-1" },
  { name: "campaign.package.create", tier: "CREATE_DRAFT", description: "The whole package as BandhanTak-side drafts.", provider: null, availableFrom: "MKT-1" },
  { name: "google.campaign.draft", tier: "CREATE_DRAFT", description: "Google Search campaign spec as a CampaignDraft.", provider: null, availableFrom: "MKT-1" },
  { name: "meta.campaign.draft", tier: "CREATE_DRAFT", description: "Meta campaign spec as a CampaignDraft.", provider: null, availableFrom: "MKT-1" },
  { name: "ad.copy.create", tier: "CREATE_DRAFT", description: "Headlines, descriptions, primary texts.", provider: null, availableFrom: "MKT-1" },
  { name: "landing.copy.create", tier: "CREATE_DRAFT", description: "Landing page copy brief as a CreativeAsset.", provider: null, availableFrom: "MKT-1" },
  { name: "seo.brief.create", tier: "CREATE_DRAFT", description: "SEO brief from Search Console opportunities.", provider: null, availableFrom: "MKT-1" },
  { name: "reel.brief.create", tier: "CREATE_DRAFT", description: "Reel concept — hook, script, storyboard, caption.", provider: null, availableFrom: "MKT-1" },
  { name: "story.brief.create", tier: "CREATE_DRAFT", description: "Story concept.", provider: null, availableFrom: "MKT-1" },
  { name: "creative.variants.create", tier: "CREATE_DRAFT", description: "Genuinely different variants of one hook.", provider: null, availableFrom: "MKT-1" },
  { name: "video.generate", tier: "CREATE_DRAFT", description: "Provider-neutral video job from a brief.", provider: "VIDEO_PROVIDER", availableFrom: "MKT-3" },
  { name: "video.template_render", tier: "CREATE_DRAFT", description: "Deterministic template MP4 — the mandatory fallback.", provider: null, availableFrom: "MKT-3" },

  // ---- §4.3 external writes — approval required -------------------------
  // MKT-2A — Google Search, behind CREATE_PAUSED_CAMPAIGNS / ACTIVATE_CAMPAIGNS cards.
  { name: "google.campaign.create_paused", tier: "EXTERNAL_WRITE_APPROVAL", description: "Create the Google campaign, PAUSED.", provider: "GOOGLE_ADS", availableFrom: "MKT-2", write: { approvalAction: "CREATE_PAUSED_CAMPAIGNS", platform: "GOOGLE_SEARCH", executable: true } },
  { name: "google.campaign.activate", tier: "EXTERNAL_WRITE_APPROVAL", description: "Un-pause a created Google campaign — spend starts.", provider: "GOOGLE_ADS", availableFrom: "MKT-2", write: { approvalAction: "ACTIVATE_CAMPAIGNS", platform: "GOOGLE_SEARCH", executable: true } },
  // MKT-2B — Meta, behind the same two cards (doc 14 §17). Each switch went on only after its own gate passed in
  // scripts/marketing-meta-execution-check.ts: create_paused after the readiness, media, mapping, checkpoint and
  // no-duplicate cases; activate after the ads → ad sets → campaign-last, partial and rollback cases.
  { name: "meta.campaign.create_paused", tier: "EXTERNAL_WRITE_APPROVAL", description: "Create the Meta campaign/ad sets/ads, PAUSED.", provider: "META_ADS", availableFrom: "MKT-2", write: { approvalAction: "CREATE_PAUSED_CAMPAIGNS", platform: "META", executable: true } },
  { name: "meta.campaign.activate", tier: "EXTERNAL_WRITE_APPROVAL", description: "Un-pause a created Meta campaign — spend starts.", provider: "META_ADS", availableFrom: "MKT-2", write: { approvalAction: "ACTIVATE_CAMPAIGNS", platform: "META", executable: true } },
  { name: "instagram.reel.publish", tier: "EXTERNAL_WRITE_APPROVAL", description: "Publish a Reel to the connected professional account.", provider: "INSTAGRAM", availableFrom: "MKT-3", write: { approvalAction: "PUBLISH_REEL", platform: null, executable: false } },
  { name: "facebook.post.publish", tier: "EXTERNAL_WRITE_APPROVAL", description: "Publish a Page post.", provider: "FACEBOOK_PAGE", availableFrom: "MKT-3", write: { approvalAction: "PUBLISH_FACEBOOK_POST", platform: null, executable: false } },
  { name: "campaign.budget.change", tier: "EXTERNAL_WRITE_APPROVAL", description: "Change a live budget within the goal's cap.", provider: null, availableFrom: "MKT-4", write: { approvalAction: "CHANGE_BUDGET", platform: null, executable: false } },
  { name: "campaign.pause", tier: "EXTERNAL_WRITE_APPROVAL", description: "Pause a live campaign.", provider: null, availableFrom: "MKT-4", write: { approvalAction: "PAUSE_CAMPAIGN", platform: null, executable: false } },
  // Kept out of the ads-execution release on purpose (doc 13 §18) — content phase.
  { name: "website.content.publish", tier: "EXTERNAL_WRITE_APPROVAL", description: "Publish a landing-page change after preview.", provider: null, availableFrom: "MKT-3", write: { approvalAction: "PUBLISH_WEBSITE_CONTENT", platform: null, executable: false } },
];

const BY_NAME = new Map(MARKETING_TOOLS.map((t) => [t.name, t]));

export function toolByName(name: string): ToolDefinition | null {
  return BY_NAME.get(name) ?? null;
}

/**
 * The write gate. Returns the tool the executor may run for this approval
 * action on this platform, or null — the caller must refuse on null. It is
 * deliberately not derived from the action alone: a Google card must never
 * run the Meta adapter, and an action whose tool is registered but not yet
 * `executable` must never run anything (doc 13 §18).
 */
export function executableWriteTool(action: ApprovalActionKey, platform: DeploymentPlatform | null): ToolDefinition | null {
  for (const tool of MARKETING_TOOLS) {
    if (tool.tier !== "EXTERNAL_WRITE_APPROVAL" || !tool.write) continue;
    if (tool.write.approvalAction !== action || tool.write.platform !== platform) continue;
    return tool.write.executable ? tool : null;
  }
  return null;
}

/**
 * §4.4 — capabilities that must never appear above. Kept as data so the check
 * script can assert the registry stays clean when somebody adds a tool.
 */
export const NEVER_TOOL_PATTERNS: RegExp[] = [
  /sql/i,
  /secret|credential|token\.read|key\.export/i,
  /kyc|private|user\.read|profile\.read|chat|message\.read/i,
  /refund|payout|transfer|payment/i,
  /moderation\.override|safety\.override/i,
  /delete|purge/i,
  /ranking|match\.score/i,
  /testimonial|review\.create|profile\.create/i,
];

// ============================================================
// Recording — every call, whether it worked or not
// ============================================================

export interface ToolRun {
  records: ToolCallRecord[];
}

export function newToolRun(): ToolRun {
  return { records: [] };
}

export type ToolOutcome<T> = { ok: true; value: T } | { ok: false; error: unknown };

/**
 * Runs one registered tool and records it. Throws synchronously — before
 * anything upstream is touched — if the name is not in the registry or is
 * not a read tool: a read path that can be talked into running a write tool
 * is not a boundary.
 */
export async function runReadTool<T>(run: ToolRun, name: string, fn: () => Promise<T>, rowsOf?: (value: T) => number): Promise<ToolOutcome<T>> {
  const def = toolByName(name);
  if (!def) throw new Error(`[marketing:tools] "${name}" registry me nahi hai.`);
  if (def.tier !== "READ_AUTO") throw new Error(`[marketing:tools] "${name}" read tool nahi hai (${def.tier}).`);

  const started = Date.now();
  try {
    const value = await fn();
    run.records.push({ tool: name, tier: def.tier, ok: true, ms: Date.now() - started, error: null, rows: rowsOf ? rowsOf(value) : null });
    return { ok: true, value };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    run.records.push({ tool: name, tier: def.tier, ok: false, ms: Date.now() - started, error: message.slice(0, 200), rows: null });
    return { ok: false, error };
  }
}

/** Records a draft-tier tool the persister used, so the run's audit lists creations too. */
export function recordDraftTool(run: ToolRun, name: string, rows: number): void {
  const def = toolByName(name);
  if (!def || def.tier !== "CREATE_DRAFT") throw new Error(`[marketing:tools] "${name}" draft tool nahi hai.`);
  run.records.push({ tool: name, tier: def.tier, ok: true, ms: 0, error: null, rows });
}
