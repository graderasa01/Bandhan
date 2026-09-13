import type { CommandGoalInput, GuardrailFlag, MarketingChannel } from "@/lib/contracts/marketingAi";
import type { EvidenceSource, MarketingPlan } from "@/lib/contracts/marketingPlanSchema";

/**
 * Code decides, the model proposes — D-32 applied to a campaign package.
 *
 * Everything the model wrote passes through here before it is saved, and
 * every change is recorded as a `GuardrailFlag` the approval card shows.
 * The rules are the plan document's, made mechanical:
 *
 *   • Budget caps are the admin's numbers, never the model's (§5, §10). A
 *     package that spends past the cap is clamped to it; a package with no
 *     cap at all cannot be approved.
 *   • Copy may not guarantee, rush, shame or invent (§7, §14, D-61). An
 *     offending sentence is removed whole — a softened guarantee is still a
 *     guarantee.
 *   • Targeting may not name a religion, caste or community (§7).
 *   • A claim needs a source that was actually read this run (§14).
 *   • A price in copy must be a price the product charges today (§3.1).
 *   • Google's hard character limits are enforced here, because a headline
 *     the platform will reject is not a draft, it is a future error.
 *
 * Pure: no I/O, no model, no clock beyond the `today` it is handed — which
 * is what lets `scripts/marketing-ai-check.ts` pin every rule.
 */

export interface GuardrailInput {
  plan: MarketingPlan;
  /** The admin's structured fields — they win over anything the model extracted. */
  goalInput: CommandGoalInput | null;
  /**
   * What an earlier run settled for a continued goal. Fallbacks only, used
   * where the model's fresh extraction is null — so "ab ₹300/day" in a
   * revision beats a cap stored last week, and a revision that says nothing
   * about budget keeps it.
   */
  carried?: CommandGoalInput | null;
  /** The command text, used to verify the model did not invent a target. */
  requestText: string;
  availableSources: ReadonlySet<EvidenceSource>;
  /** Live plan/item prices in rupees — the only amounts copy may quote. */
  quotablePricesRupees: readonly number[];
  isKnownPublicPath: (path: string) => boolean;
}

export interface GuardrailResult {
  plan: MarketingPlan;
  flags: GuardrailFlag[];
  /** The caps that were applied — null when the admin gave none. */
  dailyCapRupees: number | null;
  totalCapRupees: number | null;
  /** True when a spend package exists but no cap does. The approval stays disabled until one is set. */
  budgetMissing: boolean;
}

// ============================================================
// Claim patterns
// ============================================================

/**
 * Guarantees, absolutes and fake certainty (D-61, §7).
 *
 * "100%" and "zero fake profiles" are here on purpose: the first live run
 * produced "100% Photo Verified Matrimony" and "Zero Fake Profiles" against
 * a context that showed zero verification requests in the window. An
 * absolute is a guarantee with a number on it.
 */
const GUARANTEE_PATTERNS = [
  /\bguarantee[ds]?\b/i,
  /\bguaranteed\b/i,
  /\bgaranti/i,
  /\b100\s*%/,
  /\bpakk[ai]\s+(shaadi|rishta|match)/i,
  /\b(shaadi|rishta)\s+(pakk[ai]|fix|confirm|tay)\b/i,
  /\bzaroor\s+(hogi|hoga|milega|milegi|milenge)\b/i,
  /\b(perfect|ideal)\s+match\s+(guaranteed|pakka|zaroor)/i,
  /\b(zero|no|koi)\s+(fake|fraud|scam)\b/i,
  /\bfake[- ]free\b/i,
  /\bzero\s+(privacy\s+)?risk\b/i,
  /\bno\s+(public\s+)?data\s+leaks?\b/i,
  /\b(har|every|all|sab|sabhi)\s+profiles?\s+(is\s+|are\s+)?(photo\s+|id\s+)?verified\b/i,
];

