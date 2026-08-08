import { getRegisterPageData } from "@/lib/data/publicPageData";
import { redirectSignedInUser } from "@/lib/auth/postLoginPath";
import PublicHeader from "@/components/layout/PublicHeader";
import PublicFooter from "@/components/layout/PublicFooter";
import MockDataBanner from "@/components/states/MockDataBanner";
import RegisterPageView from "@/components/auth/RegisterPageView";

// Reads the session cookie now (redirectSignedInUser), so it can't be
// prerendered.
export const dynamic = "force-dynamic";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams?: Promise<{ ref?: string; next?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  // `?next=/partner/register` is the common case here — an existing member who
  // clicked "Partner Banein" gets forwarded on instead of being offered a
  // second account.
  await redirectSignedInUser(params?.next);

  const data = await getRegisterPageData(params?.ref ?? null);
  return (
    <>
      <PublicHeader />
      {data.meta.mockMeta.isMock && <MockDataBanner position="top" />}
      <RegisterPageView data={data} />
      <PublicFooter />
    </>
  );
}
