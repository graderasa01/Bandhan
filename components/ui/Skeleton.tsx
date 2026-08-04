import { cn } from "@/lib/utils";

/**
 * Base shimmer block. Prefer the shaped presets below — a skeleton that
 * matches the real content's silhouette makes loading feel instant; generic
 * grey bars make it feel broken.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton rounded-md", className)} />;
}

export function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)} aria-hidden>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn("h-3.5", i === lines - 1 ? "w-2/3" : "w-full")}
        />
      ))}
    </div>
  );
}

/** Matches the reel card silhouette (M07 §2.1). */
export function SkeletonReelCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-line bg-surface shadow-sm",
        className,
      )}
      aria-hidden
    >
      <Skeleton className="aspect-[4/5] w-full rounded-none" />
      <div className="space-y-3 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-3.5 w-40" />
          </div>
          <Skeleton className="size-14 shrink-0 rounded-full" />
        </div>
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-3/4" />
      </div>
    </div>
  );
}

/** Matches a lead / list row. */
export function SkeletonRow({ className }: { className?: string }) {
  return (
    <div
      className={cn("flex items-center gap-4 rounded-md border border-line bg-surface p-4", className)}
      aria-hidden
    >
      <Skeleton className="size-11 shrink-0 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-3 w-44" />
      </div>
      <Skeleton className="h-8 w-16 shrink-0 rounded-full" />
    </div>
  );
}

/** Matches a dashboard metric tile. */
export function SkeletonMetric({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-md border border-line bg-surface p-5", className)} aria-hidden>
      <Skeleton className="h-8 w-20" />
      <Skeleton className="mt-3 h-3.5 w-28" />
      <Skeleton className="mt-1.5 h-3 w-36" />
    </div>
  );
}

/** Matches a form field (label + control). */
export function SkeletonField({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)} aria-hidden>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}
