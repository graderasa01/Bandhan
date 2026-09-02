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
import FamilyExpectationsCard from "@/components/family/FamilyExpectationsCard";
import FamilyRoomsCard from "@/components/family/FamilyRoomsCard";
import { listRoomsForHelper } from "@/lib/services/rishta/roomParticipantService";
import { getFamilyQuestionnaire } from "@/lib/services/family/familyExpectationService";
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

  const [owner, rows, blessingStatus, blessingGate, expectations, rooms] = await Promise.all([
    prisma.user.findUnique({ where: { id: member.ownerUserId }, select: { fullName: true } }),
    getFamilyPortalProfiles(member.ownerUserId, member.id),
    permissions.canRecordBlessing ? getOwnParentBlessingStatus(member.ownerUserId) : Promise.resolve(null),
    permissions.canRecordBlessing ? isFeatureAvailable(member.ownerUserId, "parentBlessing") : Promise.resolve(null),
    // GUARDIAN is "sirf dekho" everywhere else in this portal, and an
    // expectation is a stronger statement than a note — so it follows the
    // stricter existing rule rather than a looser new one. `saveFamilyExpectation`
    // refuses them server-side too; this only avoids rendering a dead card.
    member.relation === "GUARDIAN" ? Promise.resolve(null) : getFamilyQuestionnaire(member),
    // Phase 4. Scoped to this family member, not to the owner: being invited
    // into a rishta is per-person, so a sibling and a parent seated on the same
    // profile can see different rooms — or none.
    listRoomsForHelper({ familyMemberId: member.id }),
  ]);
  const ownerName = owner?.fullName ?? t("family.top.unnamedOwner", "Unka");

  return (
    <div className="min-h-dvh bg-bg-subtle">
      <FamilyHeader ownerName={ownerName} relation={member.relation} />

      <div className="mx-auto max-w-2xl space-y-3 px-4 py-5">
        {permissions.canRecordBlessing && blessingGate?.allowed && (
          <BlessingRecorder initial={blessingStatus} />
        )}

        {/* Above the profile list, and collapsed by default. It belongs at the
            top because it is the only thing here that is about the marriage
            rather than about one candidate — and collapsed because a family
            member arriving to look at a new rishta should not have to scroll
            past nine questions to reach it. */}
        {expectations && expectations.length > 0 && (
          <FamilyExpectationsCard ownerName={ownerName} initial={expectations} />
        )}

        {/* Above the candidate list, below expectations: a rishta somebody was
            deliberately invited into outranks the profiles they can merely
            browse. Renders nothing at all when there are none. */}
        <FamilyRoomsCard rooms={rooms} />

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
