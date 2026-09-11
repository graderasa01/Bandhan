import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import UserShell from "@/components/layout/UserShell";
import ProfileAccessClient from "@/components/managed/ProfileAccessClient";
import IncognitoToggle from "@/components/profile/IncognitoToggle";
import { getIncognitoSetting } from "@/lib/services/profile/incognitoService";
import { getEntitlements } from "@/lib/services/plans/entitlements";
import { listDelegationsForOwner } from "@/lib/services/managedProfile/delegationService";
import { getConsentHistory } from "@/lib/services/managedProfile/consentLog";

export const dynamic = "force-dynamic";

export default async function ProfileAccessPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/user/profile/access");

  const [delegations, history, incognitoEnabled, entitlements] = await Promise.all([
    listDelegationsForOwner(user.id),
    getConsentHistory(user.id),
    getIncognitoSetting(user.id),
    getEntitlements(user.id),
  ]);

  return (
    <UserShell userName={user.fullName}>
      <div className="space-y-5">
        <ProfileAccessClient initialDelegations={delegations} history={history} />
        {/*
         * Incognito lived on the dashboard, next to the "Viewed You" number it
         * changes. That was a good reason and a bad location: this page is the
         * one that answers "who can see me", and a privacy switch that only
         * exists on the busiest screen in the app is a privacy switch most
         * people never find. It reads the same setting, so nothing about its
         * behaviour changes — see IncognitoToggle.
         */}
        <IncognitoToggle initialEnabled={incognitoEnabled} allowed={entitlements.incognitoBrowse} />
      </div>
    </UserShell>
  );
}
