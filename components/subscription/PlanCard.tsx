import Link from "next/link";
import { BadgeCheck, Tag } from "lucide-react";
import type { PlanPreviewViewModel } from "@/lib/contracts/publicPages";
import Card from "@/components/ui/Card";
import Pill from "@/components/ui/Pill";
import { cn } from "@/lib/utils";
import type { Translate } from "@/lib/i18n/translate";

type Props = {
  plan: PlanPreviewViewModel;
  /**
   * Translator from the host. Optional because this card renders in both a
   * server tree (/pricing) and a client one (/user/subscription), so it cannot
   * reach for `getT` or `useT` itself. Without it every string falls back to
   * its inline Hinglish, exactly as `t()` would.
   */
  t?: Translate;
  /** Where the CTA goes. Ignored when `onCtaClick` is set. Omit both for no CTA. */
  ctaHref?: string;
  /**
   * Runs a real checkout instead of navigating — used on /user/subscription,
   * where choosing a plan has to start a payment rather than link to a
   * marketing page. Renders a button in place of the `ctaHref` link.
   */
  onCtaClick?: () => void;
  ctaLabel?: string;
  ctaBusy?: boolean;
  /** Renders the "current plan" treatment instead of a CTA. */
  isCurrent?: boolean;
};

/**
 * The one plan card. Used by /pricing and /user/subscription so a plan can
 * never look like two different products depending on which page you land on.
 *
 * 03_ui_ux_spec §17.1 requires: name, price, duration, benefits, limits,
 * partner discount (when it applies), CTA.
 */
export default function PlanCard({ plan, ctaHref, onCtaClick, ctaLabel, ctaBusy, isCurrent, t }: Props) {
  const tr: Translate = t ?? ((_key, fallback) => fallback);
  const ctaClassName = cn(
    "inline-flex h-12 w-full items-center justify-center rounded-full px-6 text-[0.9375rem] font-semibold",
    "transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
    "focus-visible:ring-2 focus-visible:ring-gold-600 focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
    "disabled:pointer-events-none disabled:opacity-60",
    plan.isRecommended
      ? "bg-primary text-primary-fg shadow-md hover:-translate-y-0.5 hover:bg-primary-hover hover:shadow-gold"
      : "border border-line-strong bg-surface text-ink hover:-translate-y-0.5 hover:border-gold-500 hover:bg-gold-50 dark:hover:bg-gold-900/30",
  );
  return (
    <Card
      variant={plan.isRecommended ? "elevated" : "default"}
      padding="lg"
      className={cn(
        "relative flex h-full flex-col",
        plan.isRecommended && "border-gold-500 ring-1 ring-gold-500/30",
        isCurrent && "border-trust/50 ring-1 ring-trust/25",
      )}
    >
      {plan.isRecommended && !isCurrent && (
        <Pill tone="gold" size="sm" className="absolute -top-3 left-6">
          {tr("subscription.mostPopular", "Sabse popular")}
        </Pill>
      )}
      {isCurrent && (
        <Pill tone="trust" size="sm" className="absolute -top-3 left-6">
          {tr("subscription.yourCurrentPlan", "Aapka current plan")}
        </Pill>
      )}

      <p className="text-lg font-semibold text-ink">{plan.name}</p>

      <div className="mt-3 flex items-baseline gap-1.5">
        {plan.originalPrice && (
          <span className="text-sm text-subtle line-through">{plan.originalPrice.display}</span>
        )}
        <span className="font-[family-name:var(--font-display)] text-4xl leading-none text-ink">
          {plan.price.display}
        </span>
        <span className="text-[0.875rem] text-muted">{tr("subscription.perMonth", "/ mahina")}</span>
      </div>

      {/* An admin offer, with the date it stops. Same rule D-13 set for the
          partner discount: a price that is only true until Sunday says so on
          the card, or the first renewal is a surprise. */}
      {plan.offer && (
        <div className="mt-3">
          <Pill tone="rose" size="sm">
            <Tag className="size-3" />
            {plan.offer.label}
          </Pill>
          <p className="mt-1.5 text-[0.75rem] text-muted">
            {plan.offer.isFree
              ? tr("subscription.offerFreeUntil", "Abhi bilkul free —")
              : tr("subscription.offerUntil", "Ye daam")}{" "}
            {new Date(plan.offer.endsAt).toLocaleString("en-IN", {
              day: "numeric",
              month: "short",
              hour: "numeric",
              minute: "2-digit",
            })}{" "}
            {tr("subscription.offerTill", "tak")}. {tr("subscription.offerThereafter", "Uske baad")}{" "}
            {plan.originalPrice?.display}/{tr("subscription.perMonthShort", "mahina")}.
          </p>
        </div>
      )}

      {/* D-13: never the discounted price alone — both lines or neither. */}
      {plan.partnerOffer && (
        <div className="mt-3">
          <Pill tone="trust" size="sm">
            {plan.partnerOffer.firstMonth}
          </Pill>
          <p className="mt-1.5 text-[0.75rem] text-muted">{plan.partnerOffer.thereafter}</p>
        </div>
      )}

      <ul className="mt-6 grid flex-1 grid-cols-2 gap-x-4 gap-y-2.5 border-t border-line pt-6">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-[0.8125rem] text-ink">
            <BadgeCheck className="mt-0.5 size-3.5 shrink-0 text-trust" />
            {f}
          </li>
        ))}
        {plan.limitations?.map((l) => (
          <li key={l} className="flex items-start gap-2 text-[0.8125rem] text-subtle">
            <span className="mt-1.5 size-1 shrink-0 rounded-full bg-subtle" />
            {l}
          </li>
        ))}
      </ul>

      <div className="mt-6">
        {isCurrent ? (
          <p className="flex h-12 items-center justify-center rounded-full bg-trust-bg text-[0.9375rem] font-semibold text-trust">
            {tr("subscription.planActive", "Active")}
          </p>
        ) : onCtaClick ? (
          <button type="button" onClick={onCtaClick} disabled={ctaBusy} className={ctaClassName}>
            {ctaBusy
              ? tr("subscription.pleaseWait", "Please wait…")
              : (ctaLabel ?? `${tr("subscription.choosePlan", "Choose")} ${plan.name}`)}
          </button>
        ) : (
          ctaHref && (
            <Link href={ctaHref} className={ctaClassName}>
              {ctaLabel ?? `${tr("subscription.choosePlan", "Choose")} ${plan.name}`}
            </Link>
          )
        )}
      </div>
    </Card>
  );
}
