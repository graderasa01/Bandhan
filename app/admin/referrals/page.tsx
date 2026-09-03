import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getPlanCatalog } from "@/lib/services/plans/planCatalog";
import { getMemberReferralConfig } from "@/lib/services/referral/memberReferralConfig";
import { getAdminReferralOverview } from "@/lib/services/referral/memberReferralService";
import AdminShell from "@/components/layout/AdminShell";
import ReferralProgramConsole from "@/components/admin/ReferralProgramConsole";

/**
 * The member referral program's admin screen.
 *
 * Deliberately *not* folded into `/admin/pricing`: that page is money the
 * platform takes and pays. This one hands out plan access for free, which is a
 * different kind of decision with a different failure mode — an over-generous
 * rate here does not cost cash, it quietly stops anyone needing to buy the
 * plan at all.
 */
export default async function AdminReferralsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login?next=/admin/referrals");
  if (user.role !== "ADMIN") redirect("/");

  const [config, overview, catalog] = await Promise.all([
    getMemberReferralConfig(),
    getAdminReferralOverview(),
    getPlanCatalog(),
  ]);

  return (
    <AdminShell adminName={user.fullName}>
      <div className="mx-auto max-w-3xl">
        <section className="mb-2">
          <h1 className="text-2xl font-bold text-wine-700">Referral Program</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Members apna link share karte hain; jo log aakar apni profile poori karte hain wo gine jaate hain, aur
            bulane wale ko plan ke din milte hain — paisa nahi. Har number yahan se badal sakta hai aur har badlaav
            audit log me jaata hai.
          </p>
        </section>

        <ReferralProgramConsole
          initial={{
            config,
            // Only plans that are live and sellable — granting a deactivated
            // plan would work, but nobody could ever be told what it includes.
            plans: catalog.all
              .filter((p) => p.isActive)
              .map((p) => ({ code: p.code, name: p.name })),
            totalJoined: overview.totalJoined,
            totalQualified: overview.totalQualified,
            totalPending: overview.totalPending,
            rewardsGranted: overview.rewardsGranted,
            planDaysGranted: overview.planDaysGranted,
            leaders: overview.leaders,
            recent: overview.recent.map((r) => ({ ...r, joinedAt: r.joinedAt.toISOString() })),
          }}
        />
      </div>
    </AdminShell>
  );
}
