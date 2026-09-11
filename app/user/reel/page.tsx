import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getOrCreateProfile } from "@/lib/services/profile/draftService";
import { activateIfReady } from "@/lib/services/profile/readinessService";
import { getReelData } from "@/lib/data/reelData";
import { getT } from "@/lib/i18n/server";
import UserShell from "@/components/layout/UserShell";
import ProfileGate from "@/components/user/ProfileGate";
import ReelStack from "@/components/reel/ReelStack";

export default async function ReelPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/user/reel");

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
        <ReelPageContent userId={user.id} />
      </ProfileGate>
    </UserShell>
  );
}

async function ReelPageContent({ userId }: { userId: string }) {
  const t = await getT();
  const data = await getReelData(userId, t);
  return <ReelStack data={data} />;
}
