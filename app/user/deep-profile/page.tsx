import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getDeepProfileView, getGapQuestion, getDeepProfileShareEnabled } from "@/lib/services/deepProfile/deepProfileService";
import { isFeatureAvailable } from "@/lib/services/plans/entitlements";
import { Sparkles } from "lucide-react";
import UserShell from "@/components/layout/UserShell";
import DeepProfilePanel from "@/components/profile/DeepProfilePanel";
import GapQuestionCard from "@/components/profile/GapQuestionCard";
import DeepProfileShareToggle from "@/components/profile/DeepProfileShareToggle";

/** D-50's planned route, D-11's `deepDimensions` made real — see docs/bandhantak/10_engagement_and_monetization_architecture.md. */
export default async function DeepProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/user/deep-profile");

  const [data, gapQuestion, deepReportGate, shareEnabled] = await Promise.all([
    getDeepProfileView(user.id),
    getGapQuestion(user.id),
    isFeatureAvailable(user.id, "deepReport"),
    getDeepProfileShareEnabled(user.id),
  ]);

  return (
    <UserShell userName={user.fullName}>
      <div className="mx-auto max-w-2xl">
        <header className="mb-6 flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-gold-400 to-gold-600 text-primary-fg shadow-gold">
            <Sparkles className="size-5" />
          </span>
          <div>
            <h1 className="text-foil-live font-[family-name:var(--font-display)] text-2xl font-bold">
              Deep Profile
            </h1>
            <p className="mt-1 text-base text-muted">
              13 dimensions jo matching me matter karte hain — sirf aapke apne fields se, kabhi kuch banaya
              nahi jaata.
            </p>
          </div>
        </header>

        {gapQuestion && <GapQuestionCard question={gapQuestion} />}

        <DeepProfilePanel
          data={{ ...data, hasGapQuestion: gapQuestion !== null, deepReportEnabled: deepReportGate.allowed }}
        />

        {data.hasAnyComputed && (
          <div className="mt-4">
            <DeepProfileShareToggle initialVisible={shareEnabled} />
          </div>
        )}
      </div>
    </UserShell>
  );
}
