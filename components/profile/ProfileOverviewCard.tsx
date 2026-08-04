"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { PROFILE_FIELDS } from "@/lib/profile/fields";
import { isAnswered, type ProfileValues } from "@/lib/profile/stages";
import Card from "@/components/ui/Card";
import { cn } from "@/lib/utils";

const CATALOG = PROFILE_FIELDS.filter((f) => f.type !== "photo");
const COLLAPSED_LIMIT = 8;

/**
 * Self-fetching, like PhotoUploadCard — the dashboard page is a server
 * component and this is the one card on it that needs the live draft, not
 * just the completion percentage `computeCompletion()` already hands down.
 *
 * Shows both directions at once: what's already on the profile (so filling
 * something in the voice flow or the manual form actually feels like it
 * landed somewhere, not just a percentage going up), and everything still
 * empty — required *and* optional, because an optional field left blank is
 * still a weaker match, not a non-issue.
 */
export default function ProfileOverviewCard() {
  const [values, setValues] = useState<ProfileValues | null>(null);
  const [showAllRemaining, setShowAllRemaining] = useState(false);
  const [showFilled, setShowFilled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/profile/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { values?: ProfileValues } | null) => {
        if (!cancelled && body?.values) setValues(body.values);
      })
      .catch(() => {
        /* dashboard still works without this card — completion % already loaded server-side */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!values) return null;

  const filled = CATALOG.filter((f) => isAnswered(f, values));
  const remaining = CATALOG.filter((f) => !isAnswered(f, values)).sort((a, b) => {
    if (a.required !== b.required) return a.required ? -1 : 1;
    return a.stage - b.stage;
  });
  const visibleRemaining = showAllRemaining ? remaining : remaining.slice(0, COLLAPSED_LIMIT);

  return (
    <Card variant="default" padding="lg">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-wine-700">Aapki Profile</h3>
        <span className="shrink-0 text-[0.75rem] font-medium tabular-nums text-subtle">
          {filled.length}/{CATALOG.length} details
        </span>
      </div>

      {filled.length > 0 && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setShowFilled((s) => !s)}
            className="flex min-h-9 w-full items-center justify-between gap-2 text-[0.6875rem] font-semibold uppercase tracking-wider text-subtle"
          >
            <span>Bhar chuke hain ({filled.length})</span>
            {showFilled ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </button>
          {showFilled && (
            <ul className="mt-2 flex flex-wrap gap-2">
              {filled.map((f) => (
                <li
                  key={f.key}
                  className="max-w-[14rem] rounded-lg border border-trust/25 bg-trust-bg px-3 py-1.5 text-[0.8125rem] text-ink"
                >
                  {/* line-clamp on the wrapping span, not the value alone — a short
                      "Label: value" still renders as one line (box sizes to content),
                      a long one (About Me, Partner's Education) wraps to 2 lines and
                      ellipsizes instead of stretching the rounded-full shape into a blob. */}
                  <span className="line-clamp-2 break-words">
                    <span className="text-subtle">{f.label}:</span> {values[f.key]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {remaining.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-gold-700">
            <Sparkles className="size-3" />
            Ye bhi bhariye, aur behtar match milenge
          </p>
          <ul className="flex flex-wrap gap-2">
            {visibleRemaining.map((f) => (
              <li key={f.key}>
                <Link
                  href={`/profile/build?mode=manual&field=${f.key}`}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[0.8125rem] font-medium transition-colors",
                    "border-gold-300/60 bg-gold-50 text-gold-800 hover:border-gold-500",
                    "dark:border-gold-400/30 dark:bg-gold-900/30 dark:text-gold-200",
                  )}
                >
                  {f.label}
                  {f.required && <span className="text-danger">*</span>}
                </Link>
              </li>
            ))}
          </ul>
          {remaining.length > COLLAPSED_LIMIT && (
            <button
              type="button"
              onClick={() => setShowAllRemaining((s) => !s)}
              className="mt-2 inline-flex min-h-9 items-center gap-1 text-[0.8125rem] font-medium text-muted hover:text-ink"
            >
              {showAllRemaining ? (
                <>
                  Kam dikhayein <ChevronUp className="size-3.5" />
                </>
              ) : (
                <>
                  {remaining.length - COLLAPSED_LIMIT} aur dikhayein <ChevronDown className="size-3.5" />
                </>
              )}
            </button>
          )}
        </div>
      )}
    </Card>
  );
}
