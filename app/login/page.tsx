import { getLoginPageData } from "@/lib/data/publicPageData";
import PublicHeader from "@/components/layout/PublicHeader";
import PublicFooter from "@/components/layout/PublicFooter";
import MockDataBanner from "@/components/states/MockDataBanner";
import LoginPageView from "@/components/auth/LoginPageView";

export default async function LoginPage() {
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
