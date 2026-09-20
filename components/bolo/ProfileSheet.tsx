"use client";

import type { ReactNode } from "react";
import { Check, ChevronDown, User } from "lucide-react";
import type { BoloValues } from "@/lib/bolo/draft";
import type { FillingFor } from "@/lib/contracts/interview";
import { useT } from "@/components/i18n/LanguageProvider";
import Sheet from "@/components/ui/Sheet";
import ProfileFillCard from "@/components/bolo/ProfileFillCard";

/**
 * The profile, folded to one line while the conversation runs.
 *
 * Eight rows on screen during a two-minute conversation turn the page back
 * into the form it replaced, so the card waits behind "Profile · 3 details ✓"
 * and opens as a sheet — every saved answer, the progress, a pencil on each
 * row. Closing it leaves the question exactly where it was. The review step
 * does not fold it: there the full card is the screen.
 */
export default function ProfileSheet({
  done,
  total,
  open,
  onOpenChange,
  values,
  fillingFor,
  onChange,
  highlight,
  footer,
}: {
  done: number;
  total: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  values: BoloValues;
  fillingFor: FillingFor | null;
  onChange: (key: string, value: string) => void;
  highlight?: string[];
  footer?: ReactNode;
}) {
  const t = useT();
  const title =
    fillingFor === "son"
      ? t("bolo.card.titleSon", "Bete ki profile")
      : fillingFor === "daughter"
        ? t("bolo.card.titleDaughter", "Beti ki profile")
        : t("bolo.card.title", "Aapki profile");
  const count = done === 1 ? `1 ${t("bolo.profile.detailOne", "detail")}` : `${done} ${t("bolo.profile.details", "details")}`;

  return (
    <>
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="bolo-pane bolo-row flex min-h-[54px] w-full items-center gap-[16px] pl-[16px] pr-[14px] text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <User className="size-[26px] shrink-0 text-gold" strokeWidth={1.6} aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[14px] text-primary">
          <span className="font-medium">{t("bolo.profile.label", "Profile")}</span>
          <span className="text-muted-2"> · </span>
          {done > 0 ? (
            <>
              {count}
              <Check className="-mt-0.5 ml-[7px] inline size-[18px] text-primary" strokeWidth={2.4} aria-hidden />
            </>
          ) : (
            <span className="text-secondary">{t("bolo.profile.empty", "abhi khaali")}</span>
          )}
        </span>
        <ChevronDown className="size-[24px] shrink-0 text-secondary" strokeWidth={1.8} aria-hidden />
      </button>

      <Sheet
        open={open}
        onClose={() => onOpenChange(false)}
        title={title}
        description={`${done}/${total} ${t("bolo.card.progress", "bhar gaye")}`}
        footer={footer}
        className="bolo-sheet sm:inset-x-auto sm:bottom-4 sm:left-1/2 sm:w-[min(32rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:rounded-3xl sm:border"
      >
        <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-white/10" aria-hidden>
          <div
            className="h-full rounded-full bg-gradient-to-r from-gold-300 to-gold-500 transition-[width] duration-500"
            style={{ width: `${(done / total) * 100}%` }}
          />
        </div>
        <ProfileFillCard
          values={values}
          fillingFor={fillingFor}
          editable
          onChange={onChange}
          highlight={highlight}
          showHeader={false}
          className="bolo-glass-soft"
        />
      </Sheet>
    </>
  );
}
