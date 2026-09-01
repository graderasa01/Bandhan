import { redirect } from "next/navigation";
import { requirePartner } from "@/lib/auth/requirePartner";
import PartnerShell from "@/components/layout/PartnerShell";
import { getActivePartnerCode } from "@/components/partner/_shared/getActivePartnerCode";
import PartnerEnquiriesClient from "@/components/marketplace/PartnerEnquiriesClient";
import { listThreadsForPartner } from "@/lib/services/marketplace/enquiryService";

export const dynamic = "force-dynamic";

export default async function PartnerEnquiriesPage() {
  const { partner, redirectTo } = await requirePartner(["APPROVED", "ACTIVE"]);
  if (!partner) redirect(redirectTo);

  const [threads, partnerCode] = await Promise.all([
    listThreadsForPartner(partner.id),
    getActivePartnerCode(partner.id),
  ]);

  return (
    <PartnerShell partnerName={partner.fullName} partnerCode={partnerCode}>
      <PartnerEnquiriesClient
        threads={threads.map((t) => ({
          id: t.id,
          memberFirstName: t.user.fullName.split(" ")[0],
          serviceName: t.service?.name ?? null,
          lastMessageAt: t.lastMessageAt.toISOString(),
          unread: t.partnerUnreadCount,
          callRequested: t.callRequested,
          status: t.status,
        }))}
      />
    </PartnerShell>
  );
}
