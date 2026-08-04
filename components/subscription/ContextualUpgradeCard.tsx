"use client";

import { useState } from "react";
import Link from "next/link";
import { Sparkles, X } from "lucide-react";
import Card from "@/components/ui/Card";
import { cn } from "@/lib/utils";

/** M09 spec §9 trigger table. One entry per moment where value is obvious. */
export type UpgradeTrigger =
  | "REEL_EXHAUSTED"
  | "INTEREST_LIMIT"
  | "CHAT_LOCKED"
  | "AI_LIMIT"
  | "FAMILY_SEAT"
  | "HIGH_ENGAGEMENT";

export type ContextualUpgradeCardProps = {
  trigger: UpgradeTrigger;
  /** The user's own number — spec §9 requires quoting real behaviour. */
  usedCount?: number;
  /** Plan being suggested, e.g. "Standard". */
  suggestedPlan: string;
  /** What that plan gives for this trigger, e.g. "roz 15 profiles". */
  suggestedBenefit: string;
  priceDisplay?: string;
  href?: string;
  /** Respectful exit copy — never "no thanks, I hate savings". */
  dismissLabel?: string;
  onDismiss?: () => void;
  className?: string;
};

function headline(trigger: UpgradeTrigger, usedCount?: number): string {
  const n = usedCount ?? 0;
  switch (trigger) {
    case "REEL_EXHAUSTED":
      return `Aaj ke ${n} rishtey dekh liye 🙏`;
    case "INTEREST_LIMIT":
      return `Is mahine ke ${n} interest bhej diye`;
    case "CHAT_LOCKED":
      return "Baat karne ke liye plan chahiye";
    case "AI_LIMIT":
      return `Aaj ke ${n} sawaal ho gaye`;
    case "FAMILY_SEAT":
      return "Family member add karna hai?";
    case "HIGH_ENGAGEMENT":
      return `Aapne is hafte ${n} profiles shortlist ki`;
  }
}

/**
 * M09's "jaadu" — contextual unlock, not a paywall.
 *
 * Three rules from the module doc that this component encodes structurally:
 *  1. it quotes the user's own behaviour (`usedCount`), never a generic pitch;
 *  2. "kabhi bhi cancel" is always present — it is not an optional prop;
 *  3. dismiss is always available and always respectful.
 *
 * Deliberately absent: countdown timers, "sirf aaj!" urgency, or any way to
 * render this without an exit. Those are named as anti-patterns in §14.
 */
export default function ContextualUpgradeCard({
  trigger,
  usedCount,
  suggestedPlan,
  suggestedBenefit,
  priceDisplay,
  href = "/pricing",
  dismissLabel = "Kal aaun",
  onDismiss,
  className,
}: ContextualUpgradeCardProps) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  function dismiss() {
    setDismissed(true);
    onDismiss?.();
  }

  return (
    <Card variant="elevated" padding="lg" className={cn("relative", className)}>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Ye suggestion band karein"
        className="absolute right-3 top-3 grid size-11 place-items-center rounded-full text-subtle transition-colors hover:bg-bg-subtle hover:text-ink"
      >
        <X className="size-4" />
      </button>

      <span className="inline-flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-gold-400 to-gold-600 text-primary-fg shadow-gold">
        <Sparkles className="size-4" />
      </span>

      <p className="mt-3 pr-10 text-lg font-semibold text-ink">{headline(trigger, usedCount)}</p>

      <p className="mt-2 max-w-md text-[0.9375rem] leading-relaxed text-muted">
        {suggestedPlan} plan me {suggestedBenefit} milti hain.
      </p>

      {priceDisplay && (
        <p className="mt-3 text-[0.875rem] text-ink">
          <span className="font-semibold">{priceDisplay}</span>
          <span className="text-muted"> / mahina · kabhi bhi cancel</span>
        </p>
      )}
      {!priceDisplay && <p className="mt-3 text-[0.875rem] text-muted">Kabhi bhi cancel kar sakte hain.</p>}

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <Link
          href={href}
          className={cn(
            "inline-flex h-12 items-center justify-center rounded-full px-6 text-[0.9375rem] font-semibold",
            "bg-primary text-primary-fg shadow-md transition-all duration-200",
            "hover:-translate-y-0.5 hover:bg-primary-hover hover:shadow-gold",
            "focus-visible:ring-2 focus-visible:ring-gold-600 focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
          )}
        >
          {suggestedPlan} dekhein
        </Link>
        <button
          type="button"
          onClick={dismiss}
          className="inline-flex h-12 items-center justify-center rounded-full px-6 text-[0.9375rem] font-medium text-muted transition-colors hover:bg-bg-subtle hover:text-ink"
        >
          {dismissLabel}
        </button>
      </div>
    </Card>
  );
}
