import { notFound, redirect } from "next/navigation";
import { requirePartner } from "@/lib/auth/requirePartner";
import PartnerShell from "@/components/layout/PartnerShell";
import { getActivePartnerCode } from "@/components/partner/_shared/getActivePartnerCode";
import ManagedDraftEditor from "@/components/managed/ManagedDraftEditor";
import { getDraftHistoryForCreator } from "@/lib/services/managedProfile/consentLog";
import { resolveDraftAccess, summarizeDraft } from "@/lib/services/managedProfile/managedDraftService";
import { DRAFT_CREATOR_PARTNER_STATUSES } from "@/lib/services/managedProfile/managedEligibility";

export const dynamic = "force-dynamic";

export default async function PartnerClientDraftPage({ params }: { params: Promise<{ draftId: string }> }) {
  const { user, partner, redirectTo } = await requirePartner([...DRAFT_CREATOR_PARTNER_STATUSES]);
  if (!partner || !user) redirect(redirectTo);

  const { draftId } = await params;
  const access = await resolveDraftAccess(user.id, draftId);
  // A draft belonging to another partner produces the same 404 as one that
  // does not exist — see `resolveDraftAccess`.
  if (!access.ok || access.access.role !== "CREATOR") notFound();

  const [summary, history, partnerCode] = await Promise.all([
    summarizeDraft(access.access.draft),
    getDraftHistoryForCreator(draftId),
    getActivePartnerCode(partner.id),
  ]);

  return (
    <PartnerShell partnerName={partner.fullName} partnerCode={partnerCode}>
      <ManagedDraftEditor
        draft={summary}
        history={history}
        canWriteValues={access.access.canWriteValues}
        canManageClaimLink={access.access.canManageClaimLink}
        accessRevoked={Boolean(access.access.draft.claimedByUserId) && !access.access.canReadValues}
        backHref="/partner/clients"
        subjectWord="client"
      />
    </PartnerShell>
  );
}
