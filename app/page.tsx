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
    /*
     * `public-canvas` is the marketing skin's token island and `pc-canvas`
     * is the warm paper it paints (both in app/globals.css). It wraps the
     * header and footer too, not just <main> — the header is transparent
     * until you scroll, so leaving it outside the island would have shown a
     * strip of the app's cold near-white above the cream.
     *
     * Nothing here may take `overflow`, `transform`, `filter` or
     * `backdrop-filter`: PublicHeader is `position: sticky` and its mobile
     * sheet is `position: fixed`, and any of those on an ancestor makes this
     * div their containing block.
     */
    <div className="public-canvas pc-canvas min-h-dvh">
      <PublicHeader />
      {data.meta.mockMeta.isMock && <MockDataBanner position="top" />}
      <HomePageView data={data} />
      {/* Not on phones. The page already ends on its own call to action, and
          the footer's four link groups after it were a second, weaker ending —
          every destination in them is in the header's menu anyway. */}
      <PublicFooter className="hidden sm:block" />
    </div>
  );
}
