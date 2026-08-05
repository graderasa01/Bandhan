import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { isFeatureAvailable } from "@/lib/services/plans/entitlements";
import UserShell from "@/components/layout/UserShell";
import ConciergeChat from "@/components/concierge/ConciergeChat";
import AiQuotaUpgradeCard from "@/components/reel/AiQuotaUpgradeCard";

export default async function ConciergePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/user/concierge");

  // Reuses the existing `chat` plan capability rather than a new ladder key —
  // see lib/constants/features.ts's aiConcierge entry for why.
  const gate = await isFeatureAvailable(user.id, "aiConcierge", (ctx) => ctx.features.chat);

  // Full-bleed for the same reason as the 1-1 message thread
  // (app/user/messages/[matchId]/page.tsx): a chat shouldn't compete with
  // sidebar/bottom-nav chrome, and ConciergeChat's own header + GrioChatCore
  // already assume they're filling the viewport, not sitting in a padded
  // card partway down a page.
  return (
    <UserShell userName={user.fullName} fullBleed>
      {gate.allowed ? (
        <ConciergeChat />
      ) : (
        <div className="mx-auto flex h-full max-w-md items-center px-4">
          <AiQuotaUpgradeCard message="Grio paid plans ke saath khulta hai." />
        </div>
      )}
    </UserShell>
  );
}
