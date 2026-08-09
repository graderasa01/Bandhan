import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Mic, Sparkles } from "lucide-react";
import Card from "@/components/ui/Card";
import Pill from "@/components/ui/Pill";
import { cn } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";

/**
 * Stage-1 gate on the dashboard/reel — 07_advanced_ai_spec §3.1.
 *
 * Not a wall: eight fields and roughly ninety seconds is the whole ask, and
 * the copy says exactly what is left. Showing an empty matches grid to
 * somebody with no profile teaches them the product is empty; showing the one
 * thing that unblocks everything teaches them it isn't.
 *
 * Fed by the real `computeCompletion()` result from the calling server page
 * (not read from localStorage here) — the same real completion state the
 * dashboard cards and trust score already use, so the gate can never disagree
 * with what the rest of the page shows.
 */
export default async function ProfileGate({
  live,
  missingFields,
  progress,
  children,
}: {
  live: boolean;
  missingFields: string[];
  progress: { done: number; total: number };
  children: ReactNode;
}) {
  if (live) return <>{children}</>;

  const t = await getT();
  const pct = progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
      <Card variant="elevated" padding="xl">
        <Pill tone="gold" size="sm">
          <Sparkles />
          {t("user.profileGate.oneStepLeft", "Ek kadam baaki")}
        </Pill>

        <h1 className="mt-4 text-2xl leading-tight sm:text-3xl">
          {t("user.profileGate.headline", "Rishte dekhne ke liye profile poori kar lijiye")}
        </h1>
        <p className="mt-3 text-pretty leading-relaxed text-muted">
          {progress.done > 0
            ? `${progress.total}${t("user.profileGate.progressDonePre", " me se ")}${progress.done}${t(
                "user.profileGate.progressDoneMid",
                " baatein ho chuki hain. Baaki ",
              )}${progress.total - progress.done}${t("user.profileGate.progressDonePost", " bhi bas do minute ka kaam hai.")}`
            : t("user.profileGate.progressNone", "Sirf aath baatein — bol kar bataiye to do minute me ho jayega.")}
        </p>

        <div className="mt-5">
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-bg-subtle"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Zaroori baatein"
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-gold-500 to-trust transition-[width] duration-700"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {missingFields.length > 0 && (
          <div className="mt-5">
            <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-subtle">
              {t("user.profileGate.stillMissing", "Abhi ye baaki hai")}
            </p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {missingFields.map((label) => (
                <li
                  key={label}
                  className="rounded-full border border-line bg-bg-subtle px-3 py-1 text-[0.8125rem] text-muted"
                >
                  {label}
                </li>
              ))}
            </ul>
          </div>
        )}

        <Link
          href="/profile/build"
          className={cn(
            "mt-7 inline-flex h-14 w-full items-center justify-center gap-2 rounded-full px-8",
            "bg-primary text-base font-semibold text-primary-fg shadow-md transition-all duration-200",
            "hover:-translate-y-0.5 hover:bg-primary-hover hover:shadow-gold",
            "focus-visible:ring-2 focus-visible:ring-gold-600 focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
          )}
        >
          <Mic className="size-4" />
          {t("user.profileGate.completeByVoice", "Complete by Voice")}
          <ArrowRight className="size-4" />
        </Link>

        <Link
          href="/profile/build?mode=manual"
          className="mt-3 block text-center text-[0.8125rem] font-medium text-muted underline underline-offset-4 hover:text-ink"
        >
          {t("user.profileGate.fillFormInstead", "Fill the Form Instead")}
        </Link>

        <p className="mt-4 text-center text-[0.75rem] leading-snug text-subtle">
          {t("user.profileGate.footerNote", "Profile live hote hi roz ke rishte dikhne lagenge.")}
        </p>
      </Card>
    </div>
  );
}
