import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { isFeatureAvailable } from "@/lib/services/plans/entitlements";
import UserShell from "@/components/layout/UserShell";
import ConciergeChat from "@/components/concierge/ConciergeChat";
import GrioDeck from "@/components/grio/GrioDeck";
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
        // The *conversation* is what the plan buys. The deck is the user's own
        // inbox and carries no plan gate of its own (see app/api/grio/deck),
        // so it renders above the upsell rather than behind it — the same
        // thing the global overlay shows a FREE user, which would otherwise be
        // the only place this principle actually held.
        <div className="mx-auto flex h-full max-w-md flex-col justify-center gap-4 px-4">
          <GrioDeck standalone />
          <AiQuotaUpgradeCard message="Grio paid plans ke saath khulta hai." />
        </div>
      )}
    </UserShell>
  );
}
