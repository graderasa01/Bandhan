import Link from "next/link";
import type { UIAction } from "@/lib/contracts/common";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";

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

export default function SubscriptionStatusCard({
  currentPlan,
  status,
  source = "BILLED",
  grantedUntil = null,
  cta,
}: Props) {
  const granted = status === "ACTIVE" && source === "ADMIN_GRANT";
  const badgeVariant: "pending" | "complete" | "incomplete" =
    status === "ACTIVE" ? "complete" : status === "EXPIRED" ? "incomplete" : "pending";
  const statusLabel = status === "ACTIVE" ? "Active" : status === "EXPIRED" ? "Expired" : "No Plan";

  return (
    <Card variant="default" padding="lg">
      <h3 className="text-base font-semibold text-wine-700">Subscription Status</h3>
      <div className="mt-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-ink">{currentPlan || "No Active Plan"}</div>
          <div className="text-sm text-muted">
            {granted
              ? grantedUntil
                ? `BandhanTak team ki taraf se — ${grantedUntil} tak`
                : "BandhanTak team ki taraf se aapko diya gaya hai"
              : status === "NONE"
                ? "Apne liye best plan chunein"
                : status === "ACTIVE"
                  ? "Aapka plan active hai"
                  : "Plan renew karein"}
          </div>
        </div>
        <Badge variant={badgeVariant}>{granted ? "Gift" : statusLabel}</Badge>
      </div>
      <Link
        href={cta.href ?? "/user/subscription"}
        className="mt-4 inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-fg shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-gold"
      >
        {cta.label}
      </Link>
    </Card>
  );
}
