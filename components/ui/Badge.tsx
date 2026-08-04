import { ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

type BadgeVariant =
  | "verified" | "complete" | "pending" | "incomplete"
  | "rejected" | "blocked" | "paid" | "free"
  | "partner-referred" | "ai-suggested" | "low-confidence"
  | "needs-review" | "commission-pending" | "commission-paid"
  | "high-confidence" | "medium-confidence";

interface BadgeProps {
  variant: BadgeVariant;
  children: ReactNode;
  size?: "sm" | "md";
  icon?: ReactNode;
  className?: string;
}

// Internal-only restyle — prop API is unchanged (15+ call sites across
// admin/partner pages depend on it), only the rendering swapped from inline
// CSS-var styles to Tailwind/cva.
const badgeStyles = cva("inline-flex items-center gap-1 rounded-sm font-medium", {
  variants: {
    tone: {
      trust: "bg-trust/10 text-trust",
      warn: "bg-warn-bg text-warn",
      danger: "bg-danger-bg text-danger",
      neutral: "bg-bg-subtle text-muted",
      primary: "bg-gold-100 text-gold-800 dark:bg-gold-900/40 dark:text-gold-200",
      info: "bg-info-bg text-info",
    },
    size: {
      sm: "px-2 py-0.5 text-[0.6875rem]",
      md: "px-2.5 py-1 text-xs",
    },
  },
  defaultVariants: { tone: "neutral", size: "md" },
});

const TONE_BY_VARIANT: Record<BadgeVariant, VariantProps<typeof badgeStyles>["tone"]> = {
  verified: "trust",
  complete: "trust",
  pending: "warn",
  incomplete: "warn",
  rejected: "danger",
  blocked: "danger",
  paid: "trust",
  free: "neutral",
  "partner-referred": "primary",
  "ai-suggested": "info",
  "low-confidence": "warn",
  "needs-review": "warn",
  "commission-pending": "warn",
  "commission-paid": "trust",
  "high-confidence": "trust",
  "medium-confidence": "warn",
};

export default function Badge({ variant, children, size = "md", icon, className }: BadgeProps) {
  return (
    <span className={cn(badgeStyles({ tone: TONE_BY_VARIANT[variant], size }), className)}>
      {icon && (
        <span aria-hidden="true" className="[&_svg]:size-3.5">
          {icon}
        </span>
      )}
      {children}
    </span>
  );
}
