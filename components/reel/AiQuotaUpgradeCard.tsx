import Link from "next/link";
import { Sparkles } from "lucide-react";

/**
 * The Contextual Upgrade Card pattern from M09's spec (§9) — the first real
 * instance of it anywhere in the app. Shown exactly at the moment the limit
 * bites, not as a generic pricing page detour.
 */
export default function AiQuotaUpgradeCard({ message }: { message: string }) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-gold-300/60 bg-gradient-to-br from-gold-50 to-surface px-4 py-4 dark:border-gold-700/40 dark:from-gold-900/25 dark:to-surface">
      <span aria-hidden className="absolute -right-6 -top-6 size-24 rounded-full bg-gold-400/20 blur-2xl" />
      <div className="relative flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-gold-400 to-gold-600 text-primary-fg shadow-gold">
          <Sparkles className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[0.875rem] font-medium text-ink">{message}</p>
          <Link
            href="/user/subscription"
            className="mt-2 inline-flex h-9 items-center rounded-full bg-gradient-to-b from-gold-400 to-gold-600 px-4 text-[0.8125rem] font-semibold text-primary-fg shadow-gold transition-transform hover:-translate-y-0.5"
          >
            Plans Dekhein
          </Link>
        </div>
      </div>
    </div>
  );
}