/** Fake urgency (D-61, §7). */
const URGENCY_PATTERNS = [
  /\bsirf\s+aaj\b/i,
  /\baaj\s+hi\s+last\b/i,
  /\blast\s+chance\b/i,
  /\bonly\s+today\b/i,
  /\bhurry\b/i,
  /\bjaldi\s+kar(o|ein|iye)\b/i,
  /\b\d+\s*(log|people)\s+(abhi|is waqt|right now)?\s*(dekh|watch|viewing)/i,
  /\b(seats?|slots?|spots?)\s+(bache|left|remaining|khatam)/i,
  /\blimited\s+(seats?|slots?|time\s+offer)/i,
  /\boffer\s+(khatam|ends)\s+(ho\s+raha|tonight|aaj)/i,
];

/** Fear, shame, family pressure, dowry (§7). */
const PRESSURE_PATTERNS = [
  /\bumar\s+nikal/i,
  /\bumr\s+nikal/i,
  /\bder\s+ho\s+(rahi|jayegi|gayi)/i,
  /\brishtedaar\s+kya\s+kahenge/i,
  /\blog\s+kya\s+kahenge/i,
  /\bbudhape\b/i,
  /\bakel[ei]\s+(reh|rah)\s+ja/i,
  /\bdahej\b/i,
  /\bdowry\b/i,
  /\bsharm\b/i,
];

/** Numbers about the user base that the context did not supply. */
const STATISTIC_PATTERNS = [
  /\b\d[\d,.]*\s*(lakh|lakhs|crore|crores|million|millions|k)\+?\s*(users?|members?|profiles?|rishte|shaadiy?an|families|couples|matches)\b/i,
  /\b(lakhs?|crores?|millions?|thousands?|hazaron|laakhon)\s+(of\s+)?(users?|members?|profiles?|rishte|shaadiy?an|families|couples|matches)\b/i,
  /\b\d[\d,.]*\s*\+?\s*(successful\s+)?(marriages|shaadiyan|matches|couples)\b/i,
];

/** "Trending"/"viral" — allowed only with a real comparison behind it. */
const TREND_PATTERNS = [/\btrending\b/i, /\bviral\b/i];

/** Religion, caste and community — never a targeting dimension (§7). Word-boundaried. */
const PROTECTED_TERMS = [
  "hindu",
  "hindus",
  "muslim",
  "muslims",
  "islam",
  "islamic",
  "sikh",
  "sikhs",
  "christian",
  "christians",
  "catholic",
  "jain",
  "jains",
  "buddhist",
  "parsi",
  "brahmin",
  "brahmins",
  "rajput",
  "rajputs",
  "jat",
  "jats",
  "yadav",
  "yadavs",
  "kayastha",
  "agarwal",
  "aggarwal",
  "baniya",
  "bania",
  "maratha",
  "marathas",
  "kshatriya",
  "vaishya",
  "shudra",
  "dalit",
  "dalits",
  "scheduled caste",
  "scheduled tribe",
  "obc",
  "gujjar",
  "gurjar",
  "kurmi",
  "kamma",
  "reddy",
  "nair",
  "iyer",
  "iyengar",
  "khatri",
  "arora",
  "patel",
  "marwari",
  "sindhi",
  "lingayat",
  "vokkaliga",
  "thakur",
  "chamar",
  "valmiki",
  "kumhar",
  "teli",
  "koli",
  "mahar",
  "ezhava",
  "vanniyar",
  "caste",
  "jaati",
  "jati",
  "gotra",
  "religion",
  "dharm",
];
const PROTECTED_RE = new RegExp(`\\b(${PROTECTED_TERMS.map((t) => t.replace(/\s+/g, "\\s+")).join("|")})\\b`, "i");

const RUPEE_RE = /(?:₹|rs\.?|inr)\s?([\d,]+(?:\.\d+)?)|\b([\d,]{3,})\s*(?:rupees|rupaye|rs)\b/gi;

