import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import PublicHeader from "@/components/layout/PublicHeader";
import PublicFooter from "@/components/layout/PublicFooter";
import PartnerApplyForm from "@/components/partner-public/PartnerApplyForm";

export default async function PartnerRegisterPage() {
  // Applying attaches a Partner row to a real account, so a session is
  // required — the public marketing pitch lives at /partner-program.
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/partner/register");

  // Already applied? The pending page is the one place that explains status.
  const existing = await prisma.partner.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (existing) redirect("/partner/pending");

  return (
    <>
      <PublicHeader />
      <PartnerApplyForm />
      <PublicFooter />
    </>
  );
}
