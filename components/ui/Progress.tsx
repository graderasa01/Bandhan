import { cn } from "@/lib/utils";

interface ProgressProps {
  value: number;
  label?: string;
  size?: "sm" | "md" | "lg";
  variant?: "default" | "trust" | "warning";
  showPercentage?: boolean;
  className?: string;
}

// Internal-only restyle — same props as before, Tailwind instead of inline styles.
const HEIGHT: Record<NonNullable<ProgressProps["size"]>, string> = {
  sm: "h-1.5",
  md: "h-2.5",
  lg: "h-4",
};

const FILL: Record<NonNullable<ProgressProps["variant"]>, string> = {
  default: "bg-gradient-to-r from-gold-400 to-gold-600",
  trust: "bg-trust",
  warning: "bg-warn",
};

const TRACK: Record<NonNullable<ProgressProps["variant"]>, string> = {
  default: "bg-bg-subtle",
  trust: "bg-trust/10",
  warning: "bg-warn-bg",
};

export default function Progress({
  value,
  label,
  size = "md",
  variant = "default",
  showPercentage = true,
  className,
}: ProgressProps) {
  const clamped = Math.min(100, Math.max(0, value));

  return (
    <div className={className}>
      {(label || showPercentage) && (
        <div className="mb-1.5 flex items-center justify-between gap-2">
          {label && <span className="text-sm font-medium text-ink">{label}</span>}
          {showPercentage && <span className="text-sm tabular-nums text-muted">{clamped}%</span>}
        </div>
      )}
      <div
        className={cn("w-full overflow-hidden rounded-full", HEIGHT[size], TRACK[variant])}
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label || `Progress: ${clamped}%`}
      >
        <div
          className={cn("h-full rounded-full transition-[width] duration-700", FILL[variant])}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
