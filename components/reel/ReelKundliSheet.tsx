"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2, Orbit } from "lucide-react";
import Sheet from "@/components/ui/Sheet";
import GunaMilanCard from "@/components/kundli/GunaMilanCard";
import KundliNoteList from "@/components/profile/KundliNoteList";
import { kundliFieldEditHref } from "@/components/kundli/kundliLinks";
import { useT } from "@/components/i18n/LanguageProvider";
import type { KundliMilanResponse } from "@/lib/contracts/kundli";

/**
 * The reel rail's Kundli button — the full 36-guna milan for the person on
 * screen, without leaving the feed.
 *
 * The details sheet already carried a one-line summary, three scrolls down;
 * members asked for it where the other quick tools are. This fetches the same
 * `getKundliMatchView` the profile page renders, only on tap, so the kundli
 * engine's rule is untouched: shown for a profile the member opened, never a
 * ranking input.
 *
 * Every "can't compute" state is a prompt, not an error, exactly as on the
 * profile page — and only the *viewer's* missing fields are ever offered as a
 * fix. The other person's birth details are theirs to fill.
 */
export default function ReelKundliSheet({
  profileId,
  name,
  onClose,
}: {
  /** Null while closed. */
  profileId: string | null;
  name: string;
  onClose: () => void;
}) {
  const t = useT();
  const [data, setData] = useState<KundliMilanResponse | null>(null);

  useEffect(() => {
    if (!profileId) return;
    let cancelled = false;
    setData(null);
    void (async () => {
      try {
        const res = await fetch(`/api/kundli/milan/${profileId}`);
        const json = (await res.json()) as KundliMilanResponse;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setData({ ok: false, message: t("reel.kundli.network", "Network problem — dobara try kijiye.") });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profileId, t]);

  const view = data?.ok ? data.view : undefined;
  const returnTo = "/user/reel";

  return (
    <Sheet
      open={profileId !== null}
      onClose={onClose}
      title={t("reel.kundli.title", "Kundli Milan")}
      description={t(
        "reel.kundli.description",
        "Parampara ka ek paimana — rishta ka faisla nahi, aur matching me iska koi hissa nahi.",
      )}
    >
      <div className="space-y-3 py-1">
        {data === null ? (
          <div className="flex items-center justify-center gap-2 py-10 text-[0.8125rem] text-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t("reel.kundli.loading", "Guna milan nikal rahe hain…")}
          </div>
        ) : !data.ok || !view ? (
          <p className="py-6 text-center text-[0.8125rem] text-muted">
            {data.message ?? t("reel.kundli.unavailable", "Abhi kundli milan nahi dikh sakta.")}
          </p>
        ) : (
          <>
            {view.milan ? (
              <GunaMilanCard
                milan={view.milan}
                otherName={data.name ?? name}
                approximate={Boolean(data.approximate)}
                viewerAssumed={Boolean(data.viewerAssumed)}
                returnTo={returnTo}
              />
            ) : view.milanBlockedReason === "viewer-missing-dob" ? (
              <Link
                href={kundliFieldEditHref("dateOfBirth", returnTo)}
                className="flex items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3 transition-colors hover:border-gold-300 hover:bg-gold-50 dark:hover:bg-gold-900/20"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gold-100 text-gold-700 dark:bg-gold-900/40 dark:text-gold-200">
                  <Orbit className="size-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.9375rem] font-semibold text-ink">
                    {t("reel.kundli.addDobTitle", "Apni Date of Birth bhariye")}
                  </span>
                  <span className="block text-[0.8125rem] text-muted">
                    {t("reel.kundli.addDobBody", "Bharte hi har profile ka 36 guna milan apne aap ban jayega.")}
                  </span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-muted" aria-hidden />
              </Link>
            ) : (
              <p className="rounded-lg border border-line bg-bg-subtle px-4 py-3 text-[0.8125rem] text-muted">
                {view.milanBlockedReason === "candidate-missing-dob"
                  ? t("reel.kundli.candidateMissing", "{name} ne abhi apni janm tithi nahi bhari hai, isliye guna milan nahi ban sakta.").replace(
                      "{name}",
                      data.name ?? name,
                    )
                  : t("reel.kundli.sameGender", "Is jodi ke liye guna milan ka paramparik hisaab lagu nahi hota.")}
              </p>
            )}

            <KundliNoteList notes={view.notes} />

            <div className="grid grid-cols-2 gap-2 pt-1">
              <Link
                href={`/user/profile/${profileId}#kundli`}
                className="inline-flex h-11 items-center justify-center rounded-md border border-line-strong bg-surface px-3 text-[0.8125rem] font-medium text-ink transition-colors hover:border-gold-500"
              >
                Full Profile
              </Link>
              <Link
                href="/user/kundli"
                className="inline-flex h-11 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-[0.8125rem] font-medium text-primary-fg"
              >
                <Orbit className="size-4" aria-hidden />
                My Kundli
              </Link>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
