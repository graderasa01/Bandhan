"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookmarkCheck } from "lucide-react";
import Sheet from "@/components/ui/Sheet";
import Button from "@/components/ui/Button";
import { useT } from "@/components/i18n/LanguageProvider";

interface FamilyMemberLite {
  status: "INVITED" | "ACTIVE" | "REVOKED";
}

/**
 * Family Circle shipped a while back (D-03 Phase 4) — this sheet's copy
 * predates that and still said "coming soon" until now. Self-fetches
 * `/api/family` (same pattern as `ProfileOverviewCard`) to tell the truth
 * about what actually happens next: an owner with an active member already
 * has this shortlist visible to them via `/family`; an owner with none gets
 * pointed at inviting one instead of a dead-end promise.
 */
export default function ReelShortlistSheet({
  open,
  onClose,
  displayName,
}: {
  open: boolean;
  onClose: () => void;
  displayName: string;
}) {
  const t = useT();
  const [activeCount, setActiveCount] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    fetch("/api/family")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { members?: FamilyMemberLite[] } | null) => {
        setActiveCount(data?.members?.filter((m) => m.status === "ACTIVE").length ?? 0);
      })
      .catch(() => setActiveCount(0));
  }, [open]);

  const hasFamily = (activeCount ?? 0) > 0;

  return (
    <Sheet open={open} onClose={onClose} variant="center">
      <div className="flex flex-col items-center gap-3 py-2 text-center">
        {/* A shortlist mark, not a family one — this sheet confirms the save
            that just happened. The Family Circle offer below is the optional
            next step, and stays exactly where it is. */}
        <span className="grid size-14 place-items-center rounded-full bg-trust/10 text-trust">
          <BookmarkCheck className="size-6" />
        </span>
        <h3 className="text-lg font-semibold text-ink">
          {displayName} {t("reel.shortlistSheet.titleSuffix", "shortlist ho gaye")}
        </h3>
        <p className="max-w-[26rem] text-[0.875rem] leading-relaxed text-muted">
          {hasFamily
            ? t(
                "reel.shortlistSheet.descriptionWithFamily",
                "Ye aapki shortlist me save ho gaya hai — aapka Family Circle ise apne family portal se already dekh sakta hai.",
              )
            : t(
                "reel.shortlistSheet.descriptionNoFamily",
                "Ye aapki apni shortlist me save ho gaya hai. Family Circle banayein to Papa, Mummy ya bhai-behen bhi ise dekh aur apni raay de sakte hain.",
              )}
        </p>
        <div className="mt-1 flex flex-col gap-2 sm:flex-row-reverse">
          <Button variant="secondary" size="md" onClick={onClose}>
            {t("reel.shortlistSheet.ok", "Theek Hai")}
          </Button>
          <Link
            href={hasFamily ? "/user/shortlist" : "/user/family"}
            className="inline-flex min-h-12 items-center justify-center px-4 text-sm font-medium text-primary-text transition-colors hover:text-primary-hover"
          >
            {hasFamily
              ? t("reel.shortlistSheet.viewShortlist", "View My Shortlist")
              : t("reel.shortlistSheet.createFamilyLink", "Family Circle banayein")}
          </Link>
        </div>
      </div>
    </Sheet>
  );
}
