import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { runLifecycleNudges } from "@/lib/services/lifecycle/lifecycleJob";
import AdminShell from "@/components/layout/AdminShell";
import LifecycleConsole from "@/components/admin/LifecycleConsole";

/** The preview is only useful if it's current — never cached. */
export const dynamic = "force-dynamic";

export default async function AdminLifecyclePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login?next=/admin/lifecycle");
  if (user.role !== "ADMIN") redirect("/");

  // Dry run on load, always. Opening this page must never message anybody.
  const summary = await runLifecycleNudges({ dryRun: true });

  return (
    <AdminShell adminName={user.fullName}>
      <div className="mx-auto max-w-5xl">
        <section className="mb-6">
          <h1 className="text-2xl font-bold text-wine-700">Lifecycle Nudges</h1>
          <p className="mt-2 text-sm text-muted">
            App ke baaki saare nudge tabhi bante hain jab user andar ho. Ye pehla system hai jo un
            logon tak pahunchta hai jo aana band kar chuke hain — aur isi wajah se ye jaan-boojh kar
            kam bhejta hai.
          </p>
        </section>

        <LifecycleConsole initial={summary} />
      </div>
    </AdminShell>
  );
}
