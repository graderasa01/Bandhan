import Link from "next/link";
import type { UIAction } from "@/lib/contracts/common";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";

interface Props {
  currentPlan: string | null;
  status: "NONE" | "ACTIVE" | "EXPIRED";
  cta: UIAction;
}

export default function SubscriptionStatusCard({ currentPlan, status, cta }: Props) {
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
            {status === "NONE"
              ? "Apne liye best plan chunein"
              : status === "ACTIVE"
                ? "Aapka plan active hai"
                : "Plan renew karein"}
          </div>
        </div>
        <Badge variant={badgeVariant}>{statusLabel}</Badge>
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
