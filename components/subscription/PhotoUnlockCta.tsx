"use client";

import Link from "next/link";
import { Camera } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n/LanguageProvider";
import { photoLockLine, type PhotoLock } from "@/lib/contracts/photoLock";

/**
 * The way out of a locked photo, on every surface that has one.
 *
 * Since D-90 the way out is not a plan: a member whose own profile is live and
 * who shows an approved photo of their own sees the photos of members who allow
 * it. So this renders only for `add_own_photo`, and sends the viewer to add
 * theirs. For `match_only` it renders nothing — that owner has chosen matches
 * only, and no button of ours can change it; offering one would be a lie.
 *
 * Do not show it next to an *empty* photo slot either: when the gate is open
 * and the owner simply never uploaded, "add your photo to see theirs" is false.
 *
 * `className` rather than a variant prop: the hosts sit on very different
 * backgrounds (a photo gradient, a plain card, a wine event card), and a
 * closed set of variants would have needed widening at each new one anyway.
 */
export default function PhotoUnlockCta({ lock, className }: { lock: PhotoLock; className?: string }) {
  const t = useT();
  if (lock !== "add_own_photo") return null;
  return (
    <Link
      href="/profile/build?fields=photos"
      // Stops the reel card's swipe gesture from claiming this tap. Harmless
      // on the hosts that have no gesture, so it lives here once instead of
      // being remembered at each call site.
      onPointerDown={(e) => e.stopPropagation()}
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary-text transition-colors hover:underline",
        className,
      )}
    >
      <Camera className="size-3.5 shrink-0" aria-hidden />
      {t("subscription.photoUnlockCta.addYourPhoto", "Add Your Photo")}
    </Link>
  );
}

/** The one sentence under a locked photo, in the same words on every surface. */
export function PhotoLockHint({ lock }: { lock: PhotoLock }) {
  const t = useT();
  return <>{photoLockLine(lock, t)}</>;
}
