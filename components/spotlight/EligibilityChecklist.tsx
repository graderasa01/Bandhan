import Link from "next/link";
import { ArrowRight, Check, Circle } from "lucide-react";
import Card from "@/components/ui/Card";
import type { EligibilityRequirement } from "@/lib/services/spotlight/eligibility";

/**
 * The requirements, as a to-do list rather than a verdict.
 *
 * A paid-visibility gate that says only "you are not eligible" reads as a
 * rejection of the person. The same gate, itemised, with each unmet line
 * linking to the screen that fixes it, reads as a checklist — and every item on
 * it happens to be something that makes the profile better whether or not they
 * ever buy a campaign. Met requirements stay visible for the same reason: the
 * list is progress, not an obstacle.
 */
export default function EligibilityChecklist({
  requirements,
}: {
  requirements: EligibilityRequirement[];
}) {
  const done = requirements.filter((r) => r.met).length;

  return (
    <Card variant="soft" padding="md">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[0.9375rem] font-semibold text-ink">Campaign chalane ke liye</h2>
        <span className="text-[0.75rem] font-medium text-muted">
          {done}/{requirements.length} poore
        </span>
      </div>

      <ul className="mt-3 space-y-2.5">
        {requirements.map((r) => (
          <li key={r.key} className="flex items-start gap-2.5">
            {r.met ? (
              <Check className="mt-0.5 size-4 shrink-0 text-trust" aria-hidden />
            ) : (
              <Circle className="mt-0.5 size-4 shrink-0 text-subtle" aria-hidden />
            )}
            <div className="min-w-0 flex-1">
              <p className={`text-[0.8125rem] leading-snug ${r.met ? "text-muted" : "font-medium text-ink"}`}>
                {r.label}
              </p>
              {r.detail && <p className="mt-0.5 text-[0.75rem] text-subtle">{r.detail}</p>}
              {!r.met && r.fixHref && (
                <Link
                  href={r.fixHref}
                  className="mt-1 inline-flex items-center gap-1 text-[0.75rem] font-semibold text-gold-700 transition-colors hover:text-gold-800"
                >
                  Fix this
                  <ArrowRight className="size-3" />
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
