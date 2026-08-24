import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import Card from "@/components/ui/Card";
import type { BandhanJourney } from "@/lib/services/journey/bandhanJourney";

/**
 * One readiness picture, replacing six that each argued for themselves.
 *
 * The dashboard used to carry a completion percentage, a trust score, an
 * intelligence coverage count and a Circle badge as separate cards, in
 * different units, each implying it was the thing to fix next. Six numbers that
 * do not add up is not more information than one — it is less, because the user
 * cannot rank them.
 *
 * Here they share a shape, so the eye can compare them, and exactly one is
 * called out as next. `bandhanJourney.ts` picks that one as the *least* far
 * along rather than the nearest to finishing: a user at 95% profile and no
 * family added is told to invite family, which is the honest advice and the
 * opposite of what a progress-bar-maximising design would say.
 *
 * No score, no level, no points — see the service docstring for why.
 */
export default function BandhanJourneyCard({ journey }: { journey: BandhanJourney }) {
  return (
    <Card className="mt-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[0.9375rem] font-semibold text-ink">Aapki taiyari</h3>
        <p className="shrink-0 text-[0.75rem] text-muted">
          {journey.total} me se {journey.complete} set
        </p>
      </div>

      <ul className="mt-3 flex flex-col gap-2.5">
        {journey.areas.map((a) => (
          <li key={a.key} className="flex items-center gap-3">
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[0.8125rem] text-ink">{a.label}</span>
                <span className="shrink-0 text-[0.75rem] text-muted">
                  {a.done ? <Check className="inline size-3.5 text-gold-600 dark:text-gold-400" /> : a.value}
                </span>
              </span>
              {/* One bar per area is what makes six different units comparable.
                  The real number stays in `value` beside it. */}
              <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-line">
                <span
                  className={`block h-full rounded-full ${a.done ? "bg-gold-500" : "bg-gold-400/60"}`}
                  style={{ width: `${a.percent}%` }}
                />
              </span>
            </span>
          </li>
        ))}
      </ul>

      {journey.next?.href && (
        <div className="mt-3.5 border-t border-line pt-3">
          <p className="text-[0.75rem] leading-relaxed text-muted">{journey.next.why}</p>
          <Link
            href={journey.next.href}
            className="group mt-1.5 inline-flex items-center gap-1 text-[0.8125rem] font-medium text-gold-700 dark:text-gold-300"
          >
            {journey.next.cta} — {journey.next.label}
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      )}
    </Card>
  );
}
