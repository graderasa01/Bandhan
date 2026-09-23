"use client";

import Link from "next/link";
import Image from "next/image";
import type { ComponentType } from "react";
import { Blend, Flag, Heart, HelpCircle, Mic, PenLine, ScrollText, Store, UserRound, X } from "lucide-react";
import Sheet from "@/components/ui/Sheet";
import { cn } from "@/lib/utils";
import type { ReelCardViewModel } from "@/lib/contracts/reel";
import { profileSummaryLine } from "@/lib/reel/insights";
import { useT } from "@/components/i18n/LanguageProvider";

type Tile = {
  key: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
  /** One or two words under the label, only where the label alone would mislead. */
  hint?: string;
  pressed?: boolean;
  onClick?: () => void;
  href?: string;
};

/**
 * "More" — every tool for this one person that did not earn a place on the
 * rail, in one sheet, as icons and a word each.
 *
 * ## What is here, and why here
 *
 * The rail carries the five things people do most (Interest, Save, Kundli,
 * Grio, More). Everything else about a person is still one tap away, and it is
 * *contextual*: a tile appears only when it can actually do something for
 * this card — Voice only when there is a verified family recording, "Ask
 * Something" only while the one question is still unasked, "Add a Note" only
 * once an interest is out, "Not now" only in the feed and never on a rishta
 * that already happened. A greyed tile promising something that is not there
 * is the thing this sheet refuses to show.
 *
 * - **Like** lives here now. It is private (nobody learns of it) and it is not
 *   a decision, and next to Save on the rail two bookmarks with different
 *   rules read as one feature with a bug. Here it has room for its one word of
 *   explanation: "Private".
 * - **Get Help** is the marketplace — pandit, bureau, consultant — offered in
 *   the one place a member is already thinking about a specific rishta.
 * - **Report** stays last and quiet, the way it is everywhere.
 */
