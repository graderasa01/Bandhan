import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import AdminShell from "@/components/layout/AdminShell";
import SafetyCaseConsole from "@/components/admin/SafetyCaseConsole";
import { listSafetyCases } from "@/lib/services/safety/safetyCaseService";
import { getOpsSettings } from "@/lib/services/pilot/opsSettings";

/** A safety queue read from cache is a queue that hides the case that just arrived. */
export const dynamic = "force-dynamic";

export default async function AdminSafetyPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login?next=/admin/safety");
  if (user.role !== "ADMIN") redirect("/");

  const [cases, settings] = await Promise.all([listSafetyCases(), getOpsSettings()]);

  return (
    <AdminShell adminName={user.fullName}>
      <div className="mx-auto max-w-4xl">
        <section className="mb-2">
          <h1 className="text-2xl font-bold text-wine-700">Safety</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Har wo signal jo app ne suna aur akela nahi chhod sakta: rishta jo &quot;kuch theek nahi laga&quot; keh
            kar band hua, mulaqat ke baad wahi jawab, aur booking par shikayat. Har case ke saath likha hua playbook
            hai — aur wo bhi likha hai jo kabhi nahi karna.
          </p>
        </section>

        <SafetyCaseConsole initial={cases} firstResponseHours={settings.safetyFirstResponseHours} />
      </div>
    </AdminShell>
  );
}
