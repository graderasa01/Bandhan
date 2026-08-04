import type { ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const pill = cva(
  "inline-flex w-fit items-center gap-1.5 rounded-full font-medium [&_svg]:shrink-0",
  {
    variants: {
      tone: {
        neutral: "border border-line bg-surface text-muted",
        gold: "border border-gold-300/50 bg-gold-50 text-gold-700 dark:bg-gold-900/40 dark:text-gold-200",
        trust: "border border-trust/25 bg-trust-bg text-trust",
        rose: "border border-rose-200/70 bg-rose-50 text-rose-700 dark:border-rose-400/25 dark:bg-rose-900/50 dark:text-rose-200",
        wine: "border border-wine-200/60 bg-wine-50 text-wine-600 dark:border-wine-400/25 dark:bg-wine-900/50 dark:text-wine-200",
        danger: "border border-danger/25 bg-danger-bg text-danger",
        onDeep: "border border-white/15 bg-white/10 text-white backdrop-blur-sm",
      },
      size: {
        sm: "px-2.5 py-1 text-[0.6875rem] [&_svg]:size-3",
        md: "px-3 py-1.5 text-xs [&_svg]:size-3.5",
      },
    },
    defaultVariants: { tone: "neutral", size: "md" },
  },
);

export default function Pill({
  children,
  tone,
  size,
  className,
}: VariantProps<typeof pill> & { children: ReactNode; className?: string }) {
  return <span className={cn(pill({ tone, size }), className)}>{children}</span>;
}
