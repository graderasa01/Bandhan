import { CalendarCheck, ShieldCheck } from "lucide-react";
import Card from "@/components/ui/Card";
import Pill from "@/components/ui/Pill";

type Status = "NONE" | "ACTIVE" | "CANCELLED" | "EXPIRED";

const STATUS_COPY: Record<Status, { label: string; tone: "trust" | "gold" | "neutral"; line: string }> = {
  ACTIVE: { label: "Active", tone: "trust", line: "Aapka plan chal raha hai." },
  CANCELLED: {
    label: "Cancelled",
    tone: "gold",
    line: "Aapne cancel kar diya hai — access period khatam hone tak chalega.",
  },
  EXPIRED: { label: "Expired", tone: "gold", line: "Plan khatam ho gaya hai — dobara le sakte hain." },
  NONE: { label: "Free plan", tone: "neutral", line: "Aap abhi free plan par hain — roz 3 rishtey milte hain." },
};

/**
 * M09 §11: the "current plan" surface. Renewal date and auto-renew status are
 * always visible when they exist (§14 — auto-renew is never hidden). No
 * renewal row is shown while payments aren't live, because inventing one would
 * be exactly the kind of fake certainty §14 forbids.
 */
export default function SubscriptionStatusCard({
  planName,
  status,
  renewsOn,
  autoRenew,
  onCancel,
  cancelling,
}: {
  planName: string | null;
  status: Status;
  renewsOn?: string;
  autoRenew?: boolean;
  /** Present only on /user/subscription — the dashboard's summary card omits it. */
  onCancel?: () => void;
  cancelling?: boolean;
}) {
  const copy = STATUS_COPY[status];

  return (
    <Card variant="soft" padding="lg">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[0.8125rem] text-muted">Current plan</p>
          <p className="mt-1 text-xl font-semibold text-ink">{planName ?? "Free"}</p>
          <p className="mt-1.5 text-[0.875rem] text-muted">{copy.line}</p>
        </div>
        <Pill tone={copy.tone} size="md">
          {copy.label}
        </Pill>
      </div>

      {renewsOn && (
        <div className="mt-4 flex flex-col gap-2 border-t border-line pt-4 text-[0.875rem] text-muted">
          <span className="inline-flex items-center gap-2">
            <CalendarCheck className="size-4 shrink-0 text-trust" aria-hidden />
            {autoRenew ? `Agla renewal ${renewsOn}` : `Access ${renewsOn} tak rahega`}
          </span>
          <span className="inline-flex items-center gap-2">
            <ShieldCheck className="size-4 shrink-0 text-trust" aria-hidden />
            Auto-renew {autoRenew ? "on hai" : "off hai"}
          </span>
        </div>
      )}

      {onCancel && status === "ACTIVE" && (
        <button
          type="button"
          onClick={onCancel}
          disabled={cancelling}
          className="mt-4 min-h-11 text-[0.8125rem] font-medium text-muted underline underline-offset-2 hover:text-danger disabled:opacity-50"
        >
          {cancelling ? "Cancelling…" : "Cancel Plan"}
        </button>
      )}
    </Card>
  );
}
