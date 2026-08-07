import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getGrowthSnapshot } from "@/lib/services/growth/growthService";
import AdminShell from "@/components/layout/AdminShell";
import GrowthConsole from "@/components/admin/GrowthConsole";

/** Live counts, every load — a cached growth console is a wrong one. */
export const dynamic = "force-dynamic";

export default async function AdminGrowthPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login?next=/admin/growth");
  if (user.role !== "ADMIN") redirect("/");

  const snapshot = await getGrowthSnapshot(30);

  return (
    <AdminShell adminName={user.fullName}>
      <div className="mx-auto max-w-5xl">
        <section className="mb-6">
          <h1 className="text-2xl font-bold text-wine-700">Growth</h1>
          <p className="mt-2 text-sm text-muted">
            Signup kahan marta hai, kaun wapas aata hai, kaunse lock par sabse zyada log khade
            hain, aur paisa kahan se aa raha hai — sab asli row counts se.
          </p>
        </section>

        <GrowthConsole initial={snapshot} />
      </div>
    </AdminShell>
  );
}
