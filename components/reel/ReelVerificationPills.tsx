"use client";

import { BadgeCheck, Phone } from "lucide-react";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * Earned badges only.
 *
 * This is the one place the reel's trust signals changed shape. The old
 * full-width strip rendered both signals always — "Photo Pending" in a dashed
 * chip — on the argument that absence should be shown rather than hidden. That
 * argument is right, and it is why the *details sheet* still shows both states
 * for every profile. It stopped being right on the face of the card: sitting
 * over the person's photograph, two dashed "Pending" chips read as a warning
 * about them rather than as a fact about our queue, and they were on most
 * cards, which made the green ones mean less.
 *
 * So: a badge here means the check actually passed, and nothing here ever
 * means anything else. Never rendered from a plan, a score or a guess —
 * `verified` is the primary photo's own moderation result and `mobileVerified`
 * is an OTP that really happened.
 *
 * Not colour alone (§20): each pill carries its own word, so the meaning
 * survives a greyscale screenshot or a colour-blind reader.
 */
export default function ReelVerificationPills({
  photoVerified,
  mobileVerified,
}: {
  photoVerified: boolean;
  mobileVerified: boolean;
}) {
  const t = useT();
  if (!photoVerified && !mobileVerified) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {photoVerified && (
        <span className="inline-flex items-center gap-1 rounded-full bg-surface/95 py-1 pl-1.5 pr-2.5 text-[0.75rem] font-semibold text-trust shadow-sm ring-1 ring-black/[0.04]">
          <BadgeCheck className="size-4 shrink-0" aria-hidden />
          {t("reel.trustStrip.photoVerified", "Photo Verified")}
        </span>
      )}
      {mobileVerified && (
        <span className="inline-flex items-center gap-1 rounded-full bg-surface/95 py-1 pl-1.5 pr-2.5 text-[0.75rem] font-semibold text-trust shadow-sm ring-1 ring-black/[0.04]">
          <Phone className="size-[14px] shrink-0" aria-hidden />
          {t("reel.trustStrip.mobileVerified", "Mobile Verified")}
        </span>
      )}
    </div>
  );
}