// ============================================================
// Helpers
// ============================================================

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?।])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function parseAmount(raw: string): number | null {
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

interface CopyContext {
  flags: GuardrailFlag[];
  quotable: Set<number>;
  trendClaimsAllowed: boolean;
}

/** Why a sentence is not allowed in outward copy, or null when it is fine. */
function objection(sentence: string, ctx: CopyContext): string | null {
  if (GUARANTEE_PATTERNS.some((re) => re.test(sentence))) return "guarantee claim";
  if (URGENCY_PATTERNS.some((re) => re.test(sentence))) return "fake urgency";
  if (PRESSURE_PATTERNS.some((re) => re.test(sentence))) return "fear/shame/pressure";
  if (STATISTIC_PATTERNS.some((re) => re.test(sentence))) return "unverified statistic";
  if (!ctx.trendClaimsAllowed && TREND_PATTERNS.some((re) => re.test(sentence))) return "trend claim without comparison evidence";

  RUPEE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RUPEE_RE.exec(sentence)) !== null) {
    const amount = parseAmount(m[1] ?? m[2] ?? "");
    if (amount !== null && !ctx.quotable.has(amount)) return `price ₹${amount} is not a live price`;
  }
  return null;
}

/** Cleans one outward-facing string; returns the surviving text (possibly empty). */
function cleanText(text: string, path: string, ctx: CopyContext): string {
  const kept: string[] = [];
  for (const sentence of splitSentences(text)) {
    const why = objection(sentence, ctx);
    if (why) {
      ctx.flags.push({
        kind: why.startsWith("price") ? "PRICE_UNVERIFIED" : "CLAIM_REMOVED",
        path,
        detail: `${why}: "${sentence.slice(0, 90)}"`,
      });
      continue;
    }
    kept.push(sentence);
  }
  return kept.join(" ").trim();
}

/** Cleans an array of outward strings, dropping entries that end up empty. */
function cleanList(list: string[], path: string, ctx: CopyContext): string[] {
  const out: string[] = [];
  list.forEach((item, i) => {
    const cleaned = cleanText(item, `${path}[${i}]`, ctx);
    if (cleaned) out.push(cleaned);
  });
  return out;
}

function enforceLength(list: string[], max: number, path: string, flags: GuardrailFlag[]): string[] {
  return list.filter((s, i) => {
    if (s.length <= max) return true;
    flags.push({ kind: "LENGTH_DROPPED", path: `${path}[${i}]`, detail: `${s.length} chars > ${max}: "${s.slice(0, 60)}…"` });
    return false;
  });
}

function scrubTargeting(list: string[], path: string, flags: GuardrailFlag[]): string[] {
  return list.filter((item, i) => {
    if (!PROTECTED_RE.test(item)) return true;
    flags.push({ kind: "TARGETING_REMOVED", path: `${path}[${i}]`, detail: `protected characteristic in targeting: "${item.slice(0, 60)}"` });
    return false;
  });
}

// ============================================================
// The pass
// ============================================================

