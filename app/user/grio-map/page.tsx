import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
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

  return (
    <UserShell userName={user.fullName}>
      {/* No page header above the card.

          The card carries its own title, tagline and tools now, so a heading
          out here was the map's name printed twice with a border between the
          copies — and it pushed the canvas, the only thing anybody came for,
          below the fold. The card IS the page. */}
      {/* `h-full` on a phone so the card can fill the shell's content box
          instead of ending halfway down and leaving a band of page under it.
          `main` is a flex child with a definite height, so the percentage
          resolves; where it cannot, the card just falls back to its own
          height and nothing breaks. */}
      <div className="mx-auto h-full max-w-6xl lg:h-auto">
        <GrioSamajhMap layout="page" />
      </div>
    </UserShell>
  );
}
