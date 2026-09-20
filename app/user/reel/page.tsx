import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getOrCreateProfile } from "@/lib/services/profile/draftService";
import { activateIfReady } from "@/lib/services/profile/readinessService";
import { getReelData } from "@/lib/data/reelData";
import { REEL_TABS } from "@/lib/contracts/reel";
import { getT } from "@/lib/i18n/server";
import UserShell from "@/components/layout/UserShell";
import ProfileGate from "@/components/user/ProfileGate";
import ReelStack from "@/components/reel/ReelStack";

export default async function ReelPage({
  searchParams,
}: {
  /** `?tab=VIEWED` — how the dashboard and the closing card link straight into a history lane. */
  searchParams?: Promise<{ tab?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/user/reel");
  const params = searchParams ? await searchParams : {};

  const profile = await getOrCreateProfile(user.id);
  // The same call the autosave makes, run on page load as well: it is
  // idempotent, it costs one provenance read when nothing changes, and it is
  // what lets an account that finished its eight fields through some other path
  // (or before this rule existed) become visible instead of sitting behind the
  // gate forever.
  const { view } = await activateIfReady(user.id, profile);
  const isLive = view.activatedOnServer;

  // Full-bleed only once there's an actual reel to show — the incomplete-profile
  // gate still needs normal shell chrome (nav, logout) to be a real destination,
  // not a dead end.
  return (
    <UserShell userName={user.fullName} fullBleed={isLive}>
      <ProfileGate
        live={isLive}
        blockers={view.readiness.blockers}
        progress={{ done: view.readiness.done, total: view.readiness.total }}
      >
        <ReelPageContent userId={user.id} tab={params.tab} />
      </ProfileGate>
    </UserShell>
  );
}

async function ReelPageContent({ userId, tab }: { userId: string; tab?: string }) {
  const t = await getT();
  const data = await getReelData(userId, t);
  // An unknown value falls back to the deck rather than 404ing a tab name —
  // the query string is a link target, not an API.
  const initialTab = REEL_TABS.find((candidate) => candidate === tab);
  return <ReelStack data={data} initialTab={initialTab} />;
}
