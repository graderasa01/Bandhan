"use client";

import Link from "next/link";
import { ChevronRight, MessageCircle, User } from "lucide-react";
import { haptic } from "@/lib/motion";
import { useT } from "@/components/i18n/LanguageProvider";
import type { ReelLane } from "@/lib/contracts/reelLibrary";

/**
 * The bar under a card in a lane where the four decisions do not apply
 * (D-91b).
 *
 * Interest and Messages hold people this member has already acted on, and
 * offering "Interest" again would either write a second row or fail — both of
 * which read as the app not knowing what you already did. So those two lanes
 * get the action that is actually available: open the conversation, or open
 * the profile, and move on.
 *
 * Viewed and Liked keep the ordinary `ReelActionBar`, because there the whole
 * point is that a decision is still open.
 */
export default function ReelLaneActionBar({
  lane,
  note,
  matchId,
  profileId,
  onNext,
  disabled,
}: {
  lane: ReelLane;
  /** "Interest sent — 2 din pehle", "Last message kal" — the lane's one provable line. */
  note: string;
  matchId: string | null;
  profileId: string | null;
  onNext: () => void;
  disabled?: boolean;
}) {
  const t = useT();

  return (
    <div className="mx-auto flex w-full max-w-md items-center gap-2 px-4">
      {/* The note sits in the bar rather than on the photo: it is about the
          rishta's state, not about the person's face. */}
      <p className="min-w-0 flex-1 truncate text-[0.75rem] font-medium text-muted">{note}</p>

      {matchId ? (
        <Link
          href={`/user/messages/${matchId}`}
          className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-accent px-4 text-[0.8125rem] font-semibold text-accent-fg"
        >
          <MessageCircle className="size-4" aria-hidden />
          {t("reel.lane.openChat", "Open Chat")}
        </Link>
      ) : (
        profileId && (
          <Link
            href={`/user/profile/${profileId}`}
            className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border border-line-strong px-4 text-[0.8125rem] font-semibold text-ink"
          >
            <User className="size-4" aria-hidden />
            {t("reel.lane.openProfile", "View Profile")}
          </Link>
        )
      )}

      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          haptic("tap");
          onNext();
        }}
        aria-label={t("reel.lane.nextAria", "Agli profile")}
        className="inline-flex h-11 shrink-0 items-center gap-1 rounded-full border border-line-strong px-3.5 text-[0.8125rem] font-semibold text-ink transition-colors hover:bg-bg-subtle disabled:opacity-40"
      >
        {t("reel.lane.next", "Next")}
        <ChevronRight className="size-4" aria-hidden />
      </button>
      <span className="sr-only">{lane}</span>
    </div>
  );
}
