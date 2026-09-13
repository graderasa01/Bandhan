import type { MetaPackage } from "@/lib/contracts/marketingPlanSchema";
import type { MetaAdCreate, MetaAdSetCreate, MetaCampaignCreate, MetaCreativeCreate, MetaGeoLocations, MetaInterestMatch, MetaLocationMatch, MetaTargeting } from "@/lib/marketing/providers/metaAdsProvider";
import { ExecutionError } from "@/lib/services/marketing/execution/executionErrors";

/**
 * Approved `MetaPackage` → the exact Graph API requests for one PAUSED
 * campaign hierarchy (doc 14 §6, §11). Pure and deterministic: no database,
 * no network, same input → same output byte for byte, so the check script
 * pins every request shape.
 *
 * What it refuses to do:
 *   • guess a provider id — locations and interests arrive *resolved* from
 *     preflight (one match each) or the package is an error;
 *   • downgrade an objective — LEADS/SALES without conversion tracking and
 *     AWARENESS/ENGAGEMENT are errors with a revise instruction, never a
 *     silent switch to TRAFFIC (§6);
 *   • execute a placement outside the feed allow-list — Reels/Stories ads
 *     and ad sets are *deferred* by name and shown on the card (§8);
 *   • apply a rule it cannot honour — frequency cap, stop-loss and
 *     human-readable exclusions become `deferredRules`;
 *   • let Meta rewrite what was approved — every Advantage+ creative
 *     feature that alters the image or the copy is sent OPT_OUT, Advantage+
 *     audience is off (`advantage_audience: 0`) so the approved audience is
 *     a hard limit, and ad-set budget sharing is off so each ad set spends
 *     exactly its approved budget;
 *   • touch money as a float — rupees × 100 rounded once, then integers;
 *   • let JavaScript convert a date — `start_time`/`end_time` are composed
 *     from the calendar date and the account timezone's offset.
 *
 * Child identity: stable local keys (`AS01`, `CR01`, `AD01`) are indexed over
 * the *approved* package, whose spec hash is fixed on the deployment — a
 * reordered package is a different hash and a different deployment. Every
 * provider name carries `[BT:<marker>:<key>]`, which is what reconciliation
 * searches for; nothing is ever matched by array position on the provider.
 */

export const META_CAMPAIGN_OBJECTIVES = ["OUTCOME_TRAFFIC", "OUTCOME_LEADS", "OUTCOME_SALES", "OUTCOME_AWARENESS", "OUTCOME_ENGAGEMENT"] as const;

/** §6 — the executable delivery matrix. Anything not here is refused with a reason. */
export const META_OBJECTIVE_MATRIX: Record<string, { optimizationGoal: string; billingEvent: string; destinationType: string; needsConversion: boolean } | { draftOnly: string }> = {
  OUTCOME_TRAFFIC: { optimizationGoal: "LINK_CLICKS", billingEvent: "IMPRESSIONS", destinationType: "WEBSITE", needsConversion: false },
  OUTCOME_LEADS: { optimizationGoal: "OFFSITE_CONVERSIONS", billingEvent: "IMPRESSIONS", destinationType: "WEBSITE", needsConversion: true },
  OUTCOME_SALES: { optimizationGoal: "OFFSITE_CONVERSIONS", billingEvent: "IMPRESSIONS", destinationType: "WEBSITE", needsConversion: true },
  OUTCOME_AWARENESS: { draftOnly: "OUTCOME_AWARENESS is release me draft-only hai (reach/impressions matrix ke tests nahi) — OUTCOME_TRAFFIC par revise karein." },
  OUTCOME_ENGAGEMENT: { draftOnly: "OUTCOME_ENGAGEMENT is release me draft-only hai — OUTCOME_TRAFFIC par revise karein." },
};

/** The one fixed placement map (§11 "Placement strings convert through one fixed map"). */
export const META_PLACEMENT_MAP: Record<string, { platform: "facebook" | "instagram"; position: string; label: string }> = {
  facebook_feed: { platform: "facebook", position: "feed", label: "Facebook Feed" },
  facebook_feeds: { platform: "facebook", position: "feed", label: "Facebook Feed" },
  fb_feed: { platform: "facebook", position: "feed", label: "Facebook Feed" },
  instagram_feed: { platform: "instagram", position: "stream", label: "Instagram Feed" },
  instagram_stream: { platform: "instagram", position: "stream", label: "Instagram Feed" },
  ig_feed: { platform: "instagram", position: "stream", label: "Instagram Feed" },
};

