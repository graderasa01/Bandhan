import type { ReactNode } from "react";
import CountUp from "@/components/ui/CountUp";
import { cn } from "@/lib/utils";

/**
 * Number-forward stat: icon circle + big count + short label, for grids that
 * used to be a sentence per number. Tokenized so `highlight` reskins with the
 * active admin theme pack instead of a fixed gold.
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
    <div className={cn("rounded-md border border-line bg-surface-2 px-2.5 py-3 text-center", className)}>
      <span
        className={cn(
          "mx-auto mb-1.5 grid size-7 place-items-center rounded-full",
          highlight ? "bg-primary/20 text-primary-text" : "bg-bg-subtle text-muted",
        )}
      >
        {icon}
      </span>
      <p className="font-[family-name:var(--font-display)] text-2xl font-bold leading-none text-accent-text">
        <CountUp value={value} />
      </p>
      <p className="mt-1 text-[0.6875rem] leading-tight text-muted">{label}</p>
    </div>
  );
}
