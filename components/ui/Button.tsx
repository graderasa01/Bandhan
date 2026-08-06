"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/motion";

/**
 * D-21 note: `primary` puts DARK text on gold fill (`primary-fg`), never white.
 * Gold-as-text anywhere uses `primary-text` (gold-700, 5.43:1).
 * D-23: every size is at least 48px tall.
 */
const button = cva(
  [
    "relative inline-flex items-center justify-center gap-2 whitespace-nowrap select-none",
    "rounded-full font-semibold tracking-tight",
    "transition-[transform,box-shadow,background-color,border-color,color] duration-200",
    "ease-[cubic-bezier(0.22,1,0.36,1)]",
    "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
    "disabled:pointer-events-none disabled:opacity-45",
    "active:scale-[0.97]",
    "[&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        primary: [
          "bg-primary text-primary-fg shadow-md",
          "hover:bg-primary-hover hover:shadow-gold hover:-translate-y-0.5",
        ],
        secondary: [
          "border border-line-strong bg-surface text-ink shadow-xs",
          "hover:border-gold-500 hover:bg-gold-50 hover:-translate-y-0.5 hover:shadow-sm",
          "dark:hover:bg-gold-900/40",
        ],
        ghost: ["text-muted hover:bg-bg-subtle hover:text-ink"],
        /**
         * The decisive-action colour — D-26 revised, 2026-08-02; reads through
         * `--bt-accent` (D-21b, 2026-08-05) rather than a hardcoded shade, so
         * a theme pack switch (/admin/theme) actually recolours it. Kundan
         * (the default pack) sets that token to wine-700/800, chosen because
         * `primary` already owns gold for everyday actions — "Interest
         * bhejein" gets mehroon instead, the bridal colour in Indian
         * weddings, rather than a random third hue. Every pack's accent is
         * D-21-audited against both a white label and its own ground before
         * it ships (see globals.css's D-21b header comment).
         */
        accent: [
          "bg-accent text-accent-fg shadow-md",
          "hover:bg-accent-hover hover:-translate-y-0.5",
          "hover:shadow-[0_10px_30px_color-mix(in_srgb,var(--color-accent)_35%,transparent)]",
          "focus-visible:ring-accent",
        ],
        danger: ["bg-danger text-white shadow-sm hover:brightness-110 hover:-translate-y-0.5"],
        success: ["bg-trust text-white shadow-sm hover:brightness-110 hover:-translate-y-0.5"],
        "ai-action": [
          "border border-gold-300 bg-gradient-to-br from-gold-50 to-surface text-primary-text shadow-xs",
          "hover:border-gold-500 hover:shadow-md hover:-translate-y-0.5",
          "dark:from-gold-900/50 dark:to-surface",
        ],
        inverse: ["bg-surface-inverse text-inverse shadow-md hover:-translate-y-0.5 hover:shadow-lg"],
        link: ["h-auto p-0 text-primary-text underline-offset-4 hover:underline active:scale-100"],
      },
      size: {
        // `sm` is visually 40px but carries a 48px hit area (D-23, .touch-target).
        sm: "h-10 px-4 text-sm touch-target",
        md: "h-12 px-6 text-[0.9375rem]",
        lg: "h-14 px-8 text-base",
        icon: "size-12 p-0",
        "icon-sm": "size-10 p-0 touch-target",
      },
      fullWidth: { true: "w-full", false: "" },
    },
    defaultVariants: { variant: "primary", size: "md", fullWidth: false },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {
  loading?: boolean;
  children: ReactNode;
  /** Kept for v1 compatibility — prefer aria-label. */
  ariaLabel?: string;
  icon?: ReactNode;
  iconAfter?: ReactNode;
  /** Fire device haptic on press. On by default for primary actions. */
  hapticOnPress?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant,
    size,
    fullWidth,
    loading = false,
    disabled = false,
    children,
    className,
    ariaLabel,
    icon,
    iconAfter,
    hapticOnPress = true,
    onClick,
    type = "button",
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-label={ariaLabel ?? props["aria-label"]}
      aria-busy={loading || undefined}
      onClick={(e) => {
        if (hapticOnPress) haptic("tap");
        onClick?.(e);
      }}
      className={cn(button({ variant, size, fullWidth }), className)}
      {...props}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
      {!loading && iconAfter}
    </button>
  );
});

export default Button;
