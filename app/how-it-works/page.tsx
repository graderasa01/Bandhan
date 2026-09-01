import { getHowItWorksData } from "@/lib/data/publicPageData";
import PublicShell from "@/components/layout/PublicShell";
import MockDataBanner from "@/components/states/MockDataBanner";
import HowItWorksPageView from "@/components/public/HowItWorksPageView";

export default async function HowItWorksPage() {
  const data = await getHowItWorksData();
  return (
    <PublicShell banner={data.meta.mockMeta.isMock ? <MockDataBanner position="top" /> : null}>
      <HowItWorksPageView data={data} />
    </PublicShell>
  );
}
