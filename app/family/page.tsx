import { prisma } from "@/lib/db/prisma";
import { getCurrentFamilyMember } from "@/lib/auth/familySession";
import { getFamilyPortalProfiles } from "@/lib/data/familyPortalData";
import { permissionsFor } from "@/lib/services/family/familyService";
import { getOwnParentBlessingStatus } from "@/lib/services/family/blessingService";
import { isFeatureAvailable } from "@/lib/services/plans/entitlements";
import FamilyHeader from "@/components/family/FamilyHeader";
import FamilyProfileCard from "@/components/family/FamilyProfileCard";
import BlessingRecorder from "@/components/family/BlessingRecorder";
import NotJoinedCard from "@/components/family/NotJoinedCard";
import EmptyState from "@/components/states/EmptyState";
import { getT } from "@/lib/i18n/server";

/**
 * The family session's whole world — deliberately its own route tree, not a
 * variant of `/user/*`. `middleware.ts`'s matcher never touches `/family`, so
 * there is nothing here that could accidentally inherit a user-auth redirect
 * or a nav link into `/user/messages`.
 */
export default async function FamilyDashboardPage() {
  const member = await getCurrentFamilyMember();
  if (!member) return <NotJoinedCard />;

  const permissions = permissionsFor(member.relation);
  const t = await getT();

  const [owner, rows, blessingStatus, blessingGate] = await Promise.all([
    prisma.user.findUnique({ where: { id: member.ownerUserId }, select: { fullName: true } }),
    getFamilyPortalProfiles(member.ownerUserId, member.id),
    permissions.canRecordBlessing ? getOwnParentBlessingStatus(member.ownerUserId) : Promise.resolve(null),
    permissions.canRecordBlessing ? isFeatureAvailable(member.ownerUserId, "parentBlessing") : Promise.resolve(null),
  ]);
  const ownerName = owner?.fullName ?? t("family.top.unnamedOwner", "Unka");

  return (
    <div className="min-h-dvh bg-bg-subtle">
      <FamilyHeader ownerName={ownerName} relation={member.relation} />

      <div className="mx-auto max-w-2xl space-y-3 px-4 py-5">
        {permissions.canRecordBlessing && blessingGate?.allowed && (
          <BlessingRecorder initial={blessingStatus} />
        )}

        {rows.length === 0 ? (
          <EmptyState
            title={t("family.top.emptyTitle", "Abhi kuch nahi hai.")}
            description={`${ownerName}${t(
              "family.top.emptyDescriptionSuffix",
              " ka koi match ya shortlist abhi tak nahi hai — jaise hi hoga, yahan dikhega.",
            )}`}
          />
        ) : (
          rows.map((row) => <FamilyProfileCard key={row.profileId} row={row} permissions={permissions} />)
        )}
      </div>
    </div>
  );
}
