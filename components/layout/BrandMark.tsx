import { cn } from "@/lib/utils";

/**
 * BandhanTak identity: two interlocking rings (bandhan = bond) inside a
 * rounded-square seal, with a gold foil gradient.
 */
export default function BrandMark({
  className,
  showWordmark = true,
  onDeep = false,
}: {
  className?: string;
  showWordmark?: boolean;
  onDeep?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg
        viewBox="0 0 40 40"
        className="size-9 shrink-0"
        role="img"
        aria-label="BandhanTak"
      >
        <defs>
          <linearGradient id="bt-foil" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#e8cf7a" />
            <stop offset="45%" stopColor="#d4af37" />
            <stop offset="100%" stopColor="#94751f" />
          </linearGradient>
        </defs>
        <rect
          x="1"
          y="1"
          width="38"
          height="38"
          rx="11"
          fill={onDeep ? "rgba(255,255,255,0.08)" : "#4a1119"}
        />
        <rect x="1" y="1" width="38" height="38" rx="11" fill="none" stroke="url(#bt-foil)" strokeWidth="1.25" opacity="0.55" />
        <circle cx="16" cy="20" r="7.5" fill="none" stroke="url(#bt-foil)" strokeWidth="2.25" />
        <circle cx="24" cy="20" r="7.5" fill="none" stroke="url(#bt-foil)" strokeWidth="2.25" opacity="0.75" />
      </svg>

      {showWordmark && (
        <span
          className={cn(
            "font-[family-name:var(--font-display)] text-[1.3rem] font-semibold leading-none tracking-tight",
            onDeep ? "text-white" : "text-ink",
          )}
        >
          Bandhan<span className="text-foil">Tak</span>
        </span>
      )}
    </span>
  );
}
