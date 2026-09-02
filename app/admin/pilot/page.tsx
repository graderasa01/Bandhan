import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import AdminShell from "@/components/layout/AdminShell";
import PilotConsole from "@/components/admin/PilotConsole";
import { getDemandHotspots, listPilotCities } from "@/lib/services/pilot/pilotCityService";
import { getSlaEscalations } from "@/lib/services/marketplace/slaJob";
import { getOpsSettings } from "@/lib/services/pilot/opsSettings";

/** Capacity is a live count of who is listed right now — a cached one is wrong. */
export const dynamic = "force-dynamic";

export default async function AdminPilotPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login?next=/admin/pilot");
  if (user.role !== "ADMIN") redirect("/");

  const [cities, hotspots, escalations, settings] = await Promise.all([
    listPilotCities(),
    getDemandHotspots(),
    getSlaEscalations(),
    getOpsSettings(),
  ]);

  return (
    <AdminShell adminName={user.fullName}>
      <div className="mx-auto max-w-5xl">
        <section className="mb-2">
          <h1 className="text-2xl font-bold text-wine-700">Pilot &amp; SLA</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Kaunse sheher khule hain, har sheher kitne partner utha sakta hai, log kahan maang rahe hain jahan hum
            nahi hain, aur ruki hui booking par kaun kab peechhe padega.
          </p>
        </section>

        <PilotConsole initial={{ cities, hotspots, escalations, settings }} />
      </div>
    </AdminShell>
  );
}
