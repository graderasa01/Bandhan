"use client";

import { useEffect, useState } from "react";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * Live countdown to the next Circle milestone.
 *
 * Rendered client-side because the server component that owns this page is
 * cached per request — a countdown baked at render time would be wrong the
 * moment the user looked at it. `suppressHydrationWarning` is not used; the
 * first client paint intentionally matches the server's by starting from
 * `null` and filling in on mount.
 */
export default function CircleCountdown({ target, label }: { target: string; label: string }) {
  const t = useT();
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const to = new Date(target).getTime();
    const tick = () => setRemaining(Math.max(0, to - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);

  if (remaining === null) {
    return <span className="tabular-nums text-muted">—</span>;
  }

  const totalSeconds = Math.floor(remaining / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts = days > 0 ? [pad(days), pad(hours), pad(minutes)] : [pad(hours), pad(minutes), pad(seconds)];
  const units = days > 0
    ? [t("circle.countdown.days", "din"), t("circle.countdown.hours", "ghante"), t("circle.countdown.minutes", "min")]
    : [t("circle.countdown.hours", "ghante"), t("circle.countdown.minutes", "min"), t("circle.countdown.seconds", "sec")];

  return (
    <div>
      <p className="text-[0.75rem] font-semibold uppercase tracking-wide text-wine-600 dark:text-wine-300">{label}</p>
      <div className="mt-2 flex items-stretch gap-2">
        {parts.map((value, i) => (
          <div
            key={units[i]}
            className="flex min-w-14 flex-col items-center rounded-xl border border-gold-300/50 bg-gradient-to-b from-gold-50 to-surface px-3 py-2 shadow-xs dark:border-gold-700/40 dark:from-gold-900/25 dark:to-surface"
          >
            <span className="font-[family-name:var(--font-display)] text-[1.75rem] font-bold leading-none tabular-nums text-wine-700 dark:text-wine-200">
              {value}
            </span>
            <span className="mt-1 text-[0.6875rem] uppercase tracking-wide text-subtle">{units[i]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
