import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getAllFeatureFlags } from "@/lib/services/flags/featureFlagService";
import { listActiveOverrides } from "@/lib/services/plans/entitlementOverrides";
import AdminShell from "@/components/layout/AdminShell";
import FeatureFlagManager from "@/components/admin/FeatureFlagManager";
import EntitlementOverrideManager from "@/components/admin/EntitlementOverrideManager";

export default async function AdminFeaturesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin/features");
  if (user.role !== "ADMIN") redirect("/");

  const [flags, overrides] = await Promise.all([getAllFeatureFlags(), listActiveOverrides()]);

  return (
    <AdminShell adminName={user.fullName}>
      <div className="mx-auto max-w-4xl">
        <section className="mb-6">
          <h1 className="text-2xl font-bold text-wine-700">Features &amp; Access</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Do alag cheezein, ek hi jagah. Upar wala switch batata hai ki koi feature kis had tak khula hai —
            sabke liye, sirf chosen logon ke liye, plan ke hisaab se, ya bilkul band. Neeche wala kisi ek user
            ko haath se access deta hai. Pricing ladder in dono se kabhi nahi badalti.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-wine-700">Feature switches</h2>
          <FeatureFlagManager
            rows={flags.map((f) => ({
              key: f.key,
              label: f.label,
              description: f.description,
              built: f.built,
              rollout: f.rollout,
              isDefault: f.isDefault,
            }))}
          />
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-wine-700">Per-user access</h2>
          <EntitlementOverrideManager
            active={overrides.map((o) => ({
              id: o.id,
              userName: o.userName,
              userEmail: o.userEmail,
              planCode: o.planCode,
              capabilityKey: o.capabilityKey,
              value: o.value,
              reason: o.reason,
              expiresAt: o.expiresAt ? o.expiresAt.toISOString() : null,
            }))}
          />
        </section>
      </div>
    </AdminShell>
  );
}
