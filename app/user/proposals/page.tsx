import { redirect } from "next/navigation";
import UserShell from "@/components/layout/UserShell";
import ProposalQueueClient from "@/components/clientDesk/ProposalQueueClient";
import { getCurrentUser } from "@/lib/auth/session";
import { listProposalsForOwner } from "@/lib/services/clientDesk/proposalService";

export const dynamic = "force-dynamic";

/**
 * The owner's approval queue.
 *
 * `listProposalsForOwner` expires anything whose delegation has ended before
 * returning — a revoked partner's suggestion sitting here would be their
 * influence outliving the revocation that was meant to end it.
 */
export default async function ProposalsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/user/proposals");

  const proposals = await listProposalsForOwner(user.id);

  return (
    <UserShell userName={user.fullName}>
      <ProposalQueueClient proposals={proposals} />
    </UserShell>
  );
}
