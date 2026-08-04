// M01 UI-only public pages provider.
// Future CMS/admin module (M10) should replace this mock source with real content service data,
// keeping the same typed ViewModel contracts so UI pages don't change.
import { getDataMode } from "./dataMode";
import type { HomePageViewModel, HowItWorksViewModel, PricingPageViewModel, PartnerProgramViewModel, SafetyPageViewModel, LoginPageViewModel, RegisterPageViewModel, PartnerRegisterViewModel, PartnerPendingViewModel } from "@/lib/contracts/publicPages";
import { mockHomePageData, mockHowItWorksData, mockPricingData, mockPartnerProgramData, mockSafetyPageData, mockLoginPageData, mockRegisterPageData, mockRegisterPageDataWithRef, mockPartnerRegisterData, mockPartnerPendingData } from "@/lib/mock/publicPageMock";
import { getPlanPreviews, getCommissionDisplayText } from "./planData";

function checkApi(): never { throw new Error("API data mode is not implemented during M01 UI phase."); }

// Plan prices and the commission rate are real Prisma now (lib/data/planData.ts)
// regardless of data mode — same precedent as partnerData.ts. Everything else
// on these pages is still M01 marketing mock copy.
export async function getHomePageData(): Promise<HomePageViewModel> {
  const base = getDataMode() === "mock" ? mockHomePageData : checkApi();
  return { ...base, pricingPreview: await getPlanPreviews() };
}
export async function getHowItWorksData(): Promise<HowItWorksViewModel> { return getDataMode() === "mock" ? mockHowItWorksData : checkApi(); }
export async function getPricingData(): Promise<PricingPageViewModel> {
  const base = getDataMode() === "mock" ? mockPricingData : checkApi();
  return { ...base, plans: await getPlanPreviews() };
}
export async function getPartnerProgramData(): Promise<PartnerProgramViewModel> {
  const base = getDataMode() === "mock" ? mockPartnerProgramData : checkApi();
  return {
    ...base,
    commissionTransparency: {
      ...base.commissionTransparency,
      example: { ...base.commissionTransparency.example, commission: await getCommissionDisplayText() },
    },
  };
}
export async function getSafetyPageData(): Promise<SafetyPageViewModel> { return getDataMode() === "mock" ? mockSafetyPageData : checkApi(); }
export async function getLoginPageData(): Promise<LoginPageViewModel> { return getDataMode() === "mock" ? mockLoginPageData : checkApi(); }
export async function getRegisterPageData(ref?: string | null): Promise<RegisterPageViewModel> { return getDataMode() === "mock" ? (ref ? mockRegisterPageDataWithRef(ref) : mockRegisterPageData) : checkApi(); }
export async function getPartnerRegisterData(): Promise<PartnerRegisterViewModel> { return getDataMode() === "mock" ? mockPartnerRegisterData : checkApi(); }
export async function getPartnerPendingData(): Promise<PartnerPendingViewModel> { return getDataMode() === "mock" ? mockPartnerPendingData : checkApi(); }
