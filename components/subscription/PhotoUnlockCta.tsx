import Link from "next/link";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The way out of a locked photo, on every surface that has one.
 *
 * Only render this where the photo is genuinely locked *by plan* — i.e. where
 * `photoUnlocked` is false. Since `photoUnlockAll` shipped, a paid viewer's
 * photos are never locked, so a false `photoUnlocked` already means the viewer
 * is on FREE and this is the right offer. Do not show it next to an *empty*
 * photo slot: "upgrade to see" is a lie when the owner simply never uploaded
 * one, and selling against a photo that does not exist is the kind of thing
 * people notice once and never trust again.
 *
 * `className` rather than a variant prop: the four hosts sit on very different
 * backgrounds (a photo gradient, a plain card, a wine event card), and a
 * closed set of variants would have needed widening at each new one anyway.
 */
export default function PhotoUnlockCta({ className, label = "View Plans" }: { className?: string; label?: string }) {
  return (
    <Link
      href="/user/subscription"
      // Stops the reel card's swipe gesture from claiming this tap. Harmless
      // on the hosts that have no gesture, so it lives here once instead of
      // being remembered at each call site.
      onPointerDown={(e) => e.stopPropagation()}
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary-text transition-colors hover:underline",
        className,
      )}
    >
      <Lock className="size-3.5 shrink-0" aria-hidden />
      {label}
    </Link>
  );
}
