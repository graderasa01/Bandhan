import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getAllPlans, getCommissionConfig } from "@/lib/services/plans/planService";
import { listOffers } from "@/lib/services/plans/planOfferService";
import AdminShell from "@/components/layout/AdminShell";
import PlanPricingManager from "@/components/admin/PlanPricingManager";
import PlanCatalogManager from "@/components/admin/PlanCatalogManager";
import PlanOfferManager from "@/components/admin/PlanOfferManager";

export default async function AdminPricingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login?next=/admin/pricing");
  if (user.role !== "ADMIN") redirect("/");

  const [plans, commissionConfig, subsByPlan] = await Promise.all([
    getAllPlans(),
    getCommissionConfig(),
    // "Can this plan be deleted" is really "has anyone ever been on it" — the
    // server re-checks before deleting, this only decides whether to offer it.
    prisma.subscription.groupBy({ by: ["planCode"], _count: { _all: true } }),
  ]);
  const usageOf = new Map(subsByPlan.map((s) => [s.planCode, s._count._all]));

  // Needs the plans, so it cannot join the Promise.all above — the offer rows
  // quote the price each one lands on, and that arithmetic needs the list price.
  const offers = await listOffers(new Map(plans.map((p) => [p.code, p.priceInPaise])));

  return (
    <AdminShell adminName={user.fullName}>
      <div className="mx-auto max-w-4xl">
        <section className="mb-6">
          <h1 className="text-2xl font-bold text-wine-700">Pricing &amp; Plans</h1>
          <p className="mt-2 text-sm text-muted">
            Plan ke daam, har plan me kya milta hai, aur partner commission — sab yahan se. Har change turant live
            hota hai, koi deploy nahi.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-ink">Plans &amp; features</h2>
          <PlanCatalogManager
            plans={plans.map((p) => ({
              code: p.code,
              name: p.name,
              priceInPaise: p.priceInPaise,
              durationLabel: p.durationLabel,
              rank: p.rank,
              isActive: p.isActive,
              isPublic: p.isPublic,
              isBuiltin: p.isBuiltin,
              features: p.features,
              usageCount: usageOf.get(p.code) ?? 0,
            }))}
          />
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-ink">Offers &amp; limited-time free</h2>
          <PlanOfferManager
            plans={plans.map((p) => ({ code: p.code, name: p.name, priceInPaise: p.priceInPaise }))}
            offers={offers.map((o) => ({
              id: o.id,
              planCode: o.planCode,
              kind: o.kind,
              value: o.value,
              label: o.label,
              startsAt: o.startsAt.toISOString(),
              endsAt: o.endsAt.toISOString(),
              isActive: o.isActive,
              isLive: o.isLive,
              priceAfterPaise: o.priceAfterPaise,
            }))}
          />
        </section>

        <PlanPricingManager
          plans={plans.map((p) => ({
            code: p.code,
            name: p.name,
            priceInPaise: p.priceInPaise,
            durationLabel: p.durationLabel,
            featureBullets: p.featureBullets,
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
