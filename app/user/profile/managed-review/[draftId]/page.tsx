import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import UserShell from "@/components/layout/UserShell";
import ManagedReviewClient from "@/components/managed/ManagedReviewClient";
import { getReviewView } from "@/lib/services/managedProfile/ownerReviewService";

export const dynamic = "force-dynamic";

/**
 * The owner's review screen.
 *
 * Owner-only: `getReviewView` matches the draft's `claimedByUserId` against the
 * session and 404s otherwise, so the partner who filled these values cannot
 * open the page where the decisions are made about them.
 */
export default async function ManagedReviewPage({ params }: { params: Promise<{ draftId: string }> }) {
  const user = await getCurrentUser();
  const { draftId } = await params;
  if (!user) redirect(`/login?next=/user/profile/managed-review/${draftId}`);

  const result = await getReviewView(user.id, draftId);
  if (!result.ok) notFound();

  return (
    <UserShell userName={user.fullName}>
      <ManagedReviewClient initial={result.data} />
    </UserShell>
  );
}
