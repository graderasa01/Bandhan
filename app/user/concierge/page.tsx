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

  return (
    <UserShell userName={user.fullName}>
      <div className="mx-auto max-w-2xl">
        <header className="mb-6">
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-wine-700">Grio</h1>
          <p className="mt-1.5 text-base text-muted">
            General guidance ke liye poochiye — bio, baat-cheet, family — kisi ek profile ke faisle ke liye
            nahi. Ab har page se bhi khul sakta hai — neeche corner ke icon se.
          </p>
        </header>

        {gate.allowed ? (
          <ConciergeChat />
        ) : (
          <AiQuotaUpgradeCard message="Grio paid plans ke saath khulta hai." />
        )}
      </div>
    </UserShell>
  );
}
