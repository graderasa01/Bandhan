import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shared marketing-page CTA link — was copy-pasted nearly verbatim between
 * HomePageView and PartnerProgramPageView (components/public). Extracted
 * here so both consume one definition. Superset of both originals: the
 * `onDeep` / `ghostDeep` variants and `className` prop that only
 * HomePageView used are kept, since PartnerProgramPageView simply never
 * passed them — no behaviour change for either caller.
 */
export function CTALink({
  href,
  children,
  variant = "primary",
  className,
}: {
  /** UIAction.href is optional in the contract — no link, no CTA. */
  href?: string;
  children: ReactNode;
  variant?: "primary" | "onDeep" | "ghostDeep" | "secondary";
  className?: string;
}) {
  if (!href) return null;

  return (
    <Link
      href={href}
      className={cn(
        "group inline-flex h-12 items-center justify-center gap-2 rounded-full px-7 text-[0.9375rem] font-semibold",
        "transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
        "focus-visible:ring-2 focus-visible:ring-gold-600 focus-visible:ring-offset-2",
        variant === "primary" &&
          "bg-primary text-primary-fg shadow-md hover:-translate-y-0.5 hover:bg-primary-hover hover:shadow-gold focus-visible:ring-offset-bg",
        variant === "secondary" &&
          "border border-line-strong bg-surface text-ink hover:-translate-y-0.5 hover:border-gold-500 hover:bg-gold-50 focus-visible:ring-offset-bg dark:hover:bg-gold-900/30",
        // "Deep" here means "on the hero" specifically, not "on a dark
        // ground" — Kaagaz's hero pack flips light (D-21b), so these read
        // named hero-* tokens rather than hardcoding white/wine.
        variant === "onDeep" &&
          "bg-gradient-to-b from-gold-300 to-gold-500 text-wine-800 shadow-gold hover:-translate-y-0.5 hover:brightness-105 focus-visible:ring-offset-hero-ring-offset",
        variant === "ghostDeep" &&
          "border border-hero-border text-hero-fg hover:-translate-y-0.5 hover:border-hero-fg-muted hover:bg-hero-chip-bg focus-visible:ring-offset-hero-ring-offset",
        className,
      )}
    >
      {children}
      <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
    </Link>
  );
}

export default CTALink;
