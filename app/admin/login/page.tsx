import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { postLoginPath } from "@/lib/auth/postLoginPath";
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
  const requested = sp.next && sp.next.startsWith("/admin") ? sp.next : null;

  const user = await getCurrentUser();
  if (user && (user.role === "ADMIN" || user.role === "SUPPORT")) {
    // Not a bare "/admin" fallback any more: `/admin` is ADMIN-only, so a
    // SUPPORT account sent there just gets bounced again. postLoginPath knows
    // SUPPORT's one readable page is the partner queue.
    redirect(requested ?? (await postLoginPath(user)));
  }

  return <AdminLoginView next={requested} />;
}
