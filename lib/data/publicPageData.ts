// M01 UI-only public pages provider.
// Future CMS/admin module (M10) should replace this mock source with real content service data,
// keeping the same typed ViewModel contracts so UI pages don't change.
//
// Unlike the rest of the app, these marketing-copy pages have no "api" mode
// to switch to yet — there is no real content service behind them, M10 or
// otherwise — so they always serve the mock copy regardless of
// NEXT_PUBLIC_DATA_MODE. Before this was a hard throw on "api" mode, which
// crashed static generation for every page in this file the moment a real
// deploy set NEXT_PUBLIC_DATA_MODE=api.
import type { HomePageViewModel, HowItWorksViewModel, PricingPageViewModel, PartnerProgramViewModel, SafetyPageViewModel, LoginPageViewModel, RegisterPageViewModel, PartnerRegisterViewModel, PartnerPendingViewModel } from "@/lib/contracts/publicPages";
import {
  mockHomePageData, mockHowItWorksData, mockPricingData, mockPartnerProgramData, mockSafetyPageData, mockLoginPageData, mockRegisterPageData, mockRegisterPageDataWithRef, mockPartnerRegisterData, mockPartnerPendingData,
  mockHomePageDataEn, mockHowItWorksDataEn, mockPricingDataEn, mockPartnerProgramDataEn, mockSafetyPageDataEn, mockLoginPageDataEn, mockRegisterPageDataEn, mockRegisterPageDataWithRefEn, mockPartnerRegisterDataEn, mockPartnerPendingDataEn,
} from "@/lib/mock/publicPageMock";
import { getPlanPreviews, getCommissionDisplayText } from "./planData";
import { getAllPlans } from "@/lib/services/plans/planService";
import { getLocale } from "@/lib/i18n/server";
import { createTranslate } from "@/lib/i18n/translate";

// Plan prices and the commission rate are real Prisma now (lib/data/planData.ts)
// regardless of data mode — same precedent as partnerData.ts. Everything else
// on these pages is still M01 marketing mock copy, now duplicated hi/en in
// publicPageMock.ts because these pages are built almost entirely from this
// data rather than inline JSX — `t()` alone can't reach it.
export async function getHomePageData(): Promise<HomePageViewModel> {
  const locale = await getLocale();
  const t = createTranslate(locale);
  const [pricingPreview, commissionText] = await Promise.all([getPlanPreviews(t), getCommissionDisplayText(t)]);
  const source = locale === "en" ? mockHomePageDataEn : mockHomePageData;
  return {
    ...source,
    pricingPreview,
    // The "Lifetime Commission" bullet quotes the rate, so it has to come from
    // the same place /partner-program's does. It was a hardcoded "₹100" until
    // commission became a percentage, at which point the homepage was quietly
    // advertising a number that no longer existed.
    partnerPreview: {
      ...source.partnerPreview,
      benefits: source.partnerPreview.benefits.map((b) =>
        b.title === "Lifetime Commission" ? { ...b, description: commissionText } : b,
      ),
    },
  };
}
export async function getHowItWorksData(): Promise<HowItWorksViewModel> {
  return (await getLocale()) === "en" ? mockHowItWorksDataEn : mockHowItWorksData;
}
export async function getPricingData(): Promise<PricingPageViewModel> {
  const locale = await getLocale();
  const t = createTranslate(locale);
  const [plans, allPlans] = await Promise.all([getPlanPreviews(t), getAllPlans(t)]);
  return {
    ...(locale === "en" ? mockPricingDataEn : mockPricingData),
    plans,
    comparisonPlans: allPlans
      .filter((p) => p.isActive && p.isPublic)
      .map((p) => ({
        code: p.code,
        name: p.name,
        price: `₹${(p.priceInPaise / 100).toLocaleString("en-IN")}`,
        features: p.features,
      })),
  };
}
export async function getPartnerProgramData(): Promise<PartnerProgramViewModel> {
  const locale = await getLocale();
  const commissionText = await getCommissionDisplayText(createTranslate(locale));
  const source = locale === "en" ? mockPartnerProgramDataEn : mockPartnerProgramData;
  return {
    ...source,
    commissionTransparency: {
      ...source.commissionTransparency,
      example: { ...source.commissionTransparency.example, commission: commissionText },
    },
  };
}
export async function getSafetyPageData(): Promise<SafetyPageViewModel> {
  return (await getLocale()) === "en" ? mockSafetyPageDataEn : mockSafetyPageData;
}
export async function getLoginPageData(): Promise<LoginPageViewModel> {
  return (await getLocale()) === "en" ? mockLoginPageDataEn : mockLoginPageData;
}
export async function getRegisterPageData(ref?: string | null): Promise<RegisterPageViewModel> {
  const en = (await getLocale()) === "en";
  if (ref) return en ? mockRegisterPageDataWithRefEn(ref) : mockRegisterPageDataWithRef(ref);
  return en ? mockRegisterPageDataEn : mockRegisterPageData;
}
export async function getPartnerRegisterData(): Promise<PartnerRegisterViewModel> {
  return (await getLocale()) === "en" ? mockPartnerRegisterDataEn : mockPartnerRegisterData;
}
export async function getPartnerPendingData(): Promise<PartnerPendingViewModel> {
  return (await getLocale()) === "en" ? mockPartnerPendingDataEn : mockPartnerPendingData;
}
