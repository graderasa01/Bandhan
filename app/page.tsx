import PublicHeader from "@/components/layout/PublicHeader";
import PublicFooter from "@/components/layout/PublicFooter";
import MockDataBanner from "@/components/states/MockDataBanner";
import HomePageView from "@/components/public/HomePageView";
import { getHomePageData } from "@/lib/data/publicPageData";
import { redirectSignedInUser } from "@/lib/auth/postLoginPath";

// Pulls real plan pricing from Postgres (lib/data/planData.ts) — that only
// exists once the app is actually running, not during the build's isolated
// static-generation pass, so this page can't be prerendered at build time.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  // The marketing pitch is for people who aren't in yet. A signed-in account
  // landing here means something already went wrong upstream (or they typed
  // the bare domain), and showing them "Login / Free Profile Banayein" is a
  // dead end — send them to their own home instead.
  await redirectSignedInUser();

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
