import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getAllPlans, getCommissionConfig } from "@/lib/services/plans/planService";
import { PLAN_FEATURES } from "@/lib/constants/plans";
import AdminShell from "@/components/layout/AdminShell";
import PlanPricingManager from "@/components/admin/PlanPricingManager";

export default async function AdminPricingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login?next=/admin/pricing");
  if (user.role !== "ADMIN") redirect("/");

  const [plans, commissionConfig] = await Promise.all([getAllPlans(), getCommissionConfig()]);

  return (
    <AdminShell adminName={user.fullName}>
      <div className="mx-auto max-w-4xl">
        <section className="mb-6">
          <h1 className="text-2xl font-bold text-wine-700">Pricing</h1>
          <p className="mt-2 text-sm text-muted">
            Plan prices aur partner commission yahan se badlein — har change turant live hota hai.
          </p>
        </section>

        <PlanPricingManager
          plans={plans.map((p) => ({
            code: p.code,
            name: p.name,
            priceInPaise: p.priceInPaise,
            durationLabel: p.durationLabel,
            featureBullets: p.featureBullets,
            effectiveReelPerDay: p.effectiveReelPerDay,
            reelPerDayIsOverridden: p.reelPerDayIsOverridden,
            ladderReelPerDay: PLAN_FEATURES[p.code].reelPerDay,
          }))}
          commission={{
            baseBps: commissionConfig.baseBps,
            silverBonusBps: commissionConfig.silverBonusBps,
            goldBonusBps: commissionConfig.goldBonusBps,
            silverThreshold: commissionConfig.silverThreshold,
            goldThreshold: commissionConfig.goldThreshold,
          }}
          topPlanPaise={Math.max(...plans.map((p) => p.priceInPaise))}
        />
      </div>
    </AdminShell>
  );
}
