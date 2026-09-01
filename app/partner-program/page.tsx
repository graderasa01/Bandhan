import { getPartnerProgramData } from "@/lib/data/publicPageData";
import PublicShell from "@/components/layout/PublicShell";
import MockDataBanner from "@/components/states/MockDataBanner";
import PartnerProgramPageView from "@/components/public/PartnerProgramPageView";

// Pulls the real commission rate from Postgres (lib/data/planData.ts) — that
// only exists once the app is actually running, not during the build's
// isolated static-generation pass, so this page can't be prerendered at
// build time.
export const dynamic = "force-dynamic";

export default async function PartnerProgramPage() {
  const data = await getPartnerProgramData();
  return (
    <PublicShell banner={data.meta.mockMeta.isMock ? <MockDataBanner position="top" /> : null}>
      <PartnerProgramPageView data={data} />
    </PublicShell>
  );
}
