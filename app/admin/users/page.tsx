import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { searchUsers } from "@/lib/services/admin/userAdminService";
import AdminShell from "@/components/layout/AdminShell";
import UserDirectory from "@/components/admin/UserDirectory";
import type { Role, UserStatus } from "@prisma/client";

const STATUSES: UserStatus[] = ["ACTIVE", "INCOMPLETE", "SUSPENDED", "BLOCKED", "DELETED"];
const ROLES: Role[] = ["USER", "PARTNER", "ADMIN", "SUPPORT"];

/**
 * `/admin/users` — the account directory.
 *
 * `lib/constants/routes.ts` had been pointing at this path since M01 and it had
 * never existed: there was no way to look up a single member, and no way to act
 * on one. Support's only lever was `UserEntitlementOverride`, which grants
 * access but cannot take it away.
 */
export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; role?: string; page?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin/users");
  if (user.role !== "ADMIN") redirect("/");

  const sp = await searchParams;
  // Narrowed against the enums rather than cast — a hand-typed `?status=foo`
  // would otherwise reach Prisma as a filter value and throw.
  const status = STATUSES.find((s) => s === sp.status);
  const role = ROLES.find((r) => r === sp.role);
  const page = Number.parseInt(sp.page ?? "1", 10);

  const { rows, total, page: currentPage, pageSize } = await searchUsers({
    query: sp.q,
    status,
    role,
    page: Number.isNaN(page) ? 1 : page,
  });

  return (
    <AdminShell adminName={user.fullName}>
      <div className="mx-auto max-w-4xl">
        <section className="mb-6">
          <h1 className="text-2xl font-bold text-wine-700">Users</h1>
          <p className="mt-2 text-sm text-muted">
            Har account yahan se dhoondein. Mobile aur email jaan-boojh kar masked dikhte hain — search
            poore number se bhi chalta hai. Status badalne par reason likhna zaroori hai aur wo audit log
            mein permanently save hota hai.
          </p>
        </section>

        <UserDirectory rows={rows} total={total} page={currentPage} pageSize={pageSize} />
      </div>
    </AdminShell>
  );
}
