import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import UserShell from "@/components/layout/UserShell";
import ProfileAccessClient from "@/components/managed/ProfileAccessClient";
import IncognitoToggle from "@/components/profile/IncognitoToggle";
import PhotoPrivacyToggle from "@/components/profile/PhotoPrivacyToggle";
import DiscoveryConsentPanel from "@/components/profile/DiscoveryConsentPanel";
import { getIncognitoSetting } from "@/lib/services/profile/incognitoService";
import { getPhotoPrivacy } from "@/lib/services/profile/photoPrivacyService";
import { getDiscoveryConsent } from "@/lib/services/discovery/discoveryConsentService";
import { getEntitlements } from "@/lib/services/plans/entitlements";
import { listDelegationsForOwner } from "@/lib/services/managedProfile/delegationService";
import { getConsentHistory } from "@/lib/services/managedProfile/consentLog";

export const dynamic = "force-dynamic";

export default async function ProfileAccessPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/user/profile/access");

  const [delegations, history, incognitoEnabled, entitlements, discoveryConsent, photoPrivacy] = await Promise.all([
    listDelegationsForOwner(user.id),
    getConsentHistory(user.id),
    getIncognitoSetting(user.id),
    getEntitlements(user.id),
    getDiscoveryConsent(user.id),
    getPhotoPrivacy(user.id),
  ]);

  return (
    <UserShell userName={user.fullName}>
      <div className="space-y-5">
        <ProfileAccessClient initialDelegations={delegations} history={history} />
        {/*
         * The owner's half of the D-90 photo rule: members who show their own
         * photo see yours, unless you keep yours to matches. First among the
         * switches because a face is the most personal thing on the profile —
         * and the migration's notice links straight here.
         */}
        {photoPrivacy && <PhotoPrivacyToggle initialMatchOnly={photoPrivacy === "MATCH_ONLY"} />}
        {/*
         * Incognito lived on the dashboard, next to the "Viewed You" number it
         * changes. That was a good reason and a bad location: this page is the
         * one that answers "who can see me", and a privacy switch that only
         * exists on the busiest screen in the app is a privacy switch most
         * people never find. It reads the same setting, so nothing about its
         * behaviour changes — see IncognitoToggle.
         */}
        <IncognitoToggle initialEnabled={incognitoEnabled} allowed={entitlements.incognitoBrowse} />
        {/*
         * Advanced Discovery's sensitive filters (religion, caste, gotra,
         * manglik, income) match a profile only when its owner has switched
         * that field on here. Same page as incognito for the same reason: this
         * is where "who can find me, and by what" is answered.
         */}
        {discoveryConsent && <DiscoveryConsentPanel initialConsent={discoveryConsent.consent} values={discoveryConsent.values} />}
      </div>
    </UserShell>
  );
}
