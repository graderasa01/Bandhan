import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import AdminLoginView from "@/components/admin/AdminLoginView";

/**
 * `/admin/login` — the admin panel's own door, separate from the member
 * `/login` on purpose: it must never be reachable from a public link, and an
 * admin/support account must never be able to authenticate through the
 * member form (enforced server-side in app/api/auth/login/route.ts, not just
 * by which page you happen to load).
 */
export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const sp = await searchParams;
  const next = sp.next && sp.next.startsWith("/admin") ? sp.next : "/admin";

  const user = await getCurrentUser();
  if (user && (user.role === "ADMIN" || user.role === "SUPPORT")) {
    redirect(next);
  }

  return <AdminLoginView next={next} />;
}