export const META_CTA_ALLOWLIST: ReadonlySet<string> = new Set(["SIGN_UP", "LEARN_MORE", "GET_STARTED", "APPLY_NOW", "CONTACT_US"]);
export const META_SPECIAL_AD_CATEGORIES: ReadonlySet<string> = new Set(["NONE", "CREDIT", "EMPLOYMENT", "HOUSING", "ISSUES_ELECTIONS_POLITICS", "FINANCIAL_PRODUCTS_SERVICES"]);

/**
 * Advantage+ creative features that would change an approved static image
 * or its approved copy (doc 14 §11 "no automatic creative enhancements …
 * default opt-out"). The one-switch `standard_enhancements` bundle was
 * deprecated in v22.0 for per-feature opt-ins, so each is sent explicitly.
 * Names are from the v26.0 AdCreativeFeaturesSpec reference; the first real
 * paused smoke confirms Meta accepts all of them on a single-image link ad
 * (a refusal stops at the creative step — PARTIAL, nothing can spend).
 */
export const META_CREATIVE_FEATURE_OPT_OUTS = [
  "adapt_to_placement",
  "add_text_overlay",
  "description_automation",
  "image_animation",
  "image_background_gen",
  "image_templates",
  "image_touchups",
  "inline_comment",
  "site_extensions",
  "text_optimizations",
] as const;

export function creativeFeatureOptOuts(): Record<string, { enroll_status: "OPT_OUT" }> {
  return Object.fromEntries(META_CREATIVE_FEATURE_OPT_OUTS.map((feature) => [feature, { enroll_status: "OPT_OUT" as const }]));
}

export const META_AGE_MIN = 18;
export const META_AGE_MAX = 65;
export const META_HEADLINE_SOFT_MAX = 40;
export const META_PRIMARY_TEXT_SOFT_MAX = 125;
/** Below this an ad set is very likely under Meta's minimum daily budget for impressions billing in INR — a warning, since the exact floor is the account's. */
export const META_ADSET_DAILY_WARN_PAISE = 10_000;
const NAME_MAX = 255;

export interface MetaMapInput {
  adAccountId: string;
  marker: string;
  spec: MetaPackage;
  /** Base name + marker, already composed by `providerCampaignName()`. */
  providerCampaignName: string;
  /** The draft's approved daily budget in paise — the sum of executable ad-set budgets may not exceed it. */
  dailyBudgetPaise: number;
  timeZone: string;
  /** YYYY-MM-DD in the account timezone. */
  startDate: string;
  endDate: string;
  /** Human location string in the package → the ONE provider match preflight resolved. */
  resolvedLocations: Record<string, MetaLocationMatch>;
  resolvedInterests: Record<string, MetaInterestMatch>;
  pageId: string;
  /** Null when the package has no Instagram placement. */
  instagramActorId: string | null;
  finalUrl: string;
  /** Package creative concept id (`ads[].creativeId`, e.g. "static-1") → approved media. `imageHash` is null until the media step ran. */
  media: Record<string, { mediaId: string; imageHash: string | null }>;
  specialAdCategories: string[];
  specialAdCategoryCountry: string | null;
  /** Required for LEADS/SALES — from connection settings, never guessed. */
  conversion: { pixelId: string; customEventType: string } | null;
  /** Protected-characteristic predicate (guardrails' PROTECTED_RE) — injected so the mapper stays pure. */
  isProtectedTargeting: (entry: string) => boolean;
}

export interface MetaAdSetTemplate {
  key: string;
  name: string;
  /** Everything but `campaign_id`, which is known only after the campaign exists. */
  body: Omit<MetaAdSetCreate, "campaign_id">;
  adKeys: string[];
  placements: string[];
  dailyBudgetPaise: number;
}

export interface MetaCreativeTemplate {
  key: string;
  adKey: string;
  name: string;
  /** Package concept id and the media row that backs it. */
  conceptId: string;
  mediaId: string;
  /** Everything but `link_data.image_hash`, which is known only after the media step. */
  build: (imageHash: string) => MetaCreativeCreate;
}

