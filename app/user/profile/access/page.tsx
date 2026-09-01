import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import UserShell from "@/components/layout/UserShell";
import ProfileAccessClient from "@/components/managed/ProfileAccessClient";
import { listDelegationsForOwner } from "@/lib/services/managedProfile/delegationService";
import { getConsentHistory } from "@/lib/services/managedProfile/consentLog";

export const dynamic = "force-dynamic";

export default async function ProfileAccessPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/user/profile/access");

  const [delegations, history] = await Promise.all([
    listDelegationsForOwner(user.id),
    getConsentHistory(user.id),
  ]);

  return (
    <UserShell userName={user.fullName}>
      <ProfileAccessClient initialDelegations={delegations} history={history} />
    </UserShell>
  );
}
