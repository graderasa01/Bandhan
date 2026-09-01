/** M01X / M01C — Public marketing / auth page contracts */
import type { UIAction, MoneyModel, MockMeta } from "./common";

export type PublicPageMeta = { pageTitle: string; pageDescription: string; mockMeta: MockMeta };

export type HomePageViewModel = {
  meta: PublicPageMeta;
  hero: { headline: string; subheadline: string; primaryCTA: UIAction; secondaryCTA: UIAction };
  howItWorks: { step: number; title: string; description: string }[];
  trustCards: { title: string; description: string }[];
  aiProfileBuilder: { headline: string; description: string; methods: { title: string; description: string; icon?: string }[]; cta: UIAction };
  biodataAutofill: { headline: string; description: string; cta: UIAction };
  verifiedProfile: { headline: string; description: string; points: string[] };
  partnerPreview: {
    headline: string;
    description: string;
    benefits: { title: string; description: string }[];
    cta: UIAction;
    /** Null only when the catalogue has no sellable plan to compute from. */
    earnings: PartnerEarningsViewModel | null;
  };
  safetyPreview: { headline: string; description: string; points: string[] };
  finalCTA: { headline: string; description: string; primaryCTA: UIAction; secondaryCTA: UIAction };
};

/**
 * D-12 earnings illustration on the home page's partner section.
 *
 * Every figure here is derived — plan prices from the live catalogue, the rate
 * from `PartnerCommissionConfig` — because commission is a PERCENTAGE of what
 * the member paid, not a flat fee. This model exists because the section used
 * to print a hardcoded "flat ₹100 — plan koi bhi ho", which stopped being
 * true the day D-12 was revised and would go stale again the moment an admin
 * moves a price from /admin/pricing or the rate from /admin/partners.
 */
export type PartnerEarningsViewModel = {
  /** Base rate as copy, e.g. "10%". */
  rateDisplay: string;
  /** The plan the headline figure is computed on — named on the card, so the
   *  number is never read as a promise about every plan. */
  headlinePlanName: string;
  /** Monthly commission on that plan, in rupees, for the animated counter. */
  headlineRupees: number;
  /** 0 for a whole-rupee figure, 2 when there are paise — so the counter and
   *  the rows underneath cannot disagree about ₹199.90 vs ₹200. */
  headlineDecimals: number;
  /** The same figure as copy, for the month rows. */
  headlineDisplay: string;
  /** "Standard plan par 10% commission" — composed here because `t()` has no
   *  interpolation, so a locale needs the pieces, not the sentence. */
  basisLine: string;
  /** Every public paid plan — what one month on it pays at the base rate. */
  perPlan: { name: string; priceDisplay: string; commissionDisplay: string }[];
  /** Footnote: the rate, the Gold ceiling, and (when it applies) the D-13
   *  first-month price the referred user actually gets. */
  note: string;
};

export type HowItWorksViewModel = {
  meta: PublicPageMeta;
  hero: { headline: string; description: string };
  steps: { step: number; title: string; description: string; icon?: string }[];
  finalCTA: UIAction;
};

/**
 * D-13 mandatory copy — the two lines ALWAYS render together:
 *   "Partner code se pehla mahina sirf ₹499. Uske baad ₹999/month."
 * Showing only the discounted price is named as a dark pattern in D-13,
 * so the model has no way to express one line without the other.
 */
export type PartnerOfferModel = { firstMonth: string; thereafter: string };

/**
 * An admin-run, time-boxed offer (see `PlanOffer`). When one is live, `price`
 * is what the user pays today and `originalPrice` is the list price it is
 * struck through against.
 *
 * `endsAt` is required, not optional: the same rule D-13 set for the partner
 * discount applies to every offer — a price that is only true until Sunday has
 * to say so on the card, or the first renewal is a surprise nobody agreed to.
 */
export type PlanOfferModel = { label: string; endsAt: string; isFree: boolean };

export type PlanPreviewViewModel = {
  id: string; name: string; price: MoneyModel; originalPrice?: MoneyModel;
  duration: string; features: string[]; limitations?: string[];
  isRecommended?: boolean; partnerOffer?: PartnerOfferModel; offer?: PlanOfferModel;
};

import type { ComparisonPlan } from "@/components/subscription/PlanComparisonTable";

export type PricingPageViewModel = {
  meta: PublicPageMeta;
  hero: { headline: string; description: string };
  plans: PlanPreviewViewModel[];
  /** Every plan with its resolved capability set — the comparison table is
   *  built from these rather than a code constant, so it stays honest about
   *  admin edits and can show plans an admin created. */
  comparisonPlans: ComparisonPlan[];
  partnerDiscountNote: string;
  paymentSafetyNote: string;
  faq: { q: string; a: string }[];
  finalCTA: UIAction;
};

export type PartnerType = {
  id: string;
  title: string;
  description: string;
  icon?: string;
};

export type PartnerProgramViewModel = {
  meta: PublicPageMeta;
  hero: { headline: string; description: string; cta: UIAction };
  whoCanBecome: { headline: string; description: string; types: PartnerType[] };
  howItWorks: { step: number; title: string; description: string }[];
  benefits: { title: string; description: string; icon?: string }[];
  commissionTransparency: { headline: string; description: string; example: { plan: string; commission: string }; notes: string[] };
  approvalProcess: { headline: string; description: string; steps: string[] };
  trustAndPrivacy: { headline: string; points: string[] };
  faq: { q: string; a: string }[];
  finalCTA: UIAction;
};

export type SafetyPageViewModel = {
  meta: PublicPageMeta;
  sections: { title: string; content: string; icon?: string }[];
  report: { headline: string; description: string; cta: UIAction };
};

export type LoginPageViewModel = {
  meta: PublicPageMeta;
  fields: string[];
  submitLabel: string;
  registerLink: UIAction;
  forgotPasswordLabel: string;
  partnerCTA: { label: string; href: string };
  safetyNote: string;
};

export type RegisterPageViewModel = {
  meta: PublicPageMeta;
  referralCode?: string | null;
  referralMessage?: string;
  fields: string[];
  submitLabel: string;
  loginLink: UIAction;
  partnerCTA: { label: string; description: string; href: string };
  privacyNote: string;
};

export type PartnerRegisterViewModel = {
  meta: PublicPageMeta;
  hero: { headline: string; description: string };
  partnerTypes: { value: string; label: string }[];
  submitLabel: string;
  pendingLink: UIAction;
  approvalNote: string;
  fields: string[];
};

export type PartnerPendingViewModel = {
  meta: PublicPageMeta;
  heading: string;
  message: string;
  explanation: string;
  nextSteps: string[];
  primaryAction: UIAction;
  secondaryAction: UIAction;
};