export interface MetaAdTemplate {
  key: string;
  adSetKey: string;
  creativeKey: string;
  name: string;
  build: (adSetId: string, creativeId: string) => MetaAdCreate;
}

export interface MetaMapSummary {
  objective: string;
  optimizationGoal: string;
  billingEvent: string;
  destinationType: string;
  adSets: number;
  ads: number;
  creatives: number;
  adSetBudgetSumPaise: number;
  audienceSummary: string;
  placementSummary: string;
  usesInstagram: boolean;
}

export interface MetaMapResult {
  campaign: MetaCampaignCreate;
  adSets: MetaAdSetTemplate[];
  creatives: MetaCreativeTemplate[];
  ads: MetaAdTemplate[];
  activationOrder: ["ads", "adsets", "campaign"];
  summary: MetaMapSummary;
  warnings: string[];
  /** Package parts this release does not create — named for the card (§8). */
  deferred: string[];
  /** Package rules this release does not implement — named for the card (§11). */
  deferredRules: string[];
}

// ---- small pure helpers ------------------------------------------------------

export function rupeesToPaise(rupees: number): number {
  if (!Number.isFinite(rupees) || rupees < 0) throw new ExecutionError("INVALID_BUDGET", `budget rupees valid nahi: ${rupees}`);
  return Math.round(rupees * 100);
}

function cleanName(raw: string, fallback: string): string {
  const clean = raw.replace(/\s+/g, " ").replace(/[[\]]/g, "").trim() || fallback;
  return clean;
}

/** `<base> [BT:<marker>:<key>]`, kept under the provider name cap with the tag intact. */
export function childName(base: string, marker: string, key: string, fallback: string): string {
  const suffix = ` [${marker}:${key}]`;
  const clean = cleanName(base, fallback);
  const room = NAME_MAX - suffix.length;
  return `${clean.length > room ? clean.slice(0, room).trimEnd() : clean}${suffix}`;
}

export function childTag(marker: string, key: string): string {
  return `[${marker}:${key}]`;
}

export function nameCarriesChildTag(name: string | null | undefined, marker: string, key: string): boolean {
  return typeof name === "string" && name.includes(childTag(marker, key));
}

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * The timezone's UTC offset on a calendar day, as `±HH:MM` — from Intl, not
 * from `new Date("YYYY-MM-DD")` (whose timezone is the host's). Sampled at
 * noon UTC of that day so a DST edge cannot land on the wrong side.
 */
export function tzOffsetOn(timeZone: string, isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) throw new ExecutionError("INTERNAL_ERROR", `date YYYY-MM-DD nahi hai: ${isoDate}`);
  const instant = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0));
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" }).formatToParts(instant);
  const tzName = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const mm = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(tzName);
  if (!mm) return "+00:00";
  return `${mm[1]}${pad2(Number(mm[2]))}:${mm[3] ?? "00"}`;
}

/** ISO 8601 with the account offset: start of the first day, end of the last. */
export function metaStartTime(isoDate: string, timeZone: string): string {
  return `${isoDate}T00:00:00${tzOffsetOn(timeZone, isoDate)}`;
}
export function metaEndTime(isoDate: string, timeZone: string): string {
  return `${isoDate}T23:59:59${tzOffsetOn(timeZone, isoDate)}`;
}

