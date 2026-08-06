import Link from "next/link";
import { CheckCircle2, ChevronRight } from "lucide-react";
import Card from "@/components/ui/Card";
import AdminNavHub from "@/components/layout/AdminNavHub";
import { ADMIN_NAV_ITEMS, ADMIN_TONE_CLASSES, ADMIN_TONE_BY_HREF } from "@/components/layout/adminNavItems";
import type { AdminMetrics, AdminPendingCounts } from "@/lib/services/admin/adminOverviewService";
import { paiseToRupeeDisplay } from "@/lib/utils/money";
import { cn } from "@/lib/utils";

/**
 * What an admin sees first.
 *
 * The ordering is the whole design: **work waiting on a human comes before any
 * number.** Revenue is interesting; an unreviewed abuse report is someone
 * waiting. A dashboard that opens on a revenue figure trains you to scroll past
 * the queue, so the queue is on top and the figures sit under it.
 *
 * When every queue is empty the top section collapses to a single "sab clear"
 * line rather than five zeroes. Five zeroes look like a broken page; one line
 * looks like a finished day.
 */
export default function AdminControlCenter({
  counts,
  metrics,
  adminName,
}: {
  counts: AdminPendingCounts;
  metrics: AdminMetrics;
  adminName: string;
}) {
  const queues = ADMIN_NAV_ITEMS.filter((i) => i.count).map((item) => ({
    item,
    count: counts[item.count!],
  }));
  const waiting = queues.filter((q) => q.count > 0);
  const totalWaiting = waiting.reduce((sum, q) => sum + q.count, 0);

  return (
    <div className="mx-auto max-w-5xl">
      <section className="mb-6">
        <h1 className="text-2xl font-bold text-wine-700">Control Center</h1>
        <p className="mt-2 text-sm text-muted">
          Namaste {adminName} — {totalWaiting > 0
            ? `${totalWaiting} cheezein aapke action ka intezaar kar rahi hain.`
            : "abhi kuchh bhi pending nahi hai."}
        </p>
      </section>

      {/* ---- Work waiting ---- */}
      <section className="mb-8">
        <SectionLabel>Aapka action chahiye</SectionLabel>
        {waiting.length === 0 ? (
          <Card variant="trust" padding="md">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="size-5 shrink-0 text-trust" aria-hidden />
              <p className="text-sm font-medium text-ink">
                Sab queues clear hain. Koi review pending nahi.
              </p>
            </div>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {waiting.map(({ item, count }) => (
              <Link key={item.href} href={item.href} className="group block">
                <Card variant="interactive" padding="md">
                  <div className="flex items-start gap-3">
                    <span
                      className={cn(
                        "grid size-10 shrink-0 place-items-center rounded-full",
                        ADMIN_TONE_CLASSES[ADMIN_TONE_BY_HREF[item.href]],
                      )}
                    >
                      <item.icon className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-baseline gap-2">
                        <span className="text-2xl font-bold leading-none text-wine-700">{count}</span>
                        <span className="truncate text-sm font-semibold text-ink">{item.label}</span>
                      </p>
                      <p className="mt-1 text-[0.8125rem] leading-snug text-muted">{item.blurb}</p>
                    </div>
                    <ChevronRight
                      className="size-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5"
                      aria-hidden
                    />
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ---- Numbers ---- */}
      <section className="mb-8">
        <SectionLabel>Members</SectionLabel>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Total users" value={metrics.users.total.toLocaleString("en-IN")} />
          <Stat label="Active" value={metrics.users.active.toLocaleString("en-IN")} />
          <Stat label="Naye (7 din)" value={`+${metrics.users.newThisWeek.toLocaleString("en-IN")}`} />
          <Stat
            label="Suspended"
            value={metrics.users.suspended.toLocaleString("en-IN")}
            href="/admin/users?status=SUSPENDED"
          />
          <Stat label="Profiles bani" value={metrics.profiles.total.toLocaleString("en-IN")} />
          <Stat label="Verified profiles" value={metrics.profiles.verified.toLocaleString("en-IN")} />
          <Stat label="Matches" value={metrics.engagement.matches.toLocaleString("en-IN")} />
          <Stat
            label="Messages (7 din)"
            value={metrics.engagement.messagesThisWeek.toLocaleString("en-IN")}
          />
        </div>
      </section>

      <section className="mb-8">
        <SectionLabel>Paisa</SectionLabel>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            label="Revenue (30 din)"
            value={paiseToRupeeDisplay(metrics.revenue.last30DaysPaise)}
            href="/admin/payments"
          />
          <Stat
            label="Revenue (all time)"
            value={paiseToRupeeDisplay(metrics.revenue.allTimePaise)}
            href="/admin/payments"
          />
          <Stat
            label="Active subscriptions"
            value={metrics.subscriptions.active.toLocaleString("en-IN")}
          />
          <Stat
            label="Commission pending"
            value={paiseToRupeeDisplay(metrics.commissions.pendingPaise)}
            hint={`${metrics.commissions.pendingCount} rows`}
            href="/admin/commissions"
          />
        </div>

        {/* The dummy gateway is the only gateway until Razorpay keys land, so
            every rupee earned so far is test money. Saying that out loud beats
            a real-looking ₹0 next to a test total nobody explains. */}
        {metrics.revenue.testPaise > 0 && (
          <p className="mt-2.5 text-[0.8125rem] text-muted">
            Iske alawa {paiseToRupeeDisplay(metrics.revenue.testPaise)} test (dummy gateway) ka hai —
            upar wale revenue mein nahi juda.
          </p>
        )}

        {metrics.subscriptions.byPlan.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {metrics.subscriptions.byPlan.map((p) => (
              <span
                key={p.planCode}
                className="inline-flex items-center gap-1.5 rounded-full bg-bg-subtle px-3 py-1 text-xs font-medium text-ink"
              >
                {p.planCode}
                <span className="text-muted">{p.count}</span>
              </span>
            ))}
          </div>
        )}
      </section>

      {/* ---- Everything else ---- */}
      <section>
        <SectionLabel>Saare controls</SectionLabel>
        <Card padding="sm">
          <AdminNavHub variant="card" />
        </Card>
      </section>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2.5 text-[0.6875rem] font-semibold uppercase leading-4 tracking-wider text-subtle">
      {children}
    </h2>
  );
}

function Stat({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: string;
  hint?: string;
  href?: string;
}) {
  const body = (
    <Card variant={href ? "interactive" : "soft"} padding="sm">
      <p className="truncate text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 truncate text-xl font-bold text-ink">{value}</p>
      {hint && <p className="mt-0.5 truncate text-[0.6875rem] text-subtle">{hint}</p>}
    </Card>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}
