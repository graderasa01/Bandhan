import { Rocket } from "lucide-react";
import ProgressRing from "@/components/ui/ProgressRing";
import { REWARD_BOOST_HOURS } from "@/lib/services/boost/boostService";

function formatUntil(d: Date): string {
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) + ", " + d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

/**
 * The "kitna boost ho raha hai" visual — a ring, not a made-up percentage.
 *
 * Two honest states, not one fudged one:
 *  - Plan-included boost (STANDARD/PREMIUM) renews on every payment capture
 *    (`syncBoostFromSubscription`) — it isn't draining toward anything, so it
 *    reads as a steady "on", full ring, no countdown.
 *  - Reward-earned boost is a real 24h window (`REWARD_BOOST_HOURS`) — the
 *    ring drains as it actually elapses, because that urgency is true.
 * Inventing a countdown for the plan case would be exactly the fake-urgency
 * pattern D-61 rules out; this only animates where something is really ending.
 */
export default function BoostHero({
  active,
  activeUntil,
  planHasBoost,
}: {
  active: boolean;
  activeUntil: Date | null;
  planHasBoost: boolean;
}) {
  const hoursLeft = activeUntil ? Math.max(0, (activeUntil.getTime() - Date.now()) / 3_600_000) : 0;
  const showCountdown = active && !planHasBoost;
  const ringValue = showCountdown ? Math.min(100, (hoursLeft / REWARD_BOOST_HOURS) * 100) : active ? 100 : 0;

  const timeLabel = !active
    ? "Off"
    : showCountdown
      ? hoursLeft >= 1
        ? `${Math.round(hoursLeft)}h baaki`
        : `${Math.max(1, Math.round(hoursLeft * 60))}m baaki`
      : "Active";

  const statusLine = !active
    ? "Abhi boost active nahi hai — neeche se activate ya kamaayein."
    : planHasBoost
      ? "Aapke plan me boost shaamil hai — subscription chalu rehte hue hamesha active rehta hai."
      : activeUntil
        ? `Aapki profile abhi dusron ke Rishta Reel me thodi upar dikh rahi hai — ${formatUntil(activeUntil)} tak.`
        : "";

  return (
    <div className="relative flex flex-wrap items-center gap-6">
      <ProgressRing value={ringValue} size={132} thickness={11} glow={active} unknown={!active}>
        <div className="text-center">
          <Rocket className={active ? "mx-auto size-5 text-gold-700" : "mx-auto size-5 text-subtle"} />
          <span
            className={
              active
                ? "mt-1 block font-[family-name:var(--font-display)] text-sm font-bold text-ink"
                : "mt-1 block text-xs font-medium text-subtle"
            }
          >
            {timeLabel}
          </span>
        </div>
      </ProgressRing>

      <div className="min-w-0 flex-1">
        <p className="text-[0.9375rem] font-semibold text-ink">
          Profile Boost {active ? "— Active" : "— Off"}
        </p>
        <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted">{statusLine}</p>
      </div>
    </div>
  );
}
