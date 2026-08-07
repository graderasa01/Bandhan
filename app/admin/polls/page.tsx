import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { listPolls } from "@/lib/services/admin/pollAdminService";
import AdminShell from "@/components/layout/AdminShell";
import PollManager from "@/components/admin/PollManager";

export default async function AdminPollsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login?next=/admin/polls");
  if (user.role !== "ADMIN") redirect("/");

  const polls = await listPolls();

  return (
    <AdminShell adminName={user.fullName}>
      <div className="mx-auto max-w-4xl">
        <section className="mb-6">
          <h1 className="text-2xl font-bold text-wine-700">Mindset Arena — Sawaal</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Har sawaal ek theme (hafte ke din) se juda hota hai — Somvaar Parivaar, Mangalvaar Paisa, Budhwaar Kaam,
            Guruvaar Reeti-riwaj, Shukravaar Red Flags, Shanivaar Sapne, Ravivaar Halka-fulka. Naya sawaal apne theme
            ki line ke sabse peeche jud jaata hai. Jis sawaal par vote aa chuka hai use edit nahi kiya ja sakta —
            sirf retire.
          </p>
        </section>

        <PollManager initialPolls={polls} />
      </div>
    </AdminShell>
  );
}
