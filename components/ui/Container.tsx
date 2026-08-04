import type { ElementType, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Page gutter + max width. Every section body should sit inside one. */
export function Container({
  children,
  className,
  size = "default",
}: {
  children: ReactNode;
  className?: string;
  size?: "narrow" | "default" | "wide";
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-5 sm:px-6 lg:px-8",
        size === "narrow" && "max-w-3xl",
        size === "default" && "max-w-6xl",
        size === "wide" && "max-w-7xl",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Vertical rhythm wrapper. `tone` swaps the surface treatment. */
export function Section({
  children,
  className,
  id,
  tone = "default",
  as: Tag = "section",
}: {
  children: ReactNode;
  className?: string;
  id?: string;
  tone?: "default" | "subtle" | "deep";
  as?: ElementType;
}) {
  return (
    <Tag
      id={id}
      className={cn(
        // Mobile stacks everything, so vertical rhythm has to be tighter there
        // or a 10-section page turns into an endless scroll.
        "relative py-12 sm:py-18 lg:py-24",
        tone === "subtle" && "bg-bg-subtle",
        tone === "deep" && "on-deep grain bg-wine-700 dark:bg-wine-900",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

/** Small uppercase label above a heading. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-2 rounded-full border border-gold-300/40 bg-gold-50 px-3 py-1.5",
        "text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-gold-700",
        "dark:border-gold-400/25 dark:bg-gold-900/40 dark:text-gold-200",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Eyebrow + title + description block. */
export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "center",
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  align?: "center" | "left";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4",
        align === "center" && "mx-auto max-w-2xl items-center text-center",
        align === "left" && "max-w-2xl items-start text-left",
        className,
      )}
    >
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h2 className="text-balance text-3xl leading-[1.08] sm:text-4xl lg:text-[2.75rem]">{title}</h2>
      {description && (
        <p className="text-pretty text-base leading-relaxed text-muted sm:text-lg">{description}</p>
      )}
    </div>
  );
}
