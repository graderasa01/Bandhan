import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getSiteThemeForAdmin } from "@/lib/services/theme/siteThemeService";
import AdminShell from "@/components/layout/AdminShell";
import ThemeManager from "@/components/admin/ThemeManager";

export default async function AdminThemePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin/theme");
  if (user.role !== "ADMIN") redirect("/");

  const theme = await getSiteThemeForAdmin();

  return (
    <AdminShell adminName={user.fullName}>
      <div className="mx-auto max-w-4xl">
        <section className="mb-6">
          <h1 className="text-2xl font-bold text-wine-700">Theme</h1>
          <p className="mt-2 text-sm text-muted">
            Poore site ka colour yahan se badlein — turant live ho jata hai, redeploy ki zaroorat nahi. Teen
            taiyaar (aur contrast-checked) themes hain, ya khud ka rang chunein.
          </p>
        </section>

        <ThemeManager
          currentPack={theme.pack}
          currentCustom={
            theme.pack === "CUSTOM"
              ? {
                  primary: theme.customPrimary ?? "#c9a96e",
                  primaryText: theme.customPrimaryText ?? "#806634",
                  accent: theme.customAccent ?? "#4a1119",
                  accentText: theme.customAccentText ?? "#4a1119",
                  signal: theme.customSignal ?? "#1f7a5a",
                }
              : null
          }
        />
      </div>
    </AdminShell>
  );
}
