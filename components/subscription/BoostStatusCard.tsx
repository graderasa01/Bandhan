import Link from "next/link";
import { ArrowRight, Rocket } from "lucide-react";
import Card from "@/components/ui/Card";
import { getT } from "@/lib/i18n/server";

/**
 * D-11's `boost` promise, made checkable rather than just a comparison-table
 * row. STANDARD/PREMIUM subscribers see exactly when their boost ends;
 * everyone else sees what unlocks it — never a locked/blurred teaser, since
 * there's nothing to hide here, only something to state plainly.
 *
 * Stays the compact summary here; `/user/boost` is the full page — status
 * ring, the real before/after ranking numbers, and the manual (credit-spent)
 * activation path this card has no room for.
 */
export default async function BoostStatusCard({
  active,
  activeUntil,
  planHasBoost,
}: {
  active: boolean;
  activeUntil: Date | null;
  /** Whether the current plan includes boost at all — shapes the "off" copy. */
  planHasBoost: boolean;
}) {
  const t = await getT();
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
        <div className="min-w-0 flex-1">
          <p className="text-[0.9375rem] font-semibold text-ink">
            {t("subscription.boostStatusCard.title", "Profile Boost")}{" "}
            {active ? t("subscription.boostStatusCard.activeSuffix", "— Active") : ""}
          </p>
          <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-muted">
            {active && activeUntil
              ? `${t("subscription.boostActiveLead", "Aapki profile abhi Rishta Reel me thodi upar dikh rahi hai — ")}${activeUntil.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}${t("subscription.boostActiveTail", " tak.")}`
              : planHasBoost
                ? t("subscription.boostComingSoon", "Aapke plan me boost shaamil hai — jald active hoga.")
                : t("subscription.boostLocked", "Standard ya Premium plan me profile boost shaamil hai.")}
          </p>
          <Link
            href="/user/boost"
            className="mt-1.5 inline-flex items-center gap-1 text-[0.75rem] font-semibold text-gold-700 transition-colors hover:text-gold-800"
          >
            {t("subscription.viewDetails", "View Details")}
            <ArrowRight className="size-3" />
          </Link>
        </div>
      </div>
    </Card>
  );
}
