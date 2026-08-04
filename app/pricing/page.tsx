import { getPricingData } from "@/lib/data/publicPageData";
import PublicHeader from "@/components/layout/PublicHeader";
import PublicFooter from "@/components/layout/PublicFooter";
import MockDataBanner from "@/components/states/MockDataBanner";
import PricingPageView from "@/components/public/PricingPageView";

// Pulls real plan pricing from Postgres (lib/data/planData.ts) — that only
// exists once the app is actually running, not during the build's isolated
// static-generation pass, so this page can't be prerendered at build time.
export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const data = await getPricingData();
  return (
    <>
      <PublicHeader />
      {data.meta.mockMeta.isMock && <MockDataBanner position="top" />}
      <PricingPageView data={data} />
      <PublicFooter />
    </>
  );
}
