import type { ReactNode } from "react";
import CountUp from "@/components/ui/CountUp";
import { cn } from "@/lib/utils";

/**
 * Number-forward stat: icon in a ring + serif count + short label, for grids
 * that used to be a sentence per number. On the canvas skin (`.bt-stat`,
 * globals.css) the tile is cream with a gold hairline ring; `highlight`
 * lifts the tile and fills the ring with the seal gold. Off the canvas the
 * `.bt-*` classes are inert and the Tailwind fallbacks below carry it.
 */
export default function StatTile({
  icon,
  value,
  label,
  highlight,
  className,
}: {
  icon: ReactNode;
  value: number;
  label: string;
  highlight?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bt-stat rounded-md border border-line bg-surface-2 px-2.5 py-3 text-center",
        highlight && "bt-stat--lift",
        className,
      )}
    >
      <span
        className={cn(
          "bt-ring mx-auto grid size-7 place-items-center rounded-full [--paper-ring-size:1.85rem]",
          highlight ? "bt-ring--gold bg-primary/20 text-primary-text" : "bg-bg-subtle text-muted",
        )}
      >
        {icon}
      </span>
      <p className="bt-numeral font-[family-name:var(--font-display)] text-2xl font-bold leading-none text-accent-text">
        <CountUp value={value} />
      </p>
      <p className="text-[0.6875rem] leading-tight text-muted">{label}</p>
    </div>
  );
}
