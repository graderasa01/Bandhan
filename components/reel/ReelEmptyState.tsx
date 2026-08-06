import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import Button from "@/components/ui/Button";
import ContextualUpgradeCard from "@/components/subscription/ContextualUpgradeCard";
import type { ReelViewModel } from "@/lib/contracts/reel";

/**
 * A completed-ritual moment, not a dead end — this is the difference between
 * "you're done for today" and a generic empty screen.
 *
 * The upgrade card sits *below* that moment, never in place of it: M09 §3's
 * whole point is that the day still ends well for someone who never pays.
 */
export default function ReelEmptyState({
  dailyLimit,
  sentCount,
  upgradeHint,
  onReplay,
}: {
  dailyLimit: number;
  sentCount: number;
  upgradeHint: ReelViewModel["upgradeHint"];
  /** Present only when today's deck has cards to replay — absent on a genuinely empty pool. */
  onReplay?: () => void;
}) {
  return (
    <div className="mx-auto flex max-w-sm flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="relative grid size-16 place-items-center rounded-full bg-gradient-to-br from-gold-400 to-gold-600 text-primary-fg shadow-gold">
        <span aria-hidden className="absolute inset-0 rounded-full bg-gold-400/40 blur-xl" />
        <CheckCircle2 className="relative size-8" />
      </span>

      <div>
        <p className="text-lg font-semibold text-ink">Aaj ke rishtey khatam</p>
        <p className="mt-1.5 text-[0.875rem] leading-relaxed text-muted">
          Aaj {dailyLimit} me se {sentCount} ko interest bheja. Kal subah naye rishtey ready honge.
        </p>
      </div>

      {onReplay && (
        <Button variant="primary" size="md" fullWidth onClick={onReplay}>
          View Again
        </Button>
      )}

      <div className="mt-2 flex w-full flex-col gap-2 sm:flex-row">
        <Link href="/user/matches" className="flex-1">
          <Button variant="secondary" size="md" fullWidth>
            View Shortlist
          </Button>
        </Link>
        <Link href="/user/dashboard" className="flex-1">
          <Button variant="ghost" size="md" fullWidth>
            Come Back Tomorrow
          </Button>
        </Link>
      </div>

      {upgradeHint && (
        <ContextualUpgradeCard
          className="mt-4 w-full text-left"
          trigger="REEL_EXHAUSTED"
          usedCount={dailyLimit}
          suggestedPlan={upgradeHint.planName}
          suggestedBenefit={`roz ${upgradeHint.reelPerDay} profiles`}
          href="/user/subscription"
        />
      )}
    </div>
  );
}
