import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getUserDashboardData } from "@/lib/data/userDashboardData";
import { getT } from "@/lib/i18n/server";
import UserShell from "@/components/layout/UserShell";
import TrustScoreCard from "@/components/profile/TrustScoreCard";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";

export default async function ProfileTrustScore() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/user/profile-trust-score");
  const t = await getT();

  const data = await getUserDashboardData(user, t);
  const { trust } = data;

  return (
    <UserShell userName={user.fullName}>
      <div className="mx-auto max-w-2xl">
        <section className="mb-6">
          <h1 className="mb-4 text-2xl font-bold text-wine-700">{t("userPages.trustScore.title", "Trust Score")}</h1>
          <TrustScoreCard
            score={trust.score}
            scoreLabel={trust.label}
            positiveFactors={trust.positiveFactors}
            improvementFactors={trust.improvementFactors}
          />
        </section>

        {trust.improvementFactors.length > 0 && (
          <section className="mb-6">
            <Card variant="soft" padding="lg">
              <h3 className="mb-3 text-lg font-semibold text-wine-700">
                {t("userPages.trustScore.improveHeading", "Trust Score Kaise Improve Karein?")}
              </h3>
              <div className="flex flex-col gap-3">
                {trust.improvementFactors.map((item, i) => (
                  <div key={item.label} className="flex items-start gap-3 rounded-md bg-surface p-3">
                    <div className="grid size-7 shrink-0 place-items-center rounded-full bg-trust/10 text-sm font-bold text-trust">
                      {i + 1}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-ink">{item.label}</div>
                      <div className="text-xs text-muted">
                        {item.description} {t("userPages.trustScore.pointsPre", "(+")}
                        {item.points}
                        {t("userPages.trustScore.pointsPost", " points)")}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </section>
        )}

        <section className="flex flex-wrap justify-center gap-4 py-4">
          <Link href="/profile/build">
            <Button variant="ai-action">{t("userPages.trustScore.improveWithAi", "Improve with AI")}</Button>
          </Link>
          <Link href="/user/dashboard">
            <Button variant="ghost">{t("userPages.trustScore.backToDashboard", "Back to Dashboard")}</Button>
          </Link>
        </section>
      </div>
    </UserShell>
  );
}
