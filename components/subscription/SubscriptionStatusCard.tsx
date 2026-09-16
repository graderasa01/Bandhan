import { CalendarCheck, ShieldCheck } from "lucide-react";
import Card from "@/components/ui/Card";
import Pill from "@/components/ui/Pill";
import { useT } from "@/components/i18n/LanguageProvider";

type Status = "NONE" | "ACTIVE" | "CANCELLED" | "EXPIRED" | "GRANTED";

const STATUS_COPY: Record<
  Status,
  { label: string; tone: "trust" | "gold" | "neutral"; line: string; lineKey: string }
> = {
  ACTIVE: {
    label: "Active",
    tone: "trust",
    line: "Aapka plan chal raha hai — end date ke baad apne aap band, koi paisa nahi katega.",
    lineKey: "subscription.statusActiveLine",
  },
  // A row an old "Cancel Plan" tap left behind. Nothing renews either way, so
  // to the member it is simply a plan that runs to its end date.
  CANCELLED: {
    label: "Active",
    tone: "trust",
    line: "Aapka plan end date tak chalega, phir apne aap band ho jayega.",
    lineKey: "subscription.statusCancelledLine",
  },
  EXPIRED: {
    label: "Expired",
    tone: "gold",
    line: "Plan khatam ho gaya hai — jab chahein dobara le sakte hain.",
    lineKey: "subscription.statusExpiredLine",
  },
  NONE: {
    label: "Free",
    tone: "neutral",
    line: "Aap free par hain — rishtey, interest, search aur photo sab free hain.",
    lineKey: "subscription.statusNoneLine",
  },
  // An admin handed this plan over by hand (UserEntitlementOverride). It is a
  // separate state from ACTIVE on purpose: nothing was paid, and it ends on a
  // date the user did not choose — showing it as a normal subscription would
  // be a small lie with a confusing ending.
  GRANTED: {
    label: "Gift",
    tone: "gold",
    line: "BandhanTak team ne ye plan aapko diya hai — koi payment nahi hui.",
    lineKey: "subscription.statusGrantedLine",
  },
};

/**
 * M09 §11: the "current plan" surface. The end date is always visible when
 * there is one (§14).
 *
 * There is no renewal line and no cancel button. Nothing renews (D-90): a plan
 * runs to its end date and stops. This card used to print "Agla renewal …" and
 * "Auto-renew on hai" beside a "Cancel Plan" button — a renewal that was never
 * built, which is exactly the fake certainty §14 forbids.
 */
export default function SubscriptionStatusCard({
  planName,
  status,
  endsOn,
}: {
  planName: string | null;
  status: Status;
  /** Pre-formatted end date. Absent when there is none (FREE, or a grant with no expiry). */
  endsOn?: string;
}) {
  const t = useT();
  const copy = STATUS_COPY[status];

  return (
    <Card variant="soft" padding="lg">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[0.8125rem] text-muted">{t("subscription.currentPlan", "Current plan")}</p>
          <p className="mt-1 text-xl font-semibold text-ink">{planName ?? "Free"}</p>
          <p className="mt-1.5 text-[0.875rem] text-muted">{t(copy.lineKey, copy.line)}</p>
        </div>
        <Pill tone={copy.tone} size="md">
          {copy.label}
        </Pill>
      </div>

      {endsOn && (
        <div className="mt-4 flex flex-col gap-2 border-t border-line pt-4 text-[0.875rem] text-muted">
          <span className="inline-flex items-center gap-2">
            <CalendarCheck className="size-4 shrink-0 text-trust" aria-hidden />
            {`${t("subscription.accessUntilLead", "Access ")}${endsOn}${t("subscription.accessUntilTail", " tak rahega")}`}
          </span>
          {status !== "GRANTED" && (
            <span className="inline-flex items-center gap-2">
              <ShieldCheck className="size-4 shrink-0 text-trust" aria-hidden />
              {t("subscription.noAutoRenew", "Apne aap renew nahi hota — bina aapke kahe paisa nahi katega")}
            </span>
          )}
        </div>
      )}
    </Card>
  );
}
