import { notFound, redirect } from "next/navigation";
import { requirePartner } from "@/lib/auth/requirePartner";
import PartnerShell from "@/components/layout/PartnerShell";
import { getActivePartnerCode } from "@/components/partner/_shared/getActivePartnerCode";
import ClientDeskClient from "@/components/clientDesk/ClientDeskClient";
import { listClientNotes, openClientDesk } from "@/lib/services/clientDesk/clientDeskService";
import { listProposalsForPartner } from "@/lib/services/clientDesk/proposalService";
import { getClientSearchDefaults } from "@/lib/services/clientDesk/clientSearchService";

export const dynamic = "force-dynamic";

/**
 * One client's desk. `desk` is a static segment so it takes precedence over
 * the sibling `[draftId]` route — a claimed client and an unclaimed draft are
 * different things and must not collide on one id.
 */
export default async function ClientDeskPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { partner, redirectTo } = await requirePartner(["APPROVED", "ACTIVE"]);
  if (!partner) redirect(redirectTo);

  const { clientId } = await params;
  const desk = await openClientDesk(partner.id, clientId);
  // Same 404 for "revoked" and "never yours" — see `openClientDesk`.
  if (!desk.ok) notFound();

  const [proposals, notes, defaults, partnerCode] = await Promise.all([
    listProposalsForPartner(partner.id, clientId),
    listClientNotes(partner.id, clientId),
    getClientSearchDefaults(clientId),
    getActivePartnerCode(partner.id),
  ]);

  return (
    <PartnerShell partnerName={partner.fullName} partnerCode={partnerCode}>
      <ClientDeskClient
        client={desk.client}
        initialProposals={proposals}
        initialNotes={notes}
        defaults={{
          minAge: defaults.minAge ?? null,
          maxAge: defaults.maxAge ?? null,
          cities: defaults.cities ?? [],
          education: defaults.education ?? null,
        }}
      />
    </PartnerShell>
  );
}
