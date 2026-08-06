import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { listCommissions } from "@/lib/services/payments/commissionService";
import AdminShell from "@/components/layout/AdminShell";
import CommissionQueue from "@/components/admin/CommissionQueue";

export default async function AdminCommissionsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin/commissions");
  if (user.role !== "ADMIN") redirect("/");

  const [pending, approved, paid] = await Promise.all([
    listCommissions("PENDING"),
    listCommissions("APPROVED"),
    listCommissions("PAID", 20),
  ]);

  const toItems = (rows: Awaited<ReturnType<typeof listCommissions>>) =>
    rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));

  return (
    <AdminShell adminName={user.fullName}>
      <div className="mx-auto max-w-3xl">
        <section className="mb-6">
          <h1 className="text-2xl font-bold text-wine-700">Partner Commissions</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            D-12: har CAPTURED payment par uska ek percentage (partner ke tier ke hisaab se), D-80: har renewal
            par bhi. Rate /admin/pricing se badalta hai. 7-din refund window ke baad hi approve kar sakte hain —
            payment webhook se har row yahan khud ban jaati hai.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-wine-700">Pending ({pending.length})</h2>
          <CommissionQueue items={toItems(pending)} />
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-wine-700">Approved ({approved.length})</h2>
          <CommissionQueue items={toItems(approved)} />
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-wine-700">Recently Paid</h2>
          <CommissionQueue items={toItems(paid)} />
        </section>
      </div>
    </AdminShell>
  );
}
