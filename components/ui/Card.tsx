import type { ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * M01 Design System · Card
 *
 * v1 variant/padding names preserved. Depth now comes from layered warm
 * shadows + a 1px inner top highlight rather than flat borders.
 */
const card = cva(
  ["relative rounded-lg transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"],
  {
    variants: {
      variant: {
        /* The weights of the glass system (globals.css, "THE BANDHANTAK GLASS
           SYSTEM"). `bg-surface` and `bg-surface-2` are translucent inside
           `.bt-glass` and opaque in the light packs, so one set of classes
           carries both worlds; the blur is spent on the weights that earn it
           and left off `soft`, which a page uses many times over. */
        // No blur on the default card: a page can hold fifteen of them, and
        // fifteen backdrop filters is what a mid-range phone feels on a
        // scroll. The translucent fill and the hairline carry the material;
        // blur is spent on the surfaces that have to win — `elevated`.
        default: "border border-line bg-surface shadow-sm",
        soft: "border border-line/70 bg-surface-2 shadow-xs",
        elevated: "border border-line bg-surface shadow-lg backdrop-blur-lg hairline-top",
        interactive:
          "border border-line bg-surface shadow-sm cursor-pointer hover:-translate-y-1 hover:border-line-strong hover:shadow-lg",
        glass: "glass rounded-lg shadow-lg",
        danger: "border border-danger/25 bg-danger-bg",
        warning: "border border-warn/25 bg-warn-bg",
        trust: "border border-trust/25 bg-trust-bg",
        info: "border border-info/25 bg-info-bg",
        outlined: "border border-line bg-transparent",
        /** For use inside dark/wine sections */
        onDeep: "border border-white/10 bg-white/[0.06] backdrop-blur-sm",
        /** Theme-pack-aware wash + gold hairline top edge (D-21b) — for a
         *  card that should visibly carry the active pack's identity rather
         *  than sit as plain surface. */
        luxe: "border border-gold-400/40 bg-grad-card shadow-md hairline-top",
      },
      // Phones get one step less than tablets up: a 28px gutter inside a
      // 335px-wide card spends a tenth of the screen on nothing.
      padding: {
        none: "p-0",
        sm: "p-4",
        md: "p-5",
        lg: "p-5 sm:p-7",
        xl: "p-6 sm:p-9",
      },
    },
    defaultVariants: { variant: "default", padding: "md" },
  },
);

export interface CardProps extends VariantProps<typeof card> {
  children: ReactNode;
  title?: string;
  className?: string;
  onClick?: () => void;
}

export default function Card({
  children,
  title,
  variant,
  padding,
  className,
  onClick,
}: CardProps) {
  const interactive = Boolean(onClick);

  return (
    <div
      className={cn(card({ variant, padding }), interactive && "cursor-pointer", className)}
      onClick={onClick}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
    >
      {title && <h4 className="mb-4 text-lg font-semibold text-ink">{title}</h4>}
      {children}
    </div>
  );
}
