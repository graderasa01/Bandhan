import { BadgeCheck, Phone } from "lucide-react";
import Pill from "@/components/ui/Pill";

/**
 * Trust signals as a full-width strip, promoted out of a tiny corner badge —
 * both signals always render, even when false. A "Mobile Pending" chip is
 * honest; a missing chip reads as broken, and trust-by-design means absence
 * is shown, never hidden.
 */
export default function ReelTrustStrip({
  photoVerified,
  mobileVerified,
}: {
  photoVerified: boolean;
  mobileVerified: boolean;
}) {
  return (
    <div className="flex shrink-0 gap-2 px-4 pt-3 md:pt-2">
      <Pill tone={photoVerified ? "trust" : "neutral"} size="sm" className={!photoVerified ? "border-dashed" : undefined}>
        <BadgeCheck />
        {photoVerified ? "Photo Verified" : "Photo Pending"}
      </Pill>
      <Pill tone={mobileVerified ? "trust" : "neutral"} size="sm" className={!mobileVerified ? "border-dashed" : undefined}>
        <Phone />
        {mobileVerified ? "Mobile Verified" : "Mobile Pending"}
      </Pill>
    </div>
  );
}