export function applyGuardrails(input: GuardrailInput): GuardrailResult {
  const flags: GuardrailFlag[] = [];
  // Deep copy so the model's raw response stays intact on the run record.
  const plan: MarketingPlan = JSON.parse(JSON.stringify(input.plan));
  const g = input.goalInput;

  // ---- 1. The admin's fields win -----------------------------------------
  if (g?.geography) plan.goal.geography = g.geography;
  if (g?.audienceSide) plan.goal.audienceSide = g.audienceSide;
  if (g?.windowDays) plan.goal.windowDays = g.windowDays;
  if (g?.primaryConversion) plan.goal.primaryConversion = g.primaryConversion;
  if (g?.stopLossRule) plan.goal.stopLossRule = g.stopLossRule;
  if (g?.channels && g.channels.length) plan.goal.channels = [...g.channels];

  // Target: admin-entered only. The model may echo a number the admin typed;
  // it may not produce one of its own.
  if (g?.target !== undefined) plan.goal.targetFromAdmin = g.target;
  else if (plan.goal.targetFromAdmin !== null) {
    const digits = String(Math.round(plan.goal.targetFromAdmin));
    if (!input.requestText.includes(digits)) {
      flags.push({ kind: "CLAIM_REMOVED", path: "goal.targetFromAdmin", detail: `target ${digits} was not stated by the admin — cleared` });
      plan.goal.targetFromAdmin = null;
    }
  }

  // What an earlier run settled fills only what is still empty.
  const carried = input.carried ?? null;
  if (carried) {
    if (!plan.goal.geography && carried.geography) plan.goal.geography = carried.geography;
    if (!plan.goal.channels.length && carried.channels?.length) plan.goal.channels = [...carried.channels];
    if (plan.goal.targetFromAdmin === null && carried.target !== undefined) plan.goal.targetFromAdmin = carried.target;
    if (!plan.goal.stopLossRule && carried.stopLossRule) plan.goal.stopLossRule = carried.stopLossRule;
  }

  // ---- 2. Budget caps ----------------------------------------------------
  const dailyCap = g?.dailyBudgetRupees ?? (plan.goal.dailyBudgetRupees ?? null);
  const totalCap = g?.totalBudgetRupees ?? (plan.goal.totalBudgetRupees ?? null);
  // Same invention check as the target: a cap the admin never typed is null.
  const capStated = (cap: number | null, path: string): number | null => {
    if (cap === null) return null;
    if (g?.dailyBudgetRupees === cap || g?.totalBudgetRupees === cap) return cap;
    const digits = String(Math.round(cap));
    if (input.requestText.replace(/,/g, "").includes(digits)) return cap;
    flags.push({ kind: "CLAIM_REMOVED", path, detail: `budget cap ₹${digits} was not stated by the admin — cleared` });
    return null;
  };
  // A carried cap was admin-entered on an earlier command; it needs no re-statement.
  const daily = capStated(dailyCap, "goal.dailyBudgetRupees") ?? carried?.dailyBudgetRupees ?? null;
  const total = capStated(totalCap, "goal.totalBudgetRupees") ?? carried?.totalBudgetRupees ?? null;
  plan.goal.dailyBudgetRupees = daily;
  plan.goal.totalBudgetRupees = total;

  const clamp = (value: number, cap: number | null, path: string): number => {
    if (cap === null || value <= cap) return round2(value);
    flags.push({ kind: "BUDGET_CLAMPED", path, detail: `₹${round2(value)} → ₹${cap} (admin cap)` });
    return cap;
  };

  plan.recommendedPlan.budget.dailyRupees = clamp(plan.recommendedPlan.budget.dailyRupees, daily, "recommendedPlan.budget.dailyRupees");
  plan.recommendedPlan.budget.totalRupees = clamp(plan.recommendedPlan.budget.totalRupees, total, "recommendedPlan.budget.totalRupees");
  if (g?.windowDays) plan.recommendedPlan.budget.windowDays = g.windowDays;

  // ---- 3. Channel constraints --------------------------------------------
  const allowed: MarketingChannel[] | null = g?.channels && g.channels.length ? g.channels : null;
  if (allowed && plan.googleSearch && !allowed.includes("GOOGLE_SEARCH")) {
    flags.push({ kind: "CHANNEL_DROPPED", path: "googleSearch", detail: "Google Search not in the admin's allowed channels" });
    plan.googleSearch = null;
  }
  const metaAllowed = !allowed || allowed.some((c) => c === "META_FEED" || c === "INSTAGRAM_REELS" || c === "INSTAGRAM_STORIES");
  if (plan.meta && !metaAllowed) {
    flags.push({ kind: "CHANNEL_DROPPED", path: "meta", detail: "No Meta channel in the admin's allowed channels" });
    plan.meta = null;
  }
  if (allowed) {
    plan.recommendedPlan.channelChoices = plan.recommendedPlan.channelChoices.filter((c) => {
      if (allowed.includes(c.channel)) return true;
      flags.push({ kind: "CHANNEL_DROPPED", path: "recommendedPlan.channelChoices", detail: `${c.channel} not allowed by admin` });
      return false;
    });
  }

  // ---- 4. Evidence and topics must come from data that was read ----------
  plan.evidence = plan.evidence.filter((e, i) => {
    if (input.availableSources.has(e.source)) return true;
    flags.push({ kind: "EVIDENCE_DROPPED", path: `evidence[${i}]`, detail: `source ${e.source} was not available this run: "${e.claim.slice(0, 80)}"` });
    return false;
  });
  plan.topics = plan.topics.map((t, i) => {
    if (t.rejected || input.availableSources.has(t.source)) return t;
    flags.push({ kind: "TOPIC_REJECTED", path: `topics[${i}]`, detail: `"${t.topic.slice(0, 60)}" cites ${t.source}, which was not read this run` });
    return { ...t, rejected: true, rejectionReason: `Source ${t.source} was not available in this run — no evidence behind the topic.` };
  });
  const trendClaimsAllowed = plan.topics.some((t) => !t.rejected && t.source === "google.search_console") && input.availableSources.has("google.search_console");

  const ctx: CopyContext = { flags, quotable: new Set(input.quotablePricesRupees.map(round2)), trendClaimsAllowed };
  // Budget figures may legitimately appear in copy about the campaign itself; nowhere in ads though — so they are not added.

  // ---- 5. Google package -------------------------------------------------
  if (plan.googleSearch) {
    const gs = plan.googleSearch;
    gs.dailyBudgetRupees = clamp(gs.dailyBudgetRupees, daily, "googleSearch.dailyBudgetRupees");
    gs.adGroups = gs.adGroups.map((ag, i) => {
      const base = `googleSearch.adGroups[${i}]`;
      const headlines = enforceLength(cleanList(ag.headlines, `${base}.headlines`, ctx), 30, `${base}.headlines`, flags);
      const descriptions = enforceLength(cleanList(ag.descriptions, `${base}.descriptions`, ctx), 90, `${base}.descriptions`, flags);
      if (headlines.length < 3 || descriptions.length < 2) {
        flags.push({ kind: "PACKAGE_INCOMPLETE", path: base, detail: `${headlines.length} headlines / ${descriptions.length} descriptions left after checks (Google needs ≥3 / ≥2)` });
      }
      return { ...ag, keywords: ag.keywords.filter((k) => !PROTECTED_RE.test(k.text)), headlines, descriptions };
    });
    gs.callouts = enforceLength(cleanList(gs.callouts, "googleSearch.callouts", ctx), 25, "googleSearch.callouts", flags);
    gs.sitelinks = gs.sitelinks
      .map((s, i) => ({ text: cleanText(s.text, `googleSearch.sitelinks[${i}].text`, ctx), path: s.path }))
      .filter((s, i) => {
        if (!s.text) return false;
        if (s.text.length > 25) {
          flags.push({ kind: "LENGTH_DROPPED", path: `googleSearch.sitelinks[${i}]`, detail: `${s.text.length} chars > 25` });
          return false;
        }
        if (!input.isKnownPublicPath(s.path)) {
          flags.push({ kind: "LANDING_UNKNOWN", path: `googleSearch.sitelinks[${i}].path`, detail: `${s.path} is not a public page` });
          return false;
        }
        return true;
      });
    if (!input.isKnownPublicPath(gs.landingPath)) {
      flags.push({ kind: "LANDING_UNKNOWN", path: "googleSearch.landingPath", detail: `${gs.landingPath} is not a public page — set to /register` });
      gs.landingPath = "/register";
    }
  }

  // ---- 6. Meta package ---------------------------------------------------
  if (plan.meta) {
    const m = plan.meta;
    m.dailyBudgetRupees = clamp(m.dailyBudgetRupees, daily, "meta.dailyBudgetRupees");
    m.audience.interests = scrubTargeting(m.audience.interests, "meta.audience.interests", flags);
    m.audience.exclusions = scrubTargeting(m.audience.exclusions, "meta.audience.exclusions", flags);
    m.audience.locations = scrubTargeting(m.audience.locations, "meta.audience.locations", flags);
    if (PROTECTED_RE.test(m.audience.description)) {
      flags.push({ kind: "TARGETING_REMOVED", path: "meta.audience.description", detail: "protected characteristic in audience description — sentence removed" });
      m.audience.description = splitSentences(m.audience.description)
        .filter((s) => !PROTECTED_RE.test(s))
        .join(" ");
    }
    m.audience.ageMin = Math.max(18, Math.round(m.audience.ageMin));
    m.audience.ageMax = Math.max(m.audience.ageMin, Math.round(m.audience.ageMax));

    // Ad set budgets must fit under the campaign's, which fits under the cap.
    const setTotal = m.adSets.reduce((s, a) => s + a.dailyBudgetRupees, 0);
    if (setTotal > m.dailyBudgetRupees && setTotal > 0) {
      const scale = m.dailyBudgetRupees / setTotal;
      m.adSets = m.adSets.map((a) => ({ ...a, dailyBudgetRupees: round2(a.dailyBudgetRupees * scale) }));
      flags.push({ kind: "BUDGET_CLAMPED", path: "meta.adSets", detail: `ad set budgets ₹${round2(setTotal)} scaled to ₹${m.dailyBudgetRupees}` });
    }

    m.ads = m.ads.map((ad, i) => {
      const base = `meta.ads[${i}]`;
      const headline = cleanText(ad.headline, `${base}.headline`, ctx);
      if (headline.length > 40) flags.push({ kind: "LENGTH_DROPPED", path: `${base}.headline`, detail: `${headline.length} chars > 40 (Meta truncates)` });
      return {
        ...ad,
        primaryText: cleanText(ad.primaryText, `${base}.primaryText`, ctx),
        headline,
        description: cleanText(ad.description, `${base}.description`, ctx),
      };
    });
    if (!input.isKnownPublicPath(m.landingPath)) {
      flags.push({ kind: "LANDING_UNKNOWN", path: "meta.landingPath", detail: `${m.landingPath} is not a public page — set to /register` });
      m.landingPath = "/register";
    }
  }

  // Combined daily spend across platforms also has to fit the cap.
  if (daily !== null) {
    const combined = (plan.googleSearch?.dailyBudgetRupees ?? 0) + (plan.meta?.dailyBudgetRupees ?? 0);
    if (combined > daily && combined > 0) {
      const scale = daily / combined;
      if (plan.googleSearch) plan.googleSearch.dailyBudgetRupees = round2(plan.googleSearch.dailyBudgetRupees * scale);
      if (plan.meta) {
        plan.meta.dailyBudgetRupees = round2(plan.meta.dailyBudgetRupees * scale);
        plan.meta.adSets = plan.meta.adSets.map((a) => ({ ...a, dailyBudgetRupees: round2(a.dailyBudgetRupees * scale) }));
      }
      flags.push({ kind: "BUDGET_CLAMPED", path: "googleSearch+meta", detail: `combined daily ₹${round2(combined)} scaled to the ₹${daily} cap` });
    }
  }

  // ---- 7. Creative package -----------------------------------------------
  if (plan.creative) {
    const c = plan.creative;
    c.hooks = c.hooks
      .map((h, i) => ({ ...h, text: cleanText(h.text, `creative.hooks[${i}].text`, ctx) }))
      .filter((h) => h.text);
    c.videos = c.videos.map((v, i) => {
      const base = `creative.videos[${i}]`;
      return {
        ...v,
        hook: cleanText(v.hook, `${base}.hook`, ctx),
        script: cleanText(v.script, `${base}.script`, ctx),
        storyboard: cleanList(v.storyboard, `${base}.storyboard`, ctx),
        onScreenText: cleanList(v.onScreenText, `${base}.onScreenText`, ctx),
        voiceover: cleanText(v.voiceover, `${base}.voiceover`, ctx),
        subtitleText: cleanText(v.subtitleText, `${base}.subtitleText`, ctx),
        coverText: cleanText(v.coverText, `${base}.coverText`, ctx),
        caption: cleanText(v.caption, `${base}.caption`, ctx),
        cta: cleanText(v.cta, `${base}.cta`, ctx),
        durationSec: [15, 30, 45].includes(v.durationSec) ? v.durationSec : 30,
      };
    });
    c.statics = c.statics.map((s, i) => {
      const base = `creative.statics[${i}]`;
      return {
        ...s,
        headline: cleanText(s.headline, `${base}.headline`, ctx),
        subline: cleanText(s.subline, `${base}.subline`, ctx),
        cta: cleanText(s.cta, `${base}.cta`, ctx),
      };
    });
    const concepts = new Set(c.videos.map((v) => v.concept));
    if (c.videos.length < 2 || concepts.size < 2) {
      flags.push({ kind: "PACKAGE_INCOMPLETE", path: "creative.videos", detail: `${c.videos.length} video concepts across ${concepts.size} distinct angle(s) — the package asks for genuinely different concepts` });
    }
    if (c.hooks.length < 3) flags.push({ kind: "PACKAGE_INCOMPLETE", path: "creative.hooks", detail: `${c.hooks.length} hooks (3 expected)` });
  } else if (plan.googleSearch || plan.meta) {
    flags.push({ kind: "PACKAGE_INCOMPLETE", path: "creative", detail: "campaign packages without a creative package" });
  }

  // ---- 8. Landing package ------------------------------------------------
  if (plan.landing) {
    const l = plan.landing;
    l.heroHeadline = cleanText(l.heroHeadline, "landing.heroHeadline", ctx);
    l.subCopy = cleanText(l.subCopy, "landing.subCopy", ctx);
    l.primaryCta = cleanText(l.primaryCta, "landing.primaryCta", ctx);
    l.trustProof = cleanList(l.trustProof, "landing.trustProof", ctx);
    l.verificationExplainer = cleanText(l.verificationExplainer, "landing.verificationExplainer", ctx);
    if (l.useExistingPage && !input.isKnownPublicPath(l.path)) {
      flags.push({ kind: "LANDING_UNKNOWN", path: "landing.path", detail: `${l.path} is not an existing public page` });
    }
    if (!l.useExistingPage) {
      flags.push({ kind: "LANDING_UNKNOWN", path: "landing.path", detail: `new page proposed at ${l.path} — website content changes need preview + approval (MKT-2)` });
    }
  }

  const budgetMissing = (plan.googleSearch !== null || plan.meta !== null) && daily === null && total === null;
  if (budgetMissing) {
    flags.push({ kind: "PACKAGE_INCOMPLETE", path: "goal.dailyBudgetRupees", detail: "no budget cap from the admin — the package can be read but not approved until one is set" });
  }

  return { plan, flags, dailyCapRupees: daily, totalCapRupees: total, budgetMissing };
}

/** Exposed for the check script: the sentence-level verdict, without a plan around it. */
export function objectionTo(sentence: string, quotablePricesRupees: readonly number[] = [], trendClaimsAllowed = false): string | null {
  return objection(sentence, { flags: [], quotable: new Set(quotablePricesRupees.map(round2)), trendClaimsAllowed });
}

/** Exposed for the check script: whether a targeting entry names a protected characteristic. */
export function isProtectedTargeting(entry: string): boolean {
  return PROTECTED_RE.test(entry);
}
