import { z } from "zod";

/**
 * Growth Saathi's decision contract (§14) — one schema, two jobs.
 *
 * The model is asked for JSON matching this shape (`toModelJsonSchema()`
 * turns it into the JSON Schema every provider client accepts), and the
 * reply is parsed back through the same object. Descriptions on fields are
 * read by the model, so they are written as instructions, not documentation.
 *
 * Money is in **rupees** here because that is the unit the admin typed and
 * the unit the model reasons in; storage converts to paise at the edge
 * (`taskService`). Nothing here is trusted as-is — `packageGuardrails.ts`
 * runs over the parsed plan before a byte of it is saved.
 */

export const EVIDENCE_SOURCES = [
  "bandhantak.growth",
  "bandhantak.plans",
  "bandhantak.lifecycle",
  "bandhantak.pages",
  "google.keyword_ideas",
  "google.search_console",
  "google.analytics",
  "google.ads",
  "meta.ads",
  "facebook.page",
  "instagram.media",
  "admin.command",
] as const;
export type EvidenceSource = (typeof EVIDENCE_SOURCES)[number];

const EvidenceSourceSchema = z.enum(EVIDENCE_SOURCES);

const EvidenceSchema = z.object({
  claim: z.string().describe("Ek line: kya observe hua. Sirf supplied data se."),
  source: EvidenceSourceSchema.describe("Kis data source se — sirf wo jo context me status ok/stale ke saath aaya ho."),
  window: z.string().describe("Time window jaise 'last 30 days (2026-08-13 → 2026-09-12)'."),
  geography: z.string().describe("'India', 'Jaipur', ya 'all' — jo data me hai."),
  value: z.string().describe("Number ya short value jaise '1,240 sessions'. Kabhi andaaza nahi."),
});

const ObjectiveSchema = z.enum([
  "COMPLETED_PROFILE",
  "LIVE_PROFILE",
  "VERIFIED_PROFILE",
  "PAID_SUBSCRIPTION",
  "PARTNER_SIGNUP",
  "RETURNING_INACTIVE_USER",
  "RISHTA_PROGRESSION",
]);

const ConversionEventSchema = z.enum([
  "landing_view",
  "registration_started",
  "registration_completed",
  "profile_completed",
  "profile_live",
  "verification_completed",
  "subscription_captured",
]);

const ChannelSchema = z.enum(["GOOGLE_SEARCH", "META_FEED", "INSTAGRAM_REELS", "INSTAGRAM_STORIES", "FACEBOOK_PAGE"]);

const GoalSchema = z.object({
  name: z.string().describe("Chhota goal naam, jaise 'Jaipur verified women profiles — 30 din'."),
  objective: ObjectiveSchema,
  geography: z.string().nullable().describe("City/state/'India'. Admin ne na bataya ho to null."),
  audienceSide: z.enum(["all", "men", "women", "family", "partner"]),
  windowDays: z.number().describe("Campaign window in days. Admin ne na bataya ho to 30."),
  primaryConversion: ConversionEventSchema.describe("Jis event par goal napega."),
  baseline: z
    .object({
      metric: z.string(),
      value: z.number().nullable().describe("Supplied data me ho to wahi number; warna null."),
      window: z.string(),
      source: EvidenceSourceSchema,
    })
    .nullable(),
  targetFromAdmin: z
    .number()
    .nullable()
    .describe("SIRF tab jab admin ne khud target number likha ho (command ya form me). Khud kabhi mat banao — null rakho."),
  dailyBudgetRupees: z.number().nullable().describe("SIRF admin ka diya hua daily cap. Khud mat banao — null rakho."),
  totalBudgetRupees: z.number().nullable().describe("SIRF admin ka diya hua total cap. Khud mat banao — null rakho."),
  channels: z.array(ChannelSchema).describe("Allowed channels — admin ne bataye ho to wahi, warna tumhari sifarish."),
  constraints: z.array(z.string()).describe("Brand/safety/admin constraints jo plan ne maane."),
  stopLossRule: z.string().describe("Jaise '₹1,500 spend ke baad zero completed profile ho to pause proposal'."),
});

const ChannelChoiceSchema = z.object({
  channel: ChannelSchema,
  reason: z.string().describe("Ye channel kyun — evidence ke saath."),
  budgetSharePct: z.number().describe("0-100; sab channels ka total 100."),
});

