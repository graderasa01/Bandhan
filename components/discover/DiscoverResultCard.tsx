"use client";

import { useState } from "react";
import Link from "next/link";
import { BadgeCheck, Bookmark, BookmarkCheck, Loader2, Lock, ShieldCheck } from "lucide-react";
import Pill from "@/components/ui/Pill";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n/LanguageProvider";
import type { DiscoverResultCard as CardModel } from "@/lib/discovery/contract";

/**
 * One result. Every line is a stored value or a computed reason — no
 * percentage, no adjective the profile did not supply. A missing field is
 * simply not rendered ("Information nahi bhari" where a whole line would
 * otherwise be blank). The photo is only ever an `<img>` when the server said
 * it may be seen; a locked photo is an initial and a lock, never a blurred URL.
 */
export default function DiscoverResultCard({ card, onShortlistChange }: { card: CardModel; onShortlistChange?: (profileId: string, shortlisted: boolean) => void }) {
  const t = useT();
  const { toast } = useToast();
  const [shortlisted, setShortlisted] = useState(card.shortlisted);
  const [busy, setBusy] = useState(false);

  async function toggleShortlist() {
    if (busy) return;
    setBusy(true);
    const next = !shortlisted;
    try {
      const res = await fetch(`/api/shortlist/${card.profileId}`, { method: next ? "PUT" : "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) {
        toast({ title: t("discover.card.shortlistFailed", "Shortlist nahi hua"), description: json.message, tone: "error" });
        return;
      }
      setShortlisted(next);
      onShortlistChange?.(card.profileId, next);
      toast({ title: next ? t("discover.card.shortlisted", "Shortlist me add ho gaya") : t("discover.card.unshortlisted", "Shortlist se hata diya"), tone: "success" });
    } catch {
      toast({ title: t("discover.networkError", "Network error — dobara try karein."), tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  const facts = [card.city, card.education, card.profession, card.maritalStatus].filter((v): v is string => Boolean(v));

  return (
    <article className="flex gap-3 rounded-lg border border-line bg-surface p-3.5 shadow-sm" aria-label={card.displayName}>
      <div className="relative size-[76px] shrink-0 overflow-hidden rounded-md bg-gradient-to-br from-wine-100 via-gold-100 to-sand-200 dark:from-wine-900 dark:via-gold-900 dark:to-sand-800">
        {card.photoUnlocked && card.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- user-uploaded URL, not build-known
          <img src={card.photoUrl} alt="" width={76} height={76} loading="lazy" decoding="async" className="size-full object-cover" />
        ) : (
          <>
            <span aria-hidden className="absolute inset-0 grid place-items-center font-[family-name:var(--font-display)] text-2xl font-bold text-wine-700/50 dark:text-gold-100/40">
              {card.displayName.trim().charAt(0).toUpperCase()}
            </span>
            <span className="absolute bottom-1 right-1 grid size-5 place-items-center rounded-full bg-surface/85" title={t("discover.card.photoLocked", "Photo mutual interest ya paid plan par khulti hai")}>
              <Lock className="size-3 text-muted" aria-hidden />
            </span>
          </>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Link href={`/user/profile/${card.profileId}`} className="truncate font-semibold text-ink transition-colors hover:text-primary-text">
            {card.displayName}
            {card.age ? `, ${card.age}` : ""}
          </Link>
          {card.verified && (
            <span title={t("discover.card.verified", "Verified profile")}>
              <BadgeCheck className="size-4 shrink-0 text-trust" aria-label={t("discover.card.verified", "Verified profile")} />
            </span>
          )}
          {card.trustScore != null && (
            <Pill tone="trust" size="sm">
              <ShieldCheck className="size-3" aria-hidden />
              {card.trustScore}
            </Pill>
          )}
        </div>

        <p className="mt-0.5 truncate text-[0.8125rem] text-muted">
          {facts.length > 0 ? facts.join(" · ") : t("discover.card.notFilled", "Information nahi bhari")}
        </p>

        <p className="mt-1.5 line-clamp-2 text-[0.75rem] leading-snug text-subtle">
          <span className="font-medium text-muted">{t("discover.card.whyShown", "Kyun dikhaya:")}</span> {card.reason.text}
        </p>

        <div className="mt-2 flex items-center gap-2">
          <Link
            href={`/user/profile/${card.profileId}`}
            className="inline-flex h-8 items-center rounded-full border border-line-strong px-3 text-[0.75rem] font-semibold text-ink transition-colors hover:border-gold-500"
          >
            {t("discover.card.viewProfile", "Profile dekhein")}
          </Link>
          <button
            type="button"
            onClick={toggleShortlist}
            disabled={busy}
            aria-pressed={shortlisted}
            aria-label={shortlisted ? t("discover.card.removeShortlist", "Shortlist se hatayein") : t("discover.card.addShortlist", "Shortlist karein")}
            className={cn(
              "inline-flex h-8 items-center gap-1 rounded-full border px-3 text-[0.75rem] font-semibold transition-colors disabled:opacity-50",
              shortlisted ? "border-gold-500 bg-gold-50 text-gold-700 dark:bg-gold-900/40 dark:text-gold-200" : "border-line-strong text-ink hover:border-gold-500",
            )}
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : shortlisted ? <BookmarkCheck className="size-3.5" aria-hidden /> : <Bookmark className="size-3.5" aria-hidden />}
            {shortlisted ? t("discover.card.shortlistedShort", "Shortlisted") : t("discover.card.shortlist", "Shortlist")}
          </button>
        </div>
      </div>
    </article>
  );
}
