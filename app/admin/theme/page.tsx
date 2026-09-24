import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getSiteThemeForAdmin } from "@/lib/services/theme/siteThemeService";
import { getThemeRoomsForAdmin } from "@/lib/services/theme/themeRoomService";
import { getGlassPresets } from "@/lib/services/theme/glassPresetService";
import AdminShell from "@/components/layout/AdminShell";
import ThemeManager from "@/components/admin/ThemeManager";
import ThemeRoomManager from "@/components/admin/ThemeRoomManager";

export default async function AdminThemePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login?next=/admin/theme");
  if (user.role !== "ADMIN") redirect("/");

  const [theme, rooms, presets] = await Promise.all([getSiteThemeForAdmin(), getThemeRoomsForAdmin(), getGlassPresets()]);

  return (
    // Wider than the other admin pages: the theme editor puts a desktop-sized
    // preview beside its controls.
    <AdminShell adminName={user.fullName}>
      <div className="mx-auto max-w-6xl">
        <section className="mb-6">
          <h1 className="text-2xl font-bold text-wine-700">Theme</h1>
          <p className="mt-2 text-sm text-muted">
            App ka look yahan se badlein — turant live ho jata hai, redeploy ki zaroorat nahi.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-bold text-ink">App Themes</h2>
          <p className="mt-1 text-sm text-muted">
            Header ke theme button me ye chaar themes aati hain. Kaunsi on rahe, pehli baar aane wale ko kaunsi
            dikhe, Satin / Day / Night ke peeche Mobile aur Desktop ki photo, aur un par glass kaisa dikhe (Auto ya
            aapke apne values) — sab yahan se. Classic hamesha bina photo ke rehta hai.
          </p>
          <div className="mt-4">
            <ThemeRoomManager initial={rooms} initialPresets={presets} />
          </div>
        </section>

        <section className="max-w-4xl">
          <h2 className="text-lg font-bold text-ink">Colour Pack</h2>
          <p className="mt-1 mb-4 text-sm text-muted">
            Brand ke rang — teen taiyaar (aur contrast-checked) packs hain, ya khud ka rang chunein.
          </p>
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
        </section>
      </div>
    </AdminShell>
  );
}
