import { getPricingData } from "@/lib/data/publicPageData";
import PublicHeader from "@/components/layout/PublicHeader";
import PublicFooter from "@/components/layout/PublicFooter";
import MockDataBanner from "@/components/states/MockDataBanner";
import PricingPageView from "@/components/public/PricingPageView";

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
