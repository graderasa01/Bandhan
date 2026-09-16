import Link from "next/link";
import { CheckCircle2, ChevronRight, Circle } from "lucide-react";
import Card from "@/components/ui/Card";
import { getT } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";
import type { PartnerSetup } from "@/lib/data/partnerJourneyData";

/**
 * "Shuruaat" on the partner's Today screen — shown until every required step
 * is done, then gone. Each step is read from the row that proves it
 * (`getPartnerSetup`), so it can never be ticked without the thing happening.
 *
 * Only the first unfinished required step gets a filled button: one obvious
 * next move, the rest stay quiet links.
 */
export default async function PartnerSetupChecklist({ setup }: { setup: PartnerSetup }) {
  const t = await getT();
  const next = setup.steps.find((s) => !s.done && !s.optional) ?? null;

  return (
    <section aria-labelledby="partner-setup">
      <Card variant="soft" padding="md">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="partner-setup" className="text-lg font-semibold text-ink">
            {t("partnerJourney.setup.title", "Shuruaat")}
          </h2>
          <p className="text-sm text-muted">
            {t("partnerJourney.setup.progress", "{done}/{total} ho gaye")
              .replace("{done}", String(setup.doneCount))
              .replace("{total}", String(setup.steps.length))}
          </p>
        </div>
        <ol className="mt-3 flex flex-col gap-1.5">
          {setup.steps.map((step) => (
            <li key={step.key} className="flex min-h-12 items-center gap-3">
              {step.done ? (
                <CheckCircle2 className="size-5 shrink-0 text-trust" aria-hidden />
              ) : (
                <Circle className="size-5 shrink-0 text-subtle" aria-hidden />
              )}
              <p className={cn("min-w-0 flex-1 text-base", step.done ? "text-muted" : "text-ink")}>
                {step.label}
                {step.optional && (
                  <span className="ml-1.5 text-sm text-subtle">({t("partnerJourney.setup.optional", "zaroori nahi")})</span>
                )}
              </p>
              {!step.done && (
                <Link
                  href={step.href}
                  className={cn(
                    "inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full text-sm font-semibold",
                    step.key === next?.key
                      ? "bg-primary px-4 text-primary-fg hover:bg-primary-hover"
                      : "px-2 text-primary-text underline underline-offset-2",
                  )}
                >
                  {step.cta}
                  <ChevronRight className="size-4" aria-hidden />
                </Link>
              )}
            </li>
          ))}
        </ol>
      </Card>
    </section>
  );
}
