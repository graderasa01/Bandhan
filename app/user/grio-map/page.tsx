import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import UserShell from "@/components/layout/UserShell";
import GrioSamajhMap from "@/components/profile/GrioSamajhMap";

// The root layout appends "· BandhanTak" — don't repeat it here.
export const metadata: Metadata = {
  title: "Grio Map",
};

/**
 * The Samajh Map with its own address.
 *
 * It first appeared on the profile builder's "live" screen, which is the right
 * place to *meet* it — you have just finished a profile and the obvious next
 * question is "so what now". It is the wrong place to keep it: that screen is
 * reached by building a profile, so returning to the map later meant walking
 * back through the builder to a celebration for something you finished weeks
 * ago. Both entry points render the same component, so there is one map and two
 * doors, not two maps.
 *
 * `force-dynamic` because every bubble on it is this user's own state — a
 * cached render would show somebody else's progress or a stale copy of theirs.
 * The component fetches `/api/grio/samajh-map` itself, so nothing is passed
 * down; the page's job is the shell and the auth gate.
 */
export const dynamic = "force-dynamic";

export default async function GrioMapPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/user/grio-map");

  const t = await getT();

  return (
    <UserShell userName={user.fullName}>
      <div className="mx-auto max-w-2xl space-y-4">
        <header>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-wine-700">
            {t("userPages.grioMap.title", "Grio Map")}
          </h1>
          <p className="mt-1.5 text-base text-muted">
            {t(
              "userPages.grioMap.subtitle",
              "Poora BandhanTak ek nazar me — aap kahan hain, Grio kya jaanta hai, aur agla kaam ka kadam kya hai.",
            )}
          </p>
        </header>
        <GrioSamajhMap />
      </div>
    </UserShell>
  );
}
