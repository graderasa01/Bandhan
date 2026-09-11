import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Mic } from "lucide-react";
import Card from "@/components/ui/Card";
import type { ReadinessBlocker } from "@/lib/profile/readiness";
import { cn } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";

/**
 * The one screen a member sees before their profile is live.
 *
 * Fed by the **server-authoritative** readiness rule
 * (`readinessService.activateIfReady`), not by a values-only guess — so what
 * this screen says is left to do is exactly what the server is waiting for. A
 * field that is filled but still carries an unconfirmed AI reading is listed as
 * "check karna baaki", not as missing: those are different problems and telling
 * a user to re-enter something they can see on screen is how a gate stops being
 * believable.
 *
 * One heading, one sentence, one primary action. Everything else that used to
 * live here — the second CTA, the reassurance footer, the progress copy that
 * restated the bar right beneath it — was the same information three times.
 */
export default async function ProfileGate({
  live,
  blockers,
  progress,
  children,
}: {
  live: boolean;
  blockers: ReadinessBlocker[];
  progress: { done: number; total: number };
  children: ReactNode;
}) {
  if (live) return <>{children}</>;

  const t = await getT();
  const pct = progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100);
  const toCheck = blockers.filter((b) => b.reason === "unconfirmed");

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-8 sm:px-6">
      <Card variant="elevated" padding="xl">
        <h1 className="text-2xl leading-tight sm:text-3xl">
          {toCheck.length === blockers.length && blockers.length > 0
            ? t("user.profileGate.headlineReview", "Bas ek nazar daal dijiye")
            : t("user.profileGate.headline", "Thodi si baat baaki hai")}
        </h1>
        <p className="mt-2 text-pretty leading-relaxed text-muted">
          {`${progress.done}/${progress.total} `}
          {t("user.profileGate.progressLine", "zaroori details ready hain.")}
        </p>

        <div className="mt-5">
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-bg-subtle"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t("user.profileGate.progressLabel", "Zaroori baatein")}
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-gold-500 to-trust transition-[width] duration-700"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {blockers.length > 0 && (
          <ul className="mt-5 flex flex-wrap gap-2">
            {blockers.map((b) => (
              <li
                key={b.key}
                className={cn(
                  "rounded-full border px-3 py-1 text-[0.8125rem]",
                  b.reason === "unconfirmed"
                    ? "border-warn/30 bg-warn-bg text-ink"
                    : "border-line bg-bg-subtle text-muted",
                )}
              >
                {b.label}
                {b.reason === "unconfirmed" && (
                  <span className="ml-1 text-warn">
                    {t("user.profileGate.needsCheck", "· check karein")}
                  </span>
                )}
              </li>
            ))}
          </ul>
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
          {toCheck.length === blockers.length && blockers.length > 0 ? null : <Mic className="size-4" />}
          {toCheck.length === blockers.length && blockers.length > 0
            ? t("user.profileGate.reviewCta", "Review & Go Live")
            : t("user.profileGate.finishCta", "Finish Profile")}
          <ArrowRight className="size-4" />
        </Link>
      </Card>
    </div>
  );
}
