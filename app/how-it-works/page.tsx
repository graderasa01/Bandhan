import { getHowItWorksData } from "@/lib/data/publicPageData";
import PublicHeader from "@/components/layout/PublicHeader";
import PublicFooter from "@/components/layout/PublicFooter";
import MockDataBanner from "@/components/states/MockDataBanner";
import HowItWorksPageView from "@/components/public/HowItWorksPageView";

export default async function HowItWorksPage() {
  const data = await getHowItWorksData();
  return (
    <>
      <PublicHeader />
      {data.meta.mockMeta.isMock && <MockDataBanner position="top" />}
      <HowItWorksPageView data={data} />
      <PublicFooter />
    </>
  );
}
