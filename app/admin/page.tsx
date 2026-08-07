import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getAdminMetrics, getAdminPendingCounts } from "@/lib/services/admin/adminOverviewService";
import AdminShell from "@/components/layout/AdminShell";
import AdminControlCenter from "@/components/admin/AdminControlCenter";

/**
 * `/admin` — the admin panel's front door, which until now did not exist.
 *
 * There was no index route at all: an admin logging in was handed the member
 * dashboard (and, having no profile of their own, usually the profile-building
 * interview), and the only way into the panel was to know and type one of the
 * eleven leaf URLs. `LoginPageView` now routes ADMIN here.
 */
export default async function AdminHomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login?next=/admin");
  if (user.role !== "ADMIN") redirect("/");

  const [counts, metrics] = await Promise.all([getAdminPendingCounts(), getAdminMetrics()]);

  return (
    <AdminShell adminName={user.fullName}>
      <AdminControlCenter counts={counts} metrics={metrics} adminName={user.fullName} />
    </AdminShell>
  );
}