export default function ReelMoreSheet({
  open,
  onClose,
  card,
  liked,
  interestOut,
  onDetails,
  onWhy,
  onLike,
  onVoice,
  onAskPerson,
  onAddNote,
  onNotNow,
  onReport,
}: {
  open: boolean;
  onClose: () => void;
  card: ReelCardViewModel | null;
  liked: boolean;
  /** An interest has left (or is leaving) — a note can ride along with it. */
  interestOut: boolean;
  onDetails: () => void;
  onWhy: () => void;
  onLike: () => void;
  onVoice?: () => void;
  onAskPerson?: () => void;
  onAddNote?: () => void;
  /** Feed only, never on a matched card. */
  onNotNow?: () => void;
  onReport: () => void;
}) {
  const t = useT();
  if (!card) return <Sheet open={false} onClose={onClose}>{null}</Sheet>;

  const tiles: Tile[] = [
    { key: "details", icon: ScrollText, label: t("reel.more.details", "Details"), onClick: onDetails },
    { key: "why", icon: Blend, label: t("reel.more.why", "Why Match"), onClick: onWhy },
    {
      key: "like",
      icon: Heart,
      label: liked ? t("reel.rail.liked", "Liked") : t("reel.rail.like", "Like"),
      hint: t("reel.more.likeHint", "Private"),
      pressed: liked,
      onClick: onLike,
    },
    ...(onVoice ? [{ key: "voice", icon: Mic, label: t("reel.rail.voice", "Voice"), hint: t("reel.more.voiceHint", "Family"), onClick: onVoice }] : []),
    ...(onAskPerson && card.askedStatus === "NONE"
      ? [{ key: "ask", icon: HelpCircle, label: t("reel.card.askSomething", "Ask Something"), onClick: onAskPerson }]
      : []),
    ...(onAddNote && interestOut && !card.matchId
      ? [{ key: "note", icon: PenLine, label: t("reel.more.addNote", "Add Note"), onClick: onAddNote }]
      : []),
    { key: "profile", icon: UserRound, label: t("reel.more.fullProfile", "Full Profile"), href: `/user/profile/${card.id}` },
    { key: "help", icon: Store, label: t("reel.more.getHelp", "Get Help"), hint: t("reel.more.getHelpHint", "Pandit, bureau"), href: "/partners" },
  ];

  const summary = profileSummaryLine(card);

  return (
    <Sheet open={open} onClose={onClose} variant="bottom">
      <div className="pb-1">
        {/* Whose sheet this is — the person stays named at the top of every
            layer that opens over them. */}
        <div className="flex items-center gap-3">
          <span className="relative size-11 shrink-0 overflow-hidden rounded-full bg-grad-photo ring-2 ring-gold-300/60">
            {card.photoUnlocked && card.photoUrl ? (
              <Image src={card.photoUrl} alt="" fill unoptimized className="object-cover" style={{ objectPosition: `50% ${card.photoFocalY ?? 30}%` }} />
            ) : (
              <span aria-hidden className="grid size-full place-items-center text-[1rem] font-semibold text-white">
                {card.displayName.trim().charAt(0).toUpperCase()}
              </span>
            )}
          </span>
          <div className="min-w-0">
            <p className="truncate font-[family-name:var(--font-display)] text-[1.0625rem] font-bold leading-tight text-ink">
              {card.displayName}
              {card.age ? `, ${card.age}` : ""}
            </p>
            {summary && <p className="truncate text-[0.8125rem] text-muted">{summary}</p>}
          </div>
        </div>

        <ul className="mt-4 grid grid-cols-4 gap-x-1 gap-y-3">
          {tiles.map((tile) => (
            <li key={tile.key}>
              <TileButton tile={tile} onDone={onClose} />
            </li>
          ))}
        </ul>

        <div className="mt-4 flex flex-col border-t border-line pt-2">
          {onNotNow && !card.matchId && (
            <button
              type="button"
              onClick={onNotNow}
              className="flex min-h-12 items-center gap-3 rounded-lg px-1 text-left text-[0.9375rem] font-medium text-ink transition-colors hover:bg-bg-subtle"
            >
              <X className="size-5 shrink-0 text-muted" aria-hidden />
              <span className="min-w-0">
                {t("reel.more.notNow", "Not Now")}
                <span className="block text-[0.75rem] font-normal text-muted">
                  {t("reel.more.notNowHint", "Aage badhein — aisi profiles thodi kam dikhengi")}
                </span>
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={onReport}
            className="flex min-h-12 items-center gap-3 rounded-lg px-1 text-left text-[0.9375rem] font-medium text-danger transition-colors hover:bg-danger-bg"
          >
            <Flag className="size-5 shrink-0" aria-hidden />
            {t("reel.rail.report", "Report")}
          </button>
        </div>
      </div>
    </Sheet>
  );
}

function TileButton({ tile, onDone }: { tile: Tile; onDone: () => void }) {
  const body = (
    <>
      <span
        className={cn(
          "grid size-12 place-items-center rounded-2xl border border-line bg-bg-subtle text-ink transition-colors group-hover:border-gold-400",
          tile.pressed && "border-wine-300 bg-wine-50 text-wine-700 dark:border-wine-700/60 dark:bg-wine-900/40 dark:text-wine-200",
        )}
      >
        <tile.icon className={cn("size-5", tile.pressed && "fill-current")} aria-hidden />
      </span>
      <span className="text-center text-[0.75rem] font-semibold leading-tight text-ink">{tile.label}</span>
      {tile.hint && <span className="-mt-0.5 text-center text-[0.625rem] leading-tight text-muted">{tile.hint}</span>}
    </>
  );
  const shell = "group flex w-full flex-col items-center gap-1.5 rounded-xl py-1 text-center";
  return tile.href ? (
    <Link href={tile.href} className={shell} onClick={onDone}>
      {body}
    </Link>
  ) : (
    <button type="button" aria-pressed={tile.pressed} onClick={tile.onClick} className={shell}>
      {body}
    </button>
  );
}
