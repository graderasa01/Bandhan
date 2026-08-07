import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { listAdminAccounts } from "@/lib/services/admin/adminAccountService";
import AdminShell from "@/components/layout/AdminShell";
import AdminAccountsManager from "@/components/admin/AdminAccountsManager";

/**
 * `/admin/admins` — who can get into this panel at all. ADMIN only (not
 * SUPPORT): the same "can't hand out or take away panel access from inside
 * the panel unless you're a full admin" bar as user status changes.
 */
export default async function AdminAccountsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login?next=/admin/admins");
  if (user.role !== "ADMIN") redirect("/");

  const rows = await listAdminAccounts();

  return (
    <AdminShell adminName={user.fullName}>
      <div className="mx-auto max-w-3xl">
        <section className="mb-6">
          <h1 className="text-2xl font-bold text-wine-700">Admin Accounts</h1>
          <p className="mt-2 text-sm text-muted">
            Naya admin ya support account yahan se banayein. Ye login <code>/admin/login</code> se hota
            hai — public site par kahin link nahi hai.
          </p>
        </section>

        <AdminAccountsManager rows={rows} currentUserId={user.id} />
      </div>
    </AdminShell>
  );
}