export function normalisePlacement(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function gendersOf(spec: MetaPackage): number[] | undefined {
  const set = new Set(spec.audience.genders.map((g) => String(g).toLowerCase()));
  const specific = [...set].filter((g) => g !== "all");
  if (set.has("all") && specific.length) throw new ExecutionError("SPEC_INVALID", `audience.genders "${[...set].join(", ")}" inconsistent hai — ya "all" ya specific.`, { fix: "'Revise Package' me genders theek karwayein." });
  if (!specific.length) return undefined;
  const codes = new Set<number>();
  for (const g of specific) {
    if (g === "men") codes.add(1);
    else if (g === "women") codes.add(2);
    else throw new ExecutionError("SPEC_INVALID", `gender "${g}" allow-list me nahi hai`);
  }
  return codes.size === 2 ? undefined : [...codes];
}

// ---- the mapper ---------------------------------------------------------------

export function mapMetaPackage(input: MetaMapInput): MetaMapResult {
  const { spec, marker } = input;
  const act = input.adAccountId.trim();
  if (!/^act_\d+$/.test(act)) throw new ExecutionError("ACCOUNT_NOT_READY", `Meta ad account id "${act}" act_<digits> nahi hai`, { fix: "Connections → Meta Ads → Ad account ID." });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(input.endDate)) throw new ExecutionError("INTERNAL_ERROR", "schedule dates YYYY-MM-DD nahi hain");
  if (input.endDate <= input.startDate) throw new ExecutionError("INVALID_BUDGET", `schedule end ${input.endDate} start ${input.startDate} ke baad hona chahiye`, { fix: "'Revise Package' me schedule theek karwayein." });
  if (!input.pageId) throw new ExecutionError("META_PAGE_NOT_ASSIGNED", "Page ID nahi hai");
  if (!Number.isInteger(input.dailyBudgetPaise) || input.dailyBudgetPaise <= 0) throw new ExecutionError("INVALID_BUDGET", "draft daily budget 0/khaali hai");

  const warnings: string[] = [];
  const deferred: string[] = [];
  const deferredRules: string[] = [];

  // ---- objective (§6) ---------------------------------------------------------
  const matrix = META_OBJECTIVE_MATRIX[spec.objective];
  if (!matrix) throw new ExecutionError("SPEC_INVALID", `objective "${spec.objective}" allow-list me nahi hai`, { fix: "'Revise Package' me OUTCOME_TRAFFIC chunein." });
  if ("draftOnly" in matrix) throw new ExecutionError("SPEC_INVALID", matrix.draftOnly, { fix: "'Revise Package' me objective OUTCOME_TRAFFIC karwayein." });
  let promotedObject: MetaAdSetCreate["promoted_object"] | undefined;
  if (matrix.needsConversion) {
    if (!input.conversion) {
      throw new ExecutionError("INVALID_CONVERSION_ACTION", `${spec.objective} ke liye Meta Pixel/Dataset + event mapping chahiye, jo connection par set nahi hai — silent TRAFFIC conversion nahi hota.`, {
        fix: "Ya to Connections → Meta Ads me metaPixelId + metaConversionEvent set karein, ya 'Revise Package' me objective OUTCOME_TRAFFIC karwayein.",
      });
    }
    promotedObject = { pixel_id: input.conversion.pixelId, custom_event_type: input.conversion.customEventType };
  }

  // ---- special ad categories (§10 "never guessed by AI") ---------------------
  const cats = input.specialAdCategories.map((c) => c.trim().toUpperCase()).filter(Boolean);
  if (!cats.length) throw new ExecutionError("ACCOUNT_NOT_READY", "Special ad category configuration explicitly set nahi hai (NONE bhi ek jawab hai).", { fix: "Connections → Meta Ads → 'Special ad categories' me NONE ya sahi category likhein (policy review ke baad)." });
  for (const c of cats) if (!META_SPECIAL_AD_CATEGORIES.has(c)) throw new ExecutionError("ACCOUNT_NOT_READY", `special ad category "${c}" allow-list me nahi hai`, { fix: "Connections → Meta Ads → allowed values: NONE, HOUSING, EMPLOYMENT, CREDIT, ISSUES_ELECTIONS_POLITICS, FINANCIAL_PRODUCTS_SERVICES." });
  const nonNone = cats.filter((c) => c !== "NONE");
  const campaign: MetaCampaignCreate = {
    name: input.providerCampaignName,
    objective: spec.objective,
    status: "PAUSED",
    special_ad_categories: nonNone.length ? nonNone : ["NONE"],
    buying_type: "AUCTION",
    is_adset_budget_sharing_enabled: false,
  };
  if (nonNone.length) {
    if (!input.specialAdCategoryCountry) throw new ExecutionError("ACCOUNT_NOT_READY", "special ad category ke saath country chahiye", { fix: "Connections → Meta Ads → specialAdCategoryCountry (jaise IN)." });
    campaign.special_ad_category_country = [input.specialAdCategoryCountry.toUpperCase()];
  }

  // ---- audience → targeting (§10, §11) --------------------------------------
  const a = spec.audience;
  const ageMin = Math.round(a.ageMin);
  const ageMax = Math.round(a.ageMax);
  if (ageMin < META_AGE_MIN) throw new ExecutionError("GUARDRAIL_FAILED", `age_min ${ageMin} < ${META_AGE_MIN}`, { fix: "'Revise Package'." });
  if (ageMax > META_AGE_MAX || ageMax < ageMin) throw new ExecutionError("SPEC_INVALID", `age range ${ageMin}-${ageMax} valid nahi (max ${META_AGE_MAX})`, { fix: "'Revise Package'." });
  for (const entry of [...a.interests, ...a.locations, ...a.exclusions, a.description]) {
    if (entry && input.isProtectedTargeting(entry)) throw new ExecutionError("GUARDRAIL_FAILED", `protected characteristic targeting me: "${entry.slice(0, 60)}"`, { fix: "'Revise Package' — religion/caste/community/health targeting allowed nahi." });
  }
  const genders = gendersOf(spec);

  const geo: MetaGeoLocations = {};
  const geoNames: string[] = [];
  if (!a.locations.length) throw new ExecutionError("INVALID_GEO_OR_LANGUAGE", "package me koi location nahi hai", { fix: "'Revise Package' me city/state/India likhwayein." });
  const seenGeo = new Set<string>();
  for (const loc of a.locations) {
    const hit = input.resolvedLocations[loc];
    if (!hit) throw new ExecutionError("INVALID_GEO_OR_LANGUAGE", `location "${loc}" resolve nahi hui`, { fix: "'Revise Package' me location ka naam city/state/India ki tarah likhwayein." });
    const dedupe = `${hit.type}:${hit.key}`;
    if (seenGeo.has(dedupe)) continue;
    seenGeo.add(dedupe);
    if (hit.type === "city") (geo.cities ??= []).push({ key: hit.key });
    else if (hit.type === "region") (geo.regions ??= []).push({ key: hit.key });
    else if (hit.type === "country") (geo.countries ??= []).push((hit.countryCode ?? hit.key).toUpperCase());
    else throw new ExecutionError("INVALID_GEO_OR_LANGUAGE", `location "${loc}" ka type "${hit.type}" allow-list (city/region/country) me nahi hai`, { fix: "'Revise Package'." });
    geoNames.push(`${hit.name} (${hit.type} ${hit.key})`);
  }

  const interests: { id: string; name: string }[] = [];
  const seenInterest = new Set<string>();
  for (const name of a.interests) {
    const hit = input.resolvedInterests[name];
    if (!hit) throw new ExecutionError("INVALID_GEO_OR_LANGUAGE", `interest "${name}" resolve nahi hua`, { fix: "'Revise Package' me interest ka naam Meta ke interest list jaisa likhwayein, ya hata dein." });
    if (seenInterest.has(hit.id)) continue;
    seenInterest.add(hit.id);
    interests.push({ id: hit.id, name: hit.name });
  }
  if (a.exclusions.length) deferredRules.push(`Exclusions (${a.exclusions.join(", ")}) — provider audience ids nahi; is release me nahi lagte`);

  // ---- ad sets + ads (allow-listed placements, STATIC only) ------------------
  const usableAds = new Map<string, MetaPackage["ads"][number]>();
  for (const ad of spec.ads) {
    if (usableAds.has(ad.id)) throw new ExecutionError("SPEC_INVALID", `ad id "${ad.id}" package me do baar hai`);
    usableAds.set(ad.id, ad);
  }
  const adSets: MetaAdSetTemplate[] = [];
  const creatives: MetaCreativeTemplate[] = [];
  const ads: MetaAdTemplate[] = [];
  let adSetBudgetSum = 0;
  let usesInstagram = false;
  let adIndex = 0;
  const placementLines: string[] = [];

  spec.adSets.forEach((set, i) => {
    const where = `adSets[${i}] "${set.name}"`;
    const platforms = new Set<"facebook" | "instagram">();
    const fbPositions = new Set<string>();
    const igPositions = new Set<string>();
    const labels: string[] = [];
    const skipped: string[] = [];
    for (const raw of set.placements) {
      const p = normalisePlacement(raw);
      const hit = META_PLACEMENT_MAP[p];
      if (!hit) {
        skipped.push(raw);
        continue;
      }
      platforms.add(hit.platform);
      if (hit.platform === "facebook") fbPositions.add(hit.position);
      else igPositions.add(hit.position);
      if (!labels.includes(hit.label)) labels.push(hit.label);
    }
    if (skipped.length) deferred.push(`${where}: placements ${skipped.join(", ")} is release me nahi (sirf Facebook Feed / Instagram Feed)`);
    if (!platforms.size) {
      deferred.push(`${where}: koi supported feed placement nahi — ad set nahi banega`);
      return;
    }
    if (platforms.has("instagram") && !input.instagramActorId) {
      throw new ExecutionError("META_INSTAGRAM_NOT_ASSIGNED", `${where}: Instagram Feed placement hai par Instagram professional account assigned nahi`, { fix: "Connections → Instagram Professional → Page se linked IG user ID daalein aur 'Check ad creation readiness' chalayein; ya package se Instagram placement hatayein." });
    }

    // Ads of this set: STATIC only, with an approved media each.
    const setAdKeys: string[] = [];
    const staticAds: MetaPackage["ads"][number][] = [];
    for (const creativeId of set.creativeIds) {
      const matching = spec.ads.filter((ad) => ad.creativeId === creativeId);
      if (!matching.length) {
        deferred.push(`${where}: creative "${creativeId}" ka koi ad package me nahi`);
        continue;
      }
      for (const ad of matching) {
        if (ad.format !== "STATIC") {
          deferred.push(`${where}: ad "${ad.name}" (${ad.format}) — Reel/Story MKT-3 me; preview-only`);
          continue;
        }
        staticAds.push(ad);
      }
    }
    if (!staticAds.length) {
      deferred.push(`${where}: koi STATIC ad nahi — ad set nahi banega`);
      return;
    }

    const key = `AS${pad2(adSets.length + 1)}`;
    const dailyPaise = rupeesToPaise(set.dailyBudgetRupees);
    if (dailyPaise <= 0) throw new ExecutionError("INVALID_BUDGET", `${where}: daily budget 0 hai`, { fix: "'Revise Package'." });
    if (dailyPaise < META_ADSET_DAILY_WARN_PAISE) warnings.push(`${where}: ₹${dailyPaise / 100}/day Meta ke minimum daily budget se kam ho sakta hai — provider reject kare to budget badhayein`);
    adSetBudgetSum += dailyPaise;

    const targeting: MetaTargeting = {
      geo_locations: geo,
      age_min: ageMin,
      age_max: ageMax,
      ...(genders ? { genders } : {}),
      ...(interests.length ? { flexible_spec: [{ interests }] } : {}),
      publisher_platforms: [...platforms].sort(),
      ...(fbPositions.size ? { facebook_positions: [...fbPositions].sort() } : {}),
      ...(igPositions.size ? { instagram_positions: [...igPositions].sort() } : {}),
      targeting_automation: { advantage_audience: 0 },
    };
    if (platforms.has("instagram")) usesInstagram = true;

    const body: Omit<MetaAdSetCreate, "campaign_id"> = {
      name: childName(set.name, marker, key, `Ad set ${adSets.length + 1}`),
      status: "PAUSED",
      daily_budget: String(dailyPaise),
      billing_event: matrix.billingEvent,
      optimization_goal: matrix.optimizationGoal,
      bid_strategy: "LOWEST_COST_WITHOUT_CAP",
      destination_type: matrix.destinationType,
      start_time: metaStartTime(input.startDate, input.timeZone),
      end_time: metaEndTime(input.endDate, input.timeZone),
      targeting,
      ...(promotedObject ? { promoted_object: promotedObject } : {}),
    };

    for (const ad of staticAds) {
      const media = input.media[ad.creativeId];
      if (!media) throw new ExecutionError("CREATIVE_MISSING", `${where}: ad "${ad.name}" ke creative "${ad.creativeId}" ka koi approved image nahi`, { fix: "Task detail me is IMAGE creative par 'Attach image' → 'Approve image for Meta Ads'." });
      const cta = String(ad.cta).toUpperCase();
      if (!META_CTA_ALLOWLIST.has(cta)) throw new ExecutionError("SPEC_INVALID", `ad "${ad.name}": CTA "${ad.cta}" allow-list me nahi`, { fix: "'Revise Package'." });
      const primaryText = ad.primaryText.replace(/\s+/g, " ").trim();
      const headline = ad.headline.replace(/\s+/g, " ").trim();
      const description = ad.description.replace(/\s+/g, " ").trim();
      if (!primaryText || !headline) throw new ExecutionError("SPEC_INVALID", `ad "${ad.name}": primary text/headline khaali`, { fix: "'Revise Package'." });
      if (headline.length > META_HEADLINE_SOFT_MAX) warnings.push(`ad "${ad.name}": headline ${headline.length} chars > ${META_HEADLINE_SOFT_MAX} (Meta truncate karega)`);
      if (primaryText.length > META_PRIMARY_TEXT_SOFT_MAX) warnings.push(`ad "${ad.name}": primary text ${primaryText.length} chars > ${META_PRIMARY_TEXT_SOFT_MAX} ("see more" ke peeche jaayega)`);
      adIndex += 1;
      const adKey = `AD${pad2(adIndex)}`;
      const creativeKey = `CR${pad2(adIndex)}`;
      const includeInstagram = platforms.has("instagram") && !!input.instagramActorId;
      const creativeName = childName(ad.name, marker, creativeKey, `Creative ${adIndex}`);
      creatives.push({
        key: creativeKey,
        adKey,
        name: creativeName,
        conceptId: ad.creativeId,
        mediaId: media.mediaId,
        build: (imageHash: string): MetaCreativeCreate => ({
          name: creativeName,
          object_story_spec: {
            page_id: input.pageId,
            ...(includeInstagram ? { instagram_user_id: input.instagramActorId! } : {}),
            link_data: {
              image_hash: imageHash,
              link: input.finalUrl,
              message: primaryText,
              name: headline,
              ...(description ? { description } : {}),
              call_to_action: { type: cta, value: { link: input.finalUrl } },
            },
          },
          degrees_of_freedom_spec: { creative_features_spec: creativeFeatureOptOuts() },
        }),
      });
      const adName = childName(ad.name, marker, adKey, `Ad ${adIndex}`);
      ads.push({
        key: adKey,
        adSetKey: key,
        creativeKey,
        name: adName,
        build: (adSetId: string, creativeId: string): MetaAdCreate => ({ name: adName, adset_id: adSetId, creative: { creative_id: creativeId }, status: "PAUSED" }),
      });
      setAdKeys.push(adKey);
    }
    adSets.push({ key, name: body.name, body, adKeys: setAdKeys, placements: labels, dailyBudgetPaise: dailyPaise });
    placementLines.push(`${key} ${cleanName(set.name, key)}: ${labels.join(" + ")} · ₹${dailyPaise / 100}/day`);
  });

  if (!adSets.length) throw new ExecutionError("CREATIVE_MISSING", "package me koi executable (Facebook/Instagram Feed + STATIC ad) ad set nahi hai", { fix: "'Revise Package' me ek feed ad set + static ad banwayein; Reels/Stories MKT-3 me." });
  if (adSetBudgetSum > input.dailyBudgetPaise) {
    throw new ExecutionError("INVALID_BUDGET", `executable ad sets ka daily total ₹${adSetBudgetSum / 100} draft ke approved ₹${input.dailyBudgetPaise / 100}/day se zyada hai`, { fix: "'Revise Package' me ad set budgets kam karwayein." });
  }
  if (spec.frequencyCap?.trim()) deferredRules.push(`Frequency cap "${spec.frequencyCap.trim()}" — MKT-4; abhi provider par nahi lagta`);
  if (spec.stopLoss?.trim()) deferredRules.push(`Stop-loss "${spec.stopLoss.trim()}" — MKT-4; abhi manual rule hai`);

  const audienceSummary = `${geoNames.join(", ")} · ${ageMin}-${ageMax} · ${genders ? (genders[0] === 1 ? "men" : "women") : "all genders"}${interests.length ? ` · interests: ${interests.map((x) => `${x.name} (${x.id})`).join(", ")}` : " · broad (no interests)"}`;

  return {
    campaign,
    adSets,
    creatives,
    ads,
    activationOrder: ["ads", "adsets", "campaign"],
    summary: {
      objective: spec.objective,
      optimizationGoal: matrix.optimizationGoal,
      billingEvent: matrix.billingEvent,
      destinationType: matrix.destinationType,
      adSets: adSets.length,
      ads: ads.length,
      creatives: creatives.length,
      adSetBudgetSumPaise: adSetBudgetSum,
      audienceSummary,
      placementSummary: placementLines.join(" | "),
      usesInstagram,
    },
    warnings,
    deferred,
    deferredRules,
  };
}
