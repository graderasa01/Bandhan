import { AlertCircle, Sparkles } from "lucide-react";

/**
 * The card's emotional centerpiece — AI reasoning gets Hinge-prompt weight,
 * not fine print. Always renders, even when the AI produced nothing for this
 * candidate (best-effort miss, or no API key configured): the panel's
 * presence itself is part of the "AI is visibly working here" promise.
 */
export default function ReelInsightPanel({
  strengths,
  concern,
}: {
  strengths: string[];
  concern: string | null;
}) {
  const hasContent = strengths.length > 0 || Boolean(concern);

  return (
    <div className="mt-3 rounded-md border border-gold-200/60 bg-gradient-to-br from-gold-50 to-surface px-3.5 py-3 dark:border-gold-700/30 dark:from-gold-900/20 dark:to-surface">
      <p className="flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-primary-text">
        <Sparkles className="size-3.5" />
        AI ne dekha
      </p>

      {hasContent ? (
        <div className="mt-2 space-y-1.5">
          {strengths.map((s, i) => (
            <p
              key={i}
              className={i === 0 ? "text-[0.9375rem] font-medium leading-snug text-ink" : "text-[0.8125rem] leading-snug text-muted"}
            >
              {s}
            </p>
          ))}
          {concern && (
            <p className="flex items-start gap-1.5 pt-0.5 text-[0.8125rem] leading-snug text-warn">
              <AlertCircle className="mt-px size-3.5 shrink-0" />
              {concern}
            </p>
          )}
        </div>
      ) : (
        <p className="mt-2 text-[0.8125rem] leading-snug text-muted">
          Is profile ke liye AI insight abhi available nahi hai.
        </p>
      )}
    </div>
  );
}
