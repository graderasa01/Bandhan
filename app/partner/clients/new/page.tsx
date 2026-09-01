import { redirect } from "next/navigation";
import { requirePartner } from "@/lib/auth/requirePartner";
import PartnerShell from "@/components/layout/PartnerShell";
import { getActivePartnerCode } from "@/components/partner/_shared/getActivePartnerCode";
import NewDraftForm from "@/components/managed/NewDraftForm";
import {
  DRAFT_CREATOR_PARTNER_STATUSES,
  getPartnerDraftEligibility,
} from "@/lib/services/managedProfile/managedEligibility";

export const dynamic = "force-dynamic";

export default async function NewClientDraftPage() {
  const { user, partner, redirectTo } = await requirePartner([...DRAFT_CREATOR_PARTNER_STATUSES]);
  if (!partner || !user) redirect(redirectTo);

  // Re-checked here as well as on the list: a partner who reaches this URL
  // directly must hit the same gate, and the API behind the form checks it a
  // third time on the actual write.
  const eligibility = await getPartnerDraftEligibility(user.id);
  if (!eligibility.ok) redirect("/partner/clients");

  const partnerCode = await getActivePartnerCode(partner.id);

  return (
    <PartnerShell partnerName={partner.fullName} partnerCode={partnerCode}>
      <NewDraftForm backHref="/partner/clients" detailHrefPrefix="/partner/clients" subjectWord="client" />
    </PartnerShell>
  );
}
