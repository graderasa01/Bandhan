import { Rocket } from "lucide-react";
import Card from "@/components/ui/Card";

/**
 * D-11's `boost` promise, made checkable rather than just a comparison-table
 * row. STANDARD/PREMIUM subscribers see exactly when their boost ends;
 * everyone else sees what unlocks it — never a locked/blurred teaser, since
 * there's nothing to hide here, only something to state plainly.
 */
export default function BoostStatusCard({
  active,
  activeUntil,
  planHasBoost,
}: {
  active: boolean;
  activeUntil: Date | null;
  /** Whether the current plan includes boost at all — shapes the "off" copy. */
  planHasBoost: boolean;
}) {
  return (
    <Card variant="soft" padding="md" className="mt-4">
      <div className="flex items-start gap-3">
        <span
          className={`grid size-9 shrink-0 place-items-center rounded-full ${
            active ? "bg-gradient-to-b from-gold-400 to-gold-600 text-primary-fg" : "bg-bg-subtle text-subtle"
          }`}
        >
          <Rocket className="size-4" />
        </span>
        <div>
          <p className="text-[0.9375rem] font-semibold text-ink">
            Profile Boost {active ? "— Active" : ""}
          </p>
          <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-muted">
            {active && activeUntil
              ? `Aapki profile abhi Rishta Reel me thodi upar dikh rahi hai — ${activeUntil.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} tak.`
              : planHasBoost
                ? "Aapke plan me boost shaamil hai — jald active hoga."
                : "Standard ya Premium plan me profile boost shaamil hai."}
          </p>
        </div>
      </div>
    </Card>
  );
}
