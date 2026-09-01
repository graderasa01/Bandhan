import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import UserShell from "@/components/layout/UserShell";
import ManagedDraftEditor from "@/components/managed/ManagedDraftEditor";
import { getDraftHistoryForCreator } from "@/lib/services/managedProfile/consentLog";
import { resolveDraftAccess, summarizeDraft } from "@/lib/services/managedProfile/managedDraftService";

export const dynamic = "force-dynamic";

export default async function FamilyDraftPage({ params }: { params: Promise<{ draftId: string }> }) {
  const user = await getCurrentUser();
  const { draftId } = await params;
  if (!user) redirect(`/login?next=/user/managed-drafts/${draftId}`);

  const access = await resolveDraftAccess(user.id, draftId);
  if (!access.ok || access.access.role !== "CREATOR") notFound();

  const [summary, history] = await Promise.all([
    summarizeDraft(access.access.draft),
    getDraftHistoryForCreator(draftId),
  ]);

  return (
    <UserShell userName={user.fullName}>
      <ManagedDraftEditor
        draft={summary}
        history={history}
        canWriteValues={access.access.canWriteValues}
        canManageClaimLink={access.access.canManageClaimLink}
        accessRevoked={Boolean(access.access.draft.claimedByUserId) && !access.access.canReadValues}
        backHref="/user/managed-drafts"
        subjectWord="family"
      />
    </UserShell>
  );
}
