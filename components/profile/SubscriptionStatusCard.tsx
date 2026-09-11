import Link from "next/link";
import { ArrowRight, BadgeCheck, Gift } from "lucide-react";
import type { UIAction } from "@/lib/contracts/common";
import { cn } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";

interface Props {
  currentPlan: string | null;
  status: "NONE" | "ACTIVE" | "EXPIRED";
  /**
   * Where the access came from. An admin grant is never dressed up as a
   * purchase (there is no fake Subscription row behind it), so the card says
   * so — otherwise a user whose plan silently changed has no way to tell why,
   * or that it ends.
   */
  source?: "BILLED" | "ADMIN_GRANT";
  /** Pre-formatted end date for an admin grant; null = no expiry. */
  grantedUntil?: string | null;
  cta: UIAction;
}

export default async function SubscriptionStatusCard({
  currentPlan,
  status,
  source = "BILLED",
  grantedUntil = null,
  cta,
}: Props) {
  const t = await getT();
  const granted = status === "ACTIVE" && source === "ADMIN_GRANT";
  // An active plan is a trust chip; a gift from the team is the seal gold —
  // the one status here that someone chose to give. Expired and none are
  // quiet: a warn chip on "No Plan" would nag everyone on the free tier.
  const chipTone = granted
    ? "bt-chip--gold"
    : status === "ACTIVE"
      ? "bt-chip--trust"
      : status === "EXPIRED"
        ? "bt-chip--warn"
        : "bt-chip--muted";
  const statusLabel =
    status === "ACTIVE"
      ? t("profile.subscriptionStatus.active", "Active")
      : status === "EXPIRED"
        ? t("profile.subscriptionStatus.expired", "Expired")
        : t("profile.subscriptionStatus.noPlan", "No Plan");

  return (
    <div className="bt-card bt-card--foil p-5 sm:p-6">
      <p className="bt-microlabel">{t("profile.subscriptionStatus.title", "Subscription Status")}</p>
      <div className="mt-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="bt-display text-[1.35rem] leading-snug">
            {currentPlan || t("profile.subscriptionStatus.noActivePlan", "No Active Plan")}
          </div>
          <div className="mt-1 text-sm text-muted">
            {granted
              ? grantedUntil
                ? t("profile.subscriptionStatus.grantedUntil", "BandhanTak team ki taraf se — {date} tak").replace(
                    "{date}",
                    grantedUntil,
                  )
                : t("profile.subscriptionStatus.grantedNoExpiry", "BandhanTak team ki taraf se aapko diya gaya hai")
              : status === "NONE"
                ? t("profile.subscriptionStatus.chooseBestPlan", "Apne liye best plan chunein")
                : status === "ACTIVE"
                  ? t("profile.subscriptionStatus.planActive", "Aapka plan active hai")
                  : t("profile.subscriptionStatus.renewPlan", "Plan renew karein")}
          </div>
        </div>
        <span className={cn("bt-chip shrink-0", chipTone)}>
          {granted ? <Gift /> : status === "ACTIVE" ? <BadgeCheck /> : null}
          {granted ? t("profile.subscriptionStatus.gift", "Gift") : statusLabel}
        </span>
      </div>
      <Link
        href={cta.href ?? "/user/subscription"}
        className="bt-cta mt-5 inline-flex h-12 items-center gap-2 rounded-full px-5 text-sm font-semibold transition-transform duration-200 hover:-translate-y-0.5"
      >
        {cta.label}
        <ArrowRight className="size-4" />
      </Link>
    </div>
  );
}