const RecommendedPlanSchema = z.object({
  goalSummary: z.string(),
  targetAudience: z.string().describe("Kaun, kahan, kis stage me — bina caste/religion targeting ke."),
  offer: z.string().describe("Value proposition — sirf wo jo product sach me deta hai (plans/items context se)."),
  channelChoices: z.array(ChannelChoiceSchema),
  testingPlan: z.array(z.string()).describe("Kya test hoga, kitne variants, kab faisla."),
  successConditions: z.array(z.string()),
  failureConditions: z.array(z.string()),
  budget: z.object({
    dailyRupees: z.number().describe("Admin ke cap ke andar."),
    totalRupees: z.number(),
    windowDays: z.number(),
  }),
});

const KeywordSchema = z.object({
  text: z.string(),
  matchType: z.enum(["EXACT", "PHRASE", "BROAD"]),
});

const AdGroupSchema = z.object({
  name: z.string(),
  theme: z.string().describe("Is ad group ka intent — jaise 'verified matrimony Jaipur'."),
  keywords: z.array(KeywordSchema).describe("5-15 keywords, evidence se; supplied keyword ideas prefer karo."),
  headlines: z.array(z.string()).describe("8-15 headlines, HAR EK 30 characters se kam. Alag-alag angles."),
  descriptions: z.array(z.string()).describe("3-4 descriptions, HAR EK 90 characters se kam."),
});

const UtmSchema = z.object({
  source: z.string().describe("google | facebook | instagram"),
  medium: z.string().describe("cpc | paid_social | organic_social"),
  campaign: z.string().describe("lowercase-with-dashes, jaise 'jaipur-verified-women-2026-09'."),
  content: z.string().describe("creative/hook id ke liye placeholder, jaise '{creative}'."),
});

/** Exported for MKT-2: a stored draft spec is re-parsed through this before any provider write. */
export const GoogleSearchPackageSchema = z.object({
  campaignName: z.string(),
  locations: z.array(z.string()).describe("Geo targets, jaise ['Jaipur, Rajasthan, India']."),
  language: z.string().describe("'Hindi' ya 'English' ya 'Hindi, English'."),
  network: z.enum(["SEARCH", "SEARCH_AND_PARTNERS"]),
  adGroups: z.array(AdGroupSchema).describe("2-4 ad groups, alag-alag intent."),
  negativeKeywords: z.array(z.string()).describe("Jaise 'free', 'dating', 'job' — jo galat intent laate hain."),
  sitelinks: z.array(z.object({ text: z.string().describe("25 chars se kam"), path: z.string().describe("Site ka path jaise '/how-it-works'") })),
  callouts: z.array(z.string()).describe("Har ek 25 chars se kam."),
  landingPath: z.string().describe("BandhanTak ka existing path — supplied pages list me se."),
  utm: UtmSchema,
  dailyBudgetRupees: z.number(),
  biddingStrategy: z.enum(["MAXIMIZE_CONVERSIONS", "MAXIMIZE_CLICKS", "TARGET_CPA", "MANUAL_CPC"]),
  targetCpaRupees: z.number().nullable(),
  conversionAction: ConversionEventSchema,
  rationale: z.string(),
});

const MetaAudienceSchema = z.object({
  description: z.string(),
  ageMin: z.number(),
  ageMax: z.number(),
  genders: z.array(z.enum(["all", "men", "women"])),
  locations: z.array(z.string()),
  interests: z.array(z.string()).describe("Interest/behaviour targeting — KABHI religion, caste ya community nahi."),
  exclusions: z.array(z.string()),
});

const MetaAdSetSchema = z.object({
  name: z.string(),
  audienceNote: z.string(),
  placements: z.array(z.string()).describe("Jaise 'instagram_reels', 'instagram_stories', 'facebook_feed'."),
  dailyBudgetRupees: z.number(),
  creativeIds: z.array(z.string()).describe("creative.videos / creative.statics ke ids."),
});

