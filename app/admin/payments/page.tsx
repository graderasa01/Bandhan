import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getPayments } from "@/lib/services/admin/paymentAdminService";
import AdminShell from "@/components/layout/AdminShell";
import { FilterChips, Pager } from "@/components/admin/AdminFilterBar";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { paiseToRupeeDisplay } from "@/lib/utils/money";
import type { PaymentStatus } from "@prisma/client";

const STATUSES: PaymentStatus[] = ["CREATED", "AUTHORIZED", "CAPTURED", "FAILED", "REFUNDED"];

const STATUS_BADGE: Record<PaymentStatus, "paid" | "pending" | "rejected" | "blocked" | "free"> = {
  CAPTURED: "paid",
  AUTHORIZED: "pending",
  CREATED: "free",
  FAILED: "rejected",
  REFUNDED: "blocked",
};

/**
 * `/admin/payments` — the money ledger.
 *
 * Read-only by design (see `paymentAdminService`). Until now the only money
 * surface in the panel was Commissions, which shows what partners are owed and
 * nothing about what came in.
 */
export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin/payments");
  if (user.role !== "ADMIN") redirect("/");

  const sp = await searchParams;
  const status = STATUSES.find((s) => s === sp.status);
  const parsedPage = Number.parseInt(sp.page ?? "1", 10);

  const { rows, total, page, pageSize, totals } = await getPayments({
    status,
    page: Number.isNaN(parsedPage) ? 1 : parsedPage,
  });

  return (
    <AdminShell adminName={user.fullName}>
      <div className="mx-auto max-w-4xl">
        <section className="mb-6">
          <h1 className="text-2xl font-bold text-wine-700">Payments</h1>
          <p className="mt-2 text-sm text-muted">
            Har payment ka record — successful, failed, refunded. Ye page sirf padhne ke liye hai: refund
            gateway par hota hai aur webhook se yahan apne aap update ho jata hai.
          </p>
        </section>

        <div className="mb-4 grid grid-cols-3 gap-3">
          <Card variant="soft" padding="sm">
            <p className="truncate text-xs font-medium text-muted">Captured</p>
            <p className="mt-1 truncate text-xl font-bold text-ink">
              {paiseToRupeeDisplay(totals.capturedPaise)}
            </p>
          </Card>
          <Card variant="soft" padding="sm">
            <p className="truncate text-xs font-medium text-muted">Refunded</p>
            <p className="mt-1 truncate text-xl font-bold text-ink">
              {paiseToRupeeDisplay(totals.refundedPaise)}
            </p>
          </Card>
          <Card variant="soft" padding="sm">
            <p className="truncate text-xs font-medium text-muted">Failed</p>
            <p className="mt-1 truncate text-xl font-bold text-ink">{totals.failedCount}</p>
          </Card>
        </div>

        <Card padding="sm" className="mb-4">
          <FilterChips
            param="status"
            options={STATUSES.map((s) => ({ value: s, label: s }))}
          />
        </Card>

        <p className="mb-3 text-sm text-muted">{total.toLocaleString("en-IN")} payments</p>

        {rows.length === 0 ? (
          <Card padding="lg">
            <p className="text-center text-sm text-muted">Is filter par koi payment nahi mila.</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {rows.map((p) => (
              <Card key={p.id} padding="sm">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-ink">{p.userName}</p>
                      <Badge variant={STATUS_BADGE[p.status]} size="sm">
                        {p.status}
                      </Badge>
                      <Badge variant="ai-suggested" size="sm">
                        {p.planCode}
                      </Badge>
                      {p.isTest && (
                        <Badge variant="low-confidence" size="sm">
                          TEST
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-subtle">
                      {p.createdAt}
                      {p.capturedAt ? `  ·  captured ${p.capturedAt}` : ""}
                      {p.discountPaise > 0
                        ? `  ·  ${paiseToRupeeDisplay(p.discountPaise)} discount`
                        : ""}
                    </p>
                    {p.failureReason && (
                      <p className="mt-1 text-xs text-danger">{p.failureReason}</p>
                    )}
                  </div>
                  <p className="shrink-0 text-base font-bold text-ink">
                    {paiseToRupeeDisplay(p.amountPaise)}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        )}

        <Pager page={page} total={total} pageSize={pageSize} />
      </div>
    </AdminShell>
  );
}
