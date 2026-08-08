import { getLoginPageData } from "@/lib/data/publicPageData";
import { redirectSignedInUser } from "@/lib/auth/postLoginPath";
import PublicHeader from "@/components/layout/PublicHeader";
import PublicFooter from "@/components/layout/PublicFooter";
import MockDataBanner from "@/components/states/MockDataBanner";
import LoginPageView from "@/components/auth/LoginPageView";

// Reads the session cookie now (redirectSignedInUser), so it can't be
// prerendered.
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ next?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  // Already signed in — show them the page they were heading for rather than a
  // login form they'd only submit to get back to where they already are.
  await redirectSignedInUser(params?.next);

  const data = await getLoginPageData();
  return (
    <>
      <PublicHeader />
      {data.meta.mockMeta.isMock && <MockDataBanner position="top" />}
      <LoginPageView data={data} />
      <PublicFooter />
    </>
  );
}
