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
import { mockHomePageData, mockHowItWorksData, mockPricingData, mockPartnerProgramData, mockSafetyPageData, mockLoginPageData, mockRegisterPageData, mockRegisterPageDataWithRef, mockPartnerRegisterData, mockPartnerPendingData } from "@/lib/mock/publicPageMock";
import { getPlanPreviews, getCommissionDisplayText } from "./planData";

// Plan prices and the commission rate are real Prisma now (lib/data/planData.ts)
// regardless of data mode — same precedent as partnerData.ts. Everything else
// on these pages is still M01 marketing mock copy.
export async function getHomePageData(): Promise<HomePageViewModel> {
  const [pricingPreview, commissionText] = await Promise.all([getPlanPreviews(), getCommissionDisplayText()]);
  return {
    ...mockHomePageData,
    pricingPreview,
    // The "Lifetime Commission" bullet quotes the rate, so it has to come from
    // the same place /partner-program's does. It was a hardcoded "₹100" until
    // commission became a percentage, at which point the homepage was quietly
    // advertising a number that no longer existed.
    partnerPreview: {
      ...mockHomePageData.partnerPreview,
      benefits: mockHomePageData.partnerPreview.benefits.map((b) =>
        b.title === "Lifetime Commission" ? { ...b, description: commissionText } : b,
      ),
    },
  };
}
export async function getHowItWorksData(): Promise<HowItWorksViewModel> { return mockHowItWorksData; }
export async function getPricingData(): Promise<PricingPageViewModel> {
  return { ...mockPricingData, plans: await getPlanPreviews() };
}
export async function getPartnerProgramData(): Promise<PartnerProgramViewModel> {
  return {
    ...mockPartnerProgramData,
    commissionTransparency: {
      ...mockPartnerProgramData.commissionTransparency,
      example: { ...mockPartnerProgramData.commissionTransparency.example, commission: await getCommissionDisplayText() },
    },
  };
}
export async function getSafetyPageData(): Promise<SafetyPageViewModel> { return mockSafetyPageData; }
export async function getLoginPageData(): Promise<LoginPageViewModel> { return mockLoginPageData; }
export async function getRegisterPageData(ref?: string | null): Promise<RegisterPageViewModel> { return ref ? mockRegisterPageDataWithRef(ref) : mockRegisterPageData; }
export async function getPartnerRegisterData(): Promise<PartnerRegisterViewModel> { return mockPartnerRegisterData; }
export async function getPartnerPendingData(): Promise<PartnerPendingViewModel> { return mockPartnerPendingData; }