const MetaAdSchema = z.object({
  id: z.string(),
  name: z.string(),
  format: z.enum(["REEL", "STORY", "STATIC"]),
  primaryText: z.string().describe("125 chars ke andar ideally; koi guarantee/urgency nahi."),
  headline: z.string().describe("40 chars se kam."),
  description: z.string(),
  cta: z.enum(["SIGN_UP", "LEARN_MORE", "GET_STARTED", "APPLY_NOW", "CONTACT_US"]),
  creativeId: z.string(),
});

export const MetaPackageSchema = z.object({
  campaignName: z.string(),
  objective: z.enum(["OUTCOME_LEADS", "OUTCOME_TRAFFIC", "OUTCOME_AWARENESS", "OUTCOME_ENGAGEMENT", "OUTCOME_SALES"]),
  audience: MetaAudienceSchema,
  adSets: z.array(MetaAdSetSchema),
  ads: z.array(MetaAdSchema),
  landingPath: z.string(),
  utm: UtmSchema,
  schedule: z.object({ startDate: z.string().describe("YYYY-MM-DD"), endDate: z.string().describe("YYYY-MM-DD") }),
  frequencyCap: z.string().describe("Jaise '2 impressions / 7 days'."),
  stopLoss: z.string(),
  dailyBudgetRupees: z.number(),
  rationale: z.string(),
});

const HookAngleSchema = z.enum(["PROBLEM_RELIEF", "TRUST_PROOF", "PRODUCT_DEMO", "FAMILY_PERSPECTIVE"]);

const HookSchema = z.object({
  id: z.string().describe("hook-1, hook-2, hook-3"),
  text: z.string().describe("Pehle 1-2 second ki line."),
  angle: HookAngleSchema,
});

const VideoConceptSchema = z.object({
  id: z.string().describe("reel-1, reel-2, story-1, story-2"),
  format: z.enum(["REEL", "STORY"]),
  concept: HookAngleSchema.describe("Har video ka concept alag ho — sirf caption variant nahi."),
  hookId: z.string(),
  title: z.string(),
  hook: z.string(),
  script: z.string().describe("Poora bola jaane wala script, Hinglish, duration ke hisaab se."),
  storyboard: z.array(z.string()).describe("Shot-by-shot — har line ek shot."),
  onScreenText: z.array(z.string()),
  voiceover: z.string(),
  subtitleText: z.string(),
  musicMood: z.string().describe("Mood sirf — koi copyrighted track ka naam nahi."),
  coverText: z.string(),
  caption: z.string(),
  cta: z.string(),
  durationSec: z.number().describe("15, 30 ya 45."),
  utmContent: z.string(),
  complianceNotes: z.array(z.string()),
});

const StaticCreativeSchema = z.object({
  id: z.string().describe("static-1, static-2"),
  hookId: z.string(),
  headline: z.string(),
  subline: z.string(),
  visualDirection: z.string().describe("Kya dikhega — real product screens ya illustration; kabhi kisi user ki photo nahi."),
  cta: z.string(),
});

const CreativePackageSchema = z.object({
  hooks: z.array(HookSchema).describe("3 genuinely different hooks — synonyms nahi."),
  visualDirections: z.array(z.string()).describe("3 alag visual directions."),
  videos: z.array(VideoConceptSchema).describe("2 Reels + 2 Stories, sab alag concept."),
  statics: z.array(StaticCreativeSchema).describe("2 static creatives."),
  brandSafetyChecklist: z.array(z.string()),
});

const LandingPackageSchema = z.object({
  useExistingPage: z.boolean(),
  path: z.string().describe("Existing page ho to supplied list se; naya ho to proposed path."),
  heroHeadline: z.string(),
  subCopy: z.string(),
  primaryCta: z.string().describe("Ek hi CTA."),
  trustProof: z.array(z.string()).describe("Sirf sach — supplied numbers ya product facts."),
  verificationExplainer: z.string(),
  grioVoiceCta: z.boolean().describe("Grio voice profile CTA relevant hai ya nahi."),
  analyticsEvents: z.array(ConversionEventSchema),
  changesNeeded: z.array(z.string()).describe("Existing page me kya badalna hoga — khaali agar kuch nahi."),
});

const TopicScoreSchema = z.object({
  demandEvidence: z.number().describe("1-5"),
  relevance: z.number().describe("1-5"),
  audienceFit: z.number().describe("1-5"),
  productTruth: z.number().describe("1-5"),
  creativePotential: z.number().describe("1-5"),
  safety: z.number().describe("1-5"),
});

