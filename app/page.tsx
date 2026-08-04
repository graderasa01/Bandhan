import PublicHeader from "@/components/layout/PublicHeader";
import PublicFooter from "@/components/layout/PublicFooter";
import MockDataBanner from "@/components/states/MockDataBanner";
import HomePageView from "@/components/public/HomePageView";
import { getHomePageData } from "@/lib/data/publicPageData";

export default async function HomePage() {
  const data = await getHomePageData();
  return (
    <>
      <PublicHeader />
      {data.meta.mockMeta.isMock && <MockDataBanner position="top" />}
      <HomePageView data={data} />
      <PublicFooter />
    </>
  );
}
