import PublicHeader from "@/components/layout/PublicHeader";
import PublicFooter from "@/components/layout/PublicFooter";
import ForgotPasswordPageView from "@/components/auth/ForgotPasswordPageView";

export default function ForgotPasswordPage() {
  return (
    <>
      <PublicHeader />
      <ForgotPasswordPageView />
      <PublicFooter />
    </>
  );
}
