import { getRegisterPageData } from "@/lib/data/publicPageData";
import PublicHeader from "@/components/layout/PublicHeader";
import PublicFooter from "@/components/layout/PublicFooter";
import MockDataBanner from "@/components/states/MockDataBanner";
import RegisterPageView from "@/components/auth/RegisterPageView";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams?: Promise<{ ref?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
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