const TopicSchema = z.object({
  topic: z.string(),
  whyThisTopic: z.string(),
  source: EvidenceSourceSchema,
  geography: z.string(),
  window: z.string(),
  bandhantakAngle: z.string(),
  audience: z.string(),
  conversionGoal: ConversionEventSchema,
  scores: TopicScoreSchema,
  rejected: z.boolean(),
  rejectionReason: z.string().nullable(),
});

const ApprovalActionSchema = z.enum([
  "APPROVE_PACKAGE",
  "GENERATE_CREATIVES",
  "CREATE_PAUSED_CAMPAIGNS",
  "ACTIVATE_CAMPAIGNS",
  "PUBLISH_REEL",
  "PUBLISH_FACEBOOK_POST",
  "CHANGE_BUDGET",
  "PAUSE_CAMPAIGN",
  "PUBLISH_WEBSITE_CONTENT",
]);

export const MarketingPlanSchema = z.object({
  clarifyingQuestion: z
    .string()
    .nullable()
    .describe(
      "Agar koi ZAROORI cheez missing hai (budget cap, geography, goal) to ek hi chhota sawaal. Warna null. Sawaal set ho to baaki fields best-effort/khaali rakho.",
    ),
  diagnosis: z.string().describe("3-6 vaakya Hinglish: abhi kya ho raha hai, kahan rukta hai, kya karna chahiye."),
  evidence: z.array(EvidenceSchema).describe("Har claim ke saath source + window. Jo data nahi mila, uska claim nahi."),
  assumptions: z.array(z.string()),
  missingData: z.array(z.string()).describe("Kaunsa data nahi tha aur usse plan par kya asar hai."),
  goal: GoalSchema,
  recommendedPlan: RecommendedPlanSchema,
  topics: z.array(TopicSchema).describe("Scored topics (§7). Reject kiye hue bhi rakho, reason ke saath."),
  googleSearch: GoogleSearchPackageSchema.nullable().describe("Null agar Google Search channel allowed nahi ya sirf analysis maanga gaya."),
  meta: MetaPackageSchema.nullable().describe("Null agar Meta channels allowed nahi ya sirf analysis maanga gaya."),
  creative: CreativePackageSchema.nullable(),
  landing: LandingPackageSchema.nullable(),
  requestedToolCalls: z
    .array(z.object({ tool: z.string(), reason: z.string() }))
    .describe("Sirf supplied tool list ke naam. External write tools yahan aa sakte hain — wo approval ke bina chalenge nahi."),
  approvalsNeeded: z.array(
    z.object({
      action: ApprovalActionSchema,
      what: z.string(),
      budgetRupees: z.number().nullable(),
    }),
  ),
  successMetric: z.string().describe("Business outcome — cost per completed/verified profile jaisa; views/clicks nahi."),
  stopConditions: z.array(z.string()),
  nextReviewAt: z.string().describe("YYYY-MM-DD"),
});

export type MarketingPlan = z.infer<typeof MarketingPlanSchema>;
export type MarketingPlanGoal = MarketingPlan["goal"];
export type GoogleSearchPackage = NonNullable<MarketingPlan["googleSearch"]>;
export type MetaPackage = NonNullable<MarketingPlan["meta"]>;
export type CreativePackage = NonNullable<MarketingPlan["creative"]>;
export type LandingPackage = NonNullable<MarketingPlan["landing"]>;
export type PlanTopic = MarketingPlan["topics"][number];

/**
 * JSON Schema for the provider clients. Zod emits draft-2020-12 with a few
 * keywords the structured-output grammars reject or ignore (`$schema`,
 * numeric bounds) — stripped here so the same object works for Anthropic's
 * `output_config`, OpenAI's `response_format` and the Gemini converter.
 */
export function toModelJsonSchema(): Record<string, unknown> {
  const raw = z.toJSONSchema(MarketingPlanSchema) as Record<string, unknown>;
  return strip(raw) as Record<string, unknown>;
}

const DROP_KEYS = new Set(["$schema", "minimum", "maximum", "minLength", "maxLength", "minItems", "maxItems", "default"]);

function strip(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(strip);
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (DROP_KEYS.has(key)) continue;
      out[key] = strip(value);
    }
    return out;
  }
  return node;
}
