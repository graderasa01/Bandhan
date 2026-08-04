import { getSafetyPageData } from "@/lib/data/publicPageData";
import PublicHeader from "@/components/layout/PublicHeader";
import PublicFooter from "@/components/layout/PublicFooter";
import MockDataBanner from "@/components/states/MockDataBanner";
import SafetyPageView from "@/components/public/SafetyPageView";

export default async function SafetyPage() {
  const data = await getSafetyPageData();
  return (
    <>
      <PublicHeader />
      {data.meta.mockMeta.isMock && <MockDataBanner position="top" />}
      <SafetyPageView data={data} />
      <PublicFooter />
    </>
  );
}
