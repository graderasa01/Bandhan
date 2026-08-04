import { getPartnerProgramData } from "@/lib/data/publicPageData";
import PublicHeader from "@/components/layout/PublicHeader";
import PublicFooter from "@/components/layout/PublicFooter";
import MockDataBanner from "@/components/states/MockDataBanner";
import PartnerProgramPageView from "@/components/public/PartnerProgramPageView";

export default async function PartnerProgramPage() {
  const data = await getPartnerProgramData();
  return (
    <>
      <PublicHeader />
      {data.meta.mockMeta.isMock && <MockDataBanner position="top" />}
      <PartnerProgramPageView data={data} />
      <PublicFooter />
    </>
  );
}
