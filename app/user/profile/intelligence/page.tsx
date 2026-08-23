import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { ArrowRight, Brain, Check } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getIntelligenceState } from "@/lib/services/profile/intelligenceService";
import UserShell from "@/components/layout/UserShell";
import Card from "@/components/ui/Card";
import Progress from "@/components/ui/Progress";

export const metadata: Metadata = {
  title: "Profile Intelligence",
};

/**
 * All nine layers on one page — the "come back and edit" surface.
 *
 * The dashboard card only ever recommends *one* next layer, which is what keeps
 * it a nudge instead of a chore list. This page is the other half: somebody who
 * wants to fix an answer they gave three weeks ago needs a way in that is not
 * "wait for the dashboard to suggest that layer again".
 */
export default async function IntelligenceIndexPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/user/profile/intelligence");

  const { progress } = await getIntelligenceState(user.id);
  const areaPercent =
    progress.totalLayers === 0 ? 0 : Math.round((progress.completedLayers / progress.totalLayers) * 100);

  return (
    <UserShell userName={user.fullName}>
      <div className="mx-auto max-w-2xl">
        <header className="mb-6 flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-gold-400 to-gold-600 text-primary-fg shadow-gold">
            <Brain className="size-5" />
          </span>
          <div className="min-w-0">
            <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold">Profile Intelligence</h1>
            <p className="mt-0.5 text-sm text-muted">
              Biodata batata hai aap kaun hain. Ye batata hai aap kaisi zindagi chahte hain.
            </p>
          </div>
        </header>

        <Card variant="default" padding="lg" className="mb-4">
          <Progress
            value={areaPercent}
            showPercentage={false}
            label={`${progress.completedLayers} of ${progress.totalLayers} areas understood`}
          />
          <p className="mt-2 text-[0.8125rem] text-muted">
            {progress.answeredQuestions} / {progress.totalQuestions} sawaal ho chuke hain. Koi bhi layer kabhi
            bhi badli ja sakti hai — kuch bhi lock nahi hota.
          </p>
        </Card>

        <ul className="space-y-2">
          {progress.layers.map((layer) => (
            <li key={layer.key}>
              <Link
                href={`/user/profile/intelligence/${layer.slug}`}
                className="flex items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3 transition-colors hover:border-gold-400 hover:bg-gold-50/50 dark:hover:bg-gold-900/10"
              >
                <span
                  className={
                    layer.complete
                      ? "grid size-8 shrink-0 place-items-center rounded-full bg-trust/10 text-trust"
                      : "grid size-8 shrink-0 place-items-center rounded-full bg-bg-subtle text-subtle"
                  }
                  aria-hidden
                >
                  {layer.complete ? <Check className="size-4" strokeWidth={3} /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.9375rem] font-medium text-ink">{layer.title}</span>
                  <span className="block text-[0.8125rem] text-muted">
                    {layer.answered}/{layer.total} · {layer.unlocks}
                  </span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-subtle" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </UserShell>
  );
}
