import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getOverview } from "@/lib/services/marketing/taskService";
import AdminShell from "@/components/layout/AdminShell";
import MarketingAiConsole from "@/components/admin/marketing-ai/MarketingAiConsole";

/** Live queue and live connection state on every load — a cached control room is a wrong one. */
export const dynamic = "force-dynamic";

/**
 * Growth Saathi — the one-route control room (§2). Command box, work queue,
 * connection strip; every detail opens in a drawer on this same page.
 */
export default async function AdminMarketingAiPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login?next=/admin/marketing-ai");
  if (user.role !== "ADMIN") redirect("/");

  const [overview, params] = await Promise.all([getOverview(), searchParams]);
  const connect = typeof params.connect === "string" ? params.connect : null;
  const provider = typeof params.provider === "string" ? params.provider : null;

  return (
    <AdminShell adminName={user.fullName}>
      <div className="mx-auto max-w-6xl">
        <MarketingAiConsole initial={overview} connectResult={connect} connectProvider={provider} />
      </div>
    </AdminShell>
  );
}
