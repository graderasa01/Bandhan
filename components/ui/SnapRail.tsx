"use client";

import { Children, useEffect, useRef, useState, type ReactNode } from "react";
import { RevealGroup, RevealItem } from "@/components/ui/Reveal";
import { cn } from "@/lib/utils";

/**
 * Peer cards as a horizontal snap rail on phones, a plain grid from `lg` up.
 *
 * Three stacked cards cost roughly two screens of phone scroll — more than any
 * one section earns. A rail costs one, and the sliver of the next card is what
 * tells the thumb there is more to see. The negative margin lets cards run to
 * the screen edge while `scroll-px-*` keeps them snapping flush with the
 * Container gutter.
 */
export default function SnapRail({
  children,
  label,
  className,
  itemClassName,
}: {
  children: ReactNode;
  /** Names the scroll region for screen readers. */
  label: string;
  className?: string;
  itemClassName?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  /**
   * A scroll container whose children hold no focusable elements is
   * unreachable by keyboard (WCAG 2.1.1), so the rail takes focus itself —
   * but only while it actually scrolls. At `lg` it is a plain grid, and a
   * focus stop that moves nothing is just a tab press wasted.
   *
   * Defaults to focusable so keyboard scrolling works before hydration too.
   */
  const [scrollable, setScrollable] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => setScrollable(el.scrollWidth > el.clientWidth + 1);
    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <RevealGroup
      ref={ref}
      role="group"
      aria-label={label}
      tabIndex={scrollable ? 0 : undefined}
      className={cn(
        "flex snap-x snap-mandatory gap-4 overflow-x-auto",
        // The trailing pad is the leftover viewport after one card (100 - 82,
        // 100 - 46). Without it the last card runs out of scroll before it can
        // reach its own snap point and parks a few px off from its siblings.
        // It is also why card widths stay pure vw — a max-width cap would
        // break the arithmetic at the top of each range.
        "-mx-5 scroll-px-5 pb-4 pl-5 pr-[18vw]",
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        "sm:-mx-6 sm:scroll-px-6 sm:pl-6 sm:pr-[54vw]",
        "rounded-lg outline-offset-2 focus-visible:outline-2 focus-visible:outline-gold-600",
        "lg:mx-0 lg:grid lg:grid-cols-3 lg:gap-5 lg:overflow-visible lg:p-0",
        className,
      )}
    >
      {Children.map(children, (child) => (
        <RevealItem
          // pt-3 buys room for any badge sitting above a card's top edge —
          // the scroll container would clip it otherwise.
          className={cn(
            "w-[82vw] shrink-0 snap-start pt-3",
            "sm:w-[46vw] lg:w-auto lg:pt-0",
            itemClassName,
          )}
        >
          {child}
        </RevealItem>
      ))}
    </RevealGroup>
  );
}
