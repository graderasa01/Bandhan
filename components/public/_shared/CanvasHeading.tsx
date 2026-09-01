import type { ElementType, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { RuleMotif } from "@/components/public/_shared/Ornaments";

/**
 * Eyebrow · serif headline · ornamental rule · description.
 *
 * The marketing skin's answer to `SectionHeading` (components/ui/Container),
 * which stays where it is for the signed-in app. The difference that matters
 * is the rule: a wedding card puts a ruling under a heading, and doing it by
 * hand in nine places is how five slightly different rules end up shipping.
 *
 * Only ever rendered inside a `.bt-canvas` — the ornament classes are
 * scoped to that island and are inert outside it.
 */
export default function CanvasHeading({
  eyebrow,
  eyebrowIcon: Icon,
  title,
  description,
  align = "center",
  as: Tag = "h2",
  size = "md",
  className,
}: {
  eyebrow?: ReactNode;
  eyebrowIcon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  align?: "center" | "left";
  /** `h1` on a page's own hero, `h2` everywhere below it. */
  as?: ElementType;
  size?: "md" | "lg";
  className?: string;
}) {
  const centered = align === "center";
  return (
    <div className={cn(centered && "mx-auto max-w-2xl text-center", className)}>
      {eyebrow && (
        <span className="bt-eyebrow bt-eyebrow--caps">
          {Icon && <Icon className="size-3.5" />}
          {eyebrow}
        </span>
      )}

      <Tag
        className={cn(
          "bt-display",
          eyebrow ? "mt-5" : "mt-0",
          size === "lg"
            ? "text-[2.15rem] sm:text-[2.75rem] lg:text-[3.1rem]"
            : "text-[1.85rem] sm:text-[2.35rem]",
        )}
      >
        {title}
      </Tag>

      <div className={cn("bt-rule mt-4 max-w-[280px]", centered && "mx-auto")}>
        <RuleMotif />
      </div>

      {description && (
        <p
          className={cn(
            "mt-4 text-pretty leading-relaxed text-muted",
            centered ? "mx-auto max-w-xl" : "max-w-xl",
            size === "lg" && "sm:text-[1.0625rem]",
          )}
        >
          {description}
        </p>
      )}
    </div>
  );
}
