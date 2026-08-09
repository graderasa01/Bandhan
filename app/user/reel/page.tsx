import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getOrCreateProfile } from "@/lib/services/profile/draftService";
import { computeCompletion } from "@/lib/services/profile/completionService";
import { getReelData } from "@/lib/data/reelData";
import { getT } from "@/lib/i18n/server";
import UserShell from "@/components/layout/UserShell";
import ProfileGate from "@/components/user/ProfileGate";
import ReelStack from "@/components/reel/ReelStack";

export default async function ReelPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/user/reel");

  const profile = await getOrCreateProfile(user.id);
  const { isLive, stage1MissingFields, stage1Progress } = computeCompletion(profile);

  // Full-bleed only once there's an actual reel to show — the incomplete-profile
  // gate still needs normal shell chrome (nav, logout) to be a real destination,
  // not a dead end.
  return (
    <UserShell userName={user.fullName} fullBleed={isLive}>
      <ProfileGate live={isLive} missingFields={stage1MissingFields} progress={stage1Progress}>
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
