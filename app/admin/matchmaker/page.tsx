import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getOpenMatchmakerRequests } from "@/lib/services/matchmaker/matchmakerService";
import AdminShell from "@/components/layout/AdminShell";
import MatchmakerQueue from "@/components/admin/MatchmakerQueue";

export default async function AdminMatchmakerPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login?next=/admin/matchmaker");
  if (user.role !== "ADMIN") redirect("/");

  const requests = await getOpenMatchmakerRequests();

  return (
    <AdminShell adminName={user.fullName}>
      <div className="mx-auto max-w-3xl">
        <section className="mb-6">
          <h1 className="text-2xl font-bold text-wine-700">Matchmaker Requests</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            D-11: Premium plan ka &quot;Assisted Matchmaker&quot; — koi AI nahi, ek insaan in requests ko
            dekh kar users se contact karta hai.
          </p>
        </section>

        <MatchmakerQueue
          items={requests.map((r) => ({
            id: r.id,
            userName: r.userName,
            note: r.note,
            status: r.status as "OPEN" | "CONTACTED",
            createdAt: r.createdAt,
          }))}
        />
      </div>
    </AdminShell>
  );
}
