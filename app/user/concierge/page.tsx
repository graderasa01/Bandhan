import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { isFeatureAvailable } from "@/lib/services/plans/entitlements";
import UserShell from "@/components/layout/UserShell";
import ConciergeChat from "@/components/concierge/ConciergeChat";
import GrioDeck from "@/components/grio/GrioDeck";

export default async function ConciergePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/user/concierge");

  // The `aiConcierge` flag only (D-90). Grio used to open on the `chat` plan
  // capability; every member can talk to it now, and the daily
  // `grioChatPerDay` allowance is enforced per turn by /api/concierge.
  const gate = await isFeatureAvailable(user.id, "aiConcierge");

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
        // Only when an admin has switched Grio off. The deck is the user's own
        // inbox and carries no gate of its own (see app/api/grio/deck), so it
        // still renders.
        <div className="mx-auto flex h-full max-w-md flex-col justify-center gap-4 px-4">
          <GrioDeck standalone />
        </div>
      )}
    </UserShell>
  );
}
