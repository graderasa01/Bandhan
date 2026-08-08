import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { listFamilyMembers } from "@/lib/services/family/familyService";
import { getFamilySeatLimit, getUserPlanCode } from "@/lib/services/plans/entitlements";
import { getPlanCatalog, planNameOf } from "@/lib/services/plans/planCatalog";
import UserShell from "@/components/layout/UserShell";
import FamilyCircleManager from "@/components/user/FamilyCircleManager";

export default async function FamilyCirclePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/user/family");

  const [members, seatLimit, planCode] = await Promise.all([
    listFamilyMembers(user.id),
    getFamilySeatLimit(user.id),
    getUserPlanCode(user.id),
  ]);

  return (
    <UserShell userName={user.fullName}>
      <div className="mx-auto max-w-2xl">
        <section className="mb-6">
          <h1 className="text-2xl font-bold text-wine-700">Family Circle</h1>
          <p className="mt-2 text-sm text-muted">
            Papa, Mummy ya bhai-behen ko jodein — wo aapke matches aur shortlist dekh sakte hain, apni raay de
            sakte hain. Chat kabhi nahi dikhegi.
          </p>
        </section>

        <FamilyCircleManager
          initialMembers={members.map((m) => ({
            id: m.id,
            displayName: m.displayName,
            relation: m.relation,
            status: m.status,
            inviteToken: m.inviteToken,
            inviteExpiresAt: m.inviteExpiresAt.toISOString(),
            boundAt: m.boundAt?.toISOString() ?? null,
          }))}
          seatLimit={seatLimit}
          planName={planNameOf(await getPlanCatalog(), planCode)}
        />
      </div>
    </UserShell>
  );
}
