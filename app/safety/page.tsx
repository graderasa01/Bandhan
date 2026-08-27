import { getSafetyPageData } from "@/lib/data/publicPageData";
import PublicShell from "@/components/layout/PublicShell";
import MockDataBanner from "@/components/states/MockDataBanner";
import SafetyPageView from "@/components/public/SafetyPageView";

export default async function SafetyPage() {
  const data = await getSafetyPageData();
  return (
    <PublicShell banner={data.meta.mockMeta.isMock ? <MockDataBanner position="top" /> : null}>
      <SafetyPageView data={data} />
    </PublicShell>
  );
}
