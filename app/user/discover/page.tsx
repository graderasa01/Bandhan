import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { isFeatureAvailable } from "@/lib/services/plans/entitlements";
import { getDiscoverySettings } from "@/lib/services/discovery/discoverySettingsService";
import { prisma } from "@/lib/db/prisma";
import { PROFILE_FULL_INCLUDE } from "@/lib/services/profile/profileInclude";
import UserShell from "@/components/layout/UserShell";
import DiscoverClient from "./DiscoverClient";

/**
 * Advanced Discovery's paid search + Reel-preference screen.
 *
 * FREE renders the same filter UI as every other plan — that is the "useful
 * preview" the brief asks for — but every search call it makes 403s server
 * side (`/api/discover/search`), so `DiscoverClient` shows an upgrade card in
 * place of results rather than an empty grid. Nothing paid is ever fetched
 * for a FREE render: `entitled` is the only thing this page decides.
 */
export default async function DiscoverPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/user/discover");
  const t = await getT();

  const [gate, settings, profile] = await Promise.all([
    isFeatureAvailable(user.id, "advancedDiscovery", (ctx) => ctx.features.advancedDiscovery),
    getDiscoverySettings(user.id),
    prisma.profile.findUnique({ where: { userId: user.id }, include: PROFILE_FULL_INCLUDE }),
  ]);

  const prefs = profile?.partnerPreferences ?? null;

  return (
    <UserShell userName={user.fullName}>
      <div className="mx-auto max-w-4xl">
        <header className="mb-4">
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-wine-700">
            {t("discover.title", "Advanced Discovery")}
          </h1>
          <p className="mt-1.5 text-[0.9375rem] text-muted">
            {t(
              "discover.subtitle",
              "Apni khud ki search chalayein, aur bataayein ki roz ka Reel kaisa dikhna chahiye.",
            )}
          </p>
        </header>

        <DiscoverClient
          entitled={gate.allowed}
          initialSettings={settings}
          partnerPreferences={
            prefs
              ? {
                  lookingForGender: prefs.lookingForGender,
                  minAge: prefs.minAge,
                  maxAge: prefs.maxAge,
                  preferredCities: prefs.preferredCities,
                  educationPreference: prefs.educationPreference,
                  maritalStatusPreference: prefs.maritalStatusPreference,
                }
              : null
          }
        />
      </div>
    </UserShell>
  );
}
