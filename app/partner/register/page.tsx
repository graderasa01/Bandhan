import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import PublicHeader from "@/components/layout/PublicHeader";
import PublicFooter from "@/components/layout/PublicFooter";
import PartnerApplyForm from "@/components/partner-public/PartnerApplyForm";

export default async function PartnerRegisterPage() {
  // No login/register detour: a brand-new applicant (a pandit ji, a bureau, a
  // vendor) never sees anything but this one partner-branded form. It's a
  // single page whether or not they already have a BandhanTak account —
  // PartnerApplyForm creates the account itself (via /api/auth/register) when
  // `loggedIn` is false, then submits the application in the same flow.
  const user = await getCurrentUser();

  // Already applied? The pending page is the one place that explains status.
  if (user) {
    const existing = await prisma.partner.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (existing) redirect("/partner/pending");
  }

  return (
    <>
      <PublicHeader />
      <PartnerApplyForm loggedIn={Boolean(user)} />
      <PublicFooter />
    </>
  );
}
