import { redirect } from "next/navigation";
import { requirePartner } from "@/lib/auth/requirePartner";
import PartnerShell from "@/components/layout/PartnerShell";
import { getActivePartnerCode } from "@/components/partner/_shared/getActivePartnerCode";
import PartnerBookingsClient from "@/components/marketplace/PartnerBookingsClient";
import { listBookingsForPartner } from "@/lib/services/marketplace/bookingService";

export const dynamic = "force-dynamic";

export default async function PartnerBookingsPage() {
  const { partner, redirectTo } = await requirePartner(["APPROVED", "ACTIVE", "INACTIVE"]);
  if (!partner) redirect(redirectTo);

  const [bookings, partnerCode] = await Promise.all([
    listBookingsForPartner(partner.id),
    getActivePartnerCode(partner.id),
  ]);

  return (
    <PartnerShell partnerName={partner.fullName} partnerCode={partnerCode}>
      <PartnerBookingsClient
        bookings={bookings.map((b) => ({
          id: b.id,
          status: b.status,
          serviceName: b.service.name,
          // First name only — see the client component's header for why a
          // booking is not a contact reveal.
          buyerFirstName: b.buyer.fullName.split(" ")[0],
          pricePaise: b.pricePaise,
          partnerAmountPaise: b.partnerAmountPaise,
          allocationStatus: b.allocation?.status ?? null,
          acceptBySla: b.acceptBySla?.toISOString() ?? null,
          buyerNote: b.buyerNote,
          preferredSlots: b.preferredSlots,
          createdAt: b.createdAt.toISOString(),
          disputeReason: b.disputeReason,
          milestones: b.milestones.map((m) => ({
            id: m.id,
            title: m.title,
            status: m.status,
            submittedNote: m.submittedNote,
          })),
        }))}
      />
    </PartnerShell>
  );
}
