import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The gold Sparkles roundel used everywhere Grio's identity needs a face —
 * the overlay header, the standalone page header. Extracted so a future
 * palette/icon change happens once instead of drifting across copies.
 */
export default function GrioAvatar({ size = 8 }: { size?: 8 | 9 }) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-gold-400 to-gold-600 text-primary-fg",
        size === 9 ? "size-9" : "size-8",
      )}
    >
      <Sparkles className="size-4" aria-hidden />
    </span>
  );
}
