import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getAuditLogs } from "@/lib/services/admin/auditLogService";
import AdminShell from "@/components/layout/AdminShell";
import { FilterChips, Pager } from "@/components/admin/AdminFilterBar";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";

/**
 * `/admin/audit-logs` — finally reading what eighteen services have been
 * writing since M10.
 */
export default async function AdminAuditLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ actionType?: string; page?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login?next=/admin/audit-logs");
  if (user.role !== "ADMIN") redirect("/");

  const sp = await searchParams;
  const parsedPage = Number.parseInt(sp.page ?? "1", 10);

  const { rows, total, page, pageSize, actionTypes } = await getAuditLogs({
    actionType: sp.actionType,
    page: Number.isNaN(parsedPage) ? 1 : parsedPage,
  });

  return (
    <AdminShell adminName={user.fullName}>
      <div className="mx-auto max-w-4xl">
        <section className="mb-6">
          <h1 className="text-2xl font-bold text-wine-700">Audit Log</h1>
          <p className="mt-2 text-sm text-muted">
            Kisne, kab, kya badla. Har admin action — pricing, theme, feature flags, partner approval,
            photo review, user suspend — yahan record hota hai. Ye list badli nahi ja sakti.
          </p>
        </section>

        {actionTypes.length > 0 && (
          <Card padding="sm" className="mb-4">
            <FilterChips
              param="actionType"
              options={actionTypes.map((a) => ({ value: a, label: a.replaceAll("_", " ") }))}
            />
          </Card>
        )}

        <p className="mb-3 text-sm text-muted">{total.toLocaleString("en-IN")} records</p>

        {rows.length === 0 ? (
          <Card padding="lg">
            <p className="text-center text-sm text-muted">
              Abhi tak koi admin action record nahi hua.
            </p>
          </Card>
        ) : (
          <div className="space-y-2">
            {rows.map((log) => (
              <Card key={log.id} padding="sm">
                <div className="flex flex-wrap items-baseline gap-2">
                  <p className="text-sm font-semibold text-ink">{log.actorName}</p>
                  <Badge variant="ai-suggested" size="sm">
                    {log.actorRole}
                  </Badge>
                  <span className="text-sm font-medium text-wine-700">
                    {log.actionType.replaceAll("_", " ").toLowerCase()}
                  </span>
                  <span className="ml-auto text-xs text-subtle">{log.createdAt}</span>
                </div>

                <p className="mt-1 text-xs text-muted">
                  {log.targetType} · {log.targetId}
                </p>

                {(log.previousValue || log.newValue) && (
                  <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                    {log.previousValue && (
                      <span className="rounded-sm bg-bg-subtle px-1.5 py-0.5 text-muted">
                        {truncate(log.previousValue)}
                      </span>
                    )}
                    <span aria-hidden className="text-subtle">
                      →
                    </span>
                    <span className="rounded-sm bg-trust/10 px-1.5 py-0.5 text-trust">
                      {truncate(log.newValue ?? "—")}
                    </span>
                  </p>
                )}

                {log.reason && (
                  <p className="mt-1.5 text-[0.8125rem] leading-snug text-ink">
                    <span className="text-muted">Reason: </span>
                    {log.reason}
                  </p>
                )}
              </Card>
            ))}
          </div>
        )}

        <Pager page={page} total={total} pageSize={pageSize} />
      </div>
    </AdminShell>
  );
}

/** Values are free-text and some writers store whole JSON blobs. */
function truncate(value: string, max = 90): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
