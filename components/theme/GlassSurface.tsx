import type { ElementType, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A pane of the app's one material, in four weights.
 *
 *   soft      a quiet container — a section, a list wrapper, a filter bar.
 *             Translucent and *unblurred*: this is the weight a page uses many
 *             times over, and one blur per instance is what a mid-range phone
 *             feels on a scroll.
 *   card      the default content card: one blur, one hairline.
 *   elevated  a dialog, a sheet, a panel that has to win over the page.
 *   active    live, selected, AI — the only weight with a gold rim and a
 *             bloom. Rationing that glow is what keeps it meaning anything.
 *
 * Nesting is safe: a surface inside a surface drops its own blur (globals.css),
 * so a card inside a soft section is one blurred layer, not two.
 *
 * Most of the app never calls this directly — `Card` and the `.bt-*` canvas
 * classes are already wired to the same weights, which is what carried the
 * existing screens across. Reach for it when you are building something new
 * that is not a card.
 */
export type GlassVariant = "soft" | "card" | "elevated" | "active";

export default function GlassSurface({
  as,
  variant = "card",
  radius,
  className,
  children,
  ...rest
}: {
  as?: ElementType;
  variant?: GlassVariant;
  /** Corner radius in px when the default 18 is wrong for the shape. */
  radius?: number;
  className?: string;
  children?: ReactNode;
} & Record<string, unknown>) {
  const Tag = (as ?? "div") as ElementType;
  return (
    <Tag
      className={cn(
        "bt-surface",
        variant === "soft" && "bt-surface--soft",
        variant === "elevated" && "bt-surface--elevated",
        variant === "active" && "bt-surface--active",
        className,
      )}
      style={radius ? ({ ["--surface-radius" as string]: `${radius}px` } as React.CSSProperties) : undefined}
      {...rest}
    >
      {children}
    </Tag>
  );
}
