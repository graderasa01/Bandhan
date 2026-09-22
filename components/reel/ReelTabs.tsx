"use client";

import { Fragment } from "react";
import { Bookmark, Eye, Heart, MessageCircle, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/motion";
import { REEL_LENSES, REEL_TABS, type ReelTab } from "@/lib/contracts/reel";
import { REEL_LANES, type ReelLane } from "@/lib/contracts/reelLibrary";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * One rail, two halves — the reel's whole navigation (D-91b).
 *
 * **Forward** (For You · Nearby · New) re-cuts the deck the screen is holding.
 * Each lens is answered by a real field on the card behind it, so a tab can
 * only ever show cards that genuinely carry that property. Since D-91 a lens
 * that runs dry asks for the next batch rather than declaring the day over.
 *
 * Since D-92 "For You" is the whole feed: the new rishtey *and* the ones this
 * member has already seen, mixed by the server and scrolled up and down like
 * any reel. "New" is then the honest filter over it — `!seenBefore`, the
 * people not met yet — so a new profile sits in both pills at once, which is
 * exactly the ask ("new wale tab me new ho, but wah For You me bhi hon").
 *
 * **Backward** (Dekhe · Like · Shortlist · Interest · Message) is their own history, and
 * it exists because of the question D-91 left open: when the pool runs out,
 * what is there to do? The answer is the several hundred people they have
 * already walked past. A lane deals the same full-bleed cards as the reel, but
 * the gesture means something else there: drag left for the next person, drag
 * right to bring the previous one back. Nothing is decided by a drag in a
 * lane — every write comes from a labelled button (see `ReelStack.commit`).
 *
 * "Compatible" used to sit between them and was removed at Devesh's call: it
 * claimed a judgement ("ye aapke liye strong hai") where the other six state a
 * fact, and on a thin pool it was empty far more often than it was useful.
 *
 * ## The number on each pill is load-bearing
 *
 * Without it seven frosted pills over a photograph read as seven copies of one
 * button. Forward counts are the cards *currently loaded* that this lens still
 * has left to show; backward counts come from the server and are the size of
 * the lane. Both are real counts of rows, never a target.
 *
 * ## Why eight fit in one row
 *
 * They don't, on a 360px phone — the row scrolls, which is the one option that
 * never cuts a word in half. A hairline separator marks where forward ends and
 * backward begins, and the backward five carry icons so the eye can tell the
 * two families apart before reading a single label.
 */

export function isReelLane(tab: ReelTab): tab is ReelLane {
  return (REEL_LANES as string[]).includes(tab);
}

export default function ReelTabs({
  active,
  counts,
  unreadMessages = 0,
  onChange,
}: {
  active: ReelTab;
  /** Forward: undecided cards loaded. Backward: the lane's size, from the server. */
  counts: Record<ReelTab, number>;
  /**
   * Unread messages waiting for this member (D-92b).
   *
   * Marks the Messages pill with a dot — not a second number. The pill already
   * carries one (how many chats exist), and two numbers on one 40px pill is
   * how a rail stops being readable. The count itself is on the Messages
   * screen, where it can be attached to the person who sent it; here it only
   * has to answer "kuch aaya hai kya".
   *
   * It lives on this rail because the reel is full-bleed: no header, no bottom
   * nav, nothing else on the screen that could tell somebody a reply arrived.
   */
  unreadMessages?: number;
  onChange: (tab: ReelTab) => void;
}) {
  const t = useT();

  const LABELS: Record<ReelTab, string> = {
    FOR_YOU: t("reel.tabs.forYou", "For You"),
    NEARBY: t("reel.tabs.nearby", "Nearby"),
    NEW: t("reel.tabs.new", "New"),
    // English, like every other tab and nav label in the app — the labels are
    // controls, the sentences around them are Hinglish.
    VIEWED: t("reel.tabs.viewed", "Viewed"),
    LIKED: t("reel.tabs.liked", "Liked"),
    SHORTLIST: t("reel.tabs.shortlist", "Shortlist"),
    INTEREST: t("reel.tabs.interest", "Interest"),
    MESSAGE: t("reel.tabs.message", "Messages"),
  };

  const ICONS: Partial<Record<ReelTab, typeof Eye>> = {
    VIEWED: Eye,
    LIKED: Heart,
    // The same bookmark the action bar's Shortlist button wears, so the button
    // and the pile it fills are recognisably one thing.
    SHORTLIST: Bookmark,
    INTEREST: Send,
    MESSAGE: MessageCircle,
  };

  return (
    <div
      role="tablist"
      aria-label={t("reel.tabs.groupLabel", "Aaj ke rishton ke lens")}
      className="flex items-center gap-1.5 overflow-x-auto px-3 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:px-4 [&::-webkit-scrollbar]:hidden"
    >
        {REEL_TABS.map((lens, i) => {
          const isActive = lens === active;
          const empty = counts[lens] === 0;
          const Icon = ICONS[lens];
          return (
            <Fragment key={lens}>
              {/* Where "aage" ends and "peeche" begins. A hairline, because a
                  second row of chrome over somebody's photograph costs more
                  than this separates. */}
              {i === REEL_LENSES.length && (
                <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 self-center rounded bg-white/25" />
              )}
            <button
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => {
                if (!isActive) haptic("select");
                onChange(lens);
              }}
              className={cn(
                "relative inline-flex h-10 shrink-0 items-center gap-1 rounded-full px-3 text-[0.8125rem] font-semibold reel-glass",
                isActive && "reel-glass--on",
                !isActive && empty && "reel-glass--muted",
              )}
            >
              {Icon && <Icon className="size-3.5 shrink-0" aria-hidden />}
              {LABELS[lens]}
              {/* How many undecided cards this lens actually holds. The row
                  used to carry one "4/15" chip at the end, which said how far
                  through the day you were but nothing at all about what each
                  tab would do — so all four read as the same button. A number
                  on each pill is the difference, in the one place it is being
                  asked about, and it comes straight off the cards. */}
              <span className={cn("text-[0.6875rem] tabular-nums", isActive ? "text-white/75" : "text-white/55")}>
                {counts[lens]}
              </span>
              {/* The active mark sits under the words inside the pill — the
                  reference's own weight. Rose rather than the brand's wine:
                  wine-700 is nearly black and would vanish on a frosted dark
                  pill, which is the one thing a "you are here" mark may not do. */}
              <span
                aria-hidden
                className={cn(
                  "absolute inset-x-2.5 bottom-[6px] h-[2.5px] rounded-full bg-rose-500 transition-opacity",
                  isActive ? "opacity-100" : "opacity-0",
                )}
              />
              {/* "Jawab aaya hai." Rose, like the active mark, because those
                  are the two things on this rail that are about *now*. */}
              {lens === "MESSAGE" && unreadMessages > 0 && (
                <span
                  aria-hidden
                  className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-rose-500 ring-2 ring-wine-900/40"
                />
              )}
              <span className="sr-only">
                {lens === "MESSAGE" && unreadMessages > 0
                  ? `${(unreadMessages === 1
                      ? t("reel.tabs.unreadOne", "— 1 naya message")
                      : t("reel.tabs.unread", "— {n} naye message")
                    ).replace("{n}", String(unreadMessages))} `
                  : ""}
                {empty
                  ? t("reel.tabs.emptySuffix", "— is lens me abhi koi nahi")
                  : (counts[lens] === 1
                      ? t("reel.tabs.countSuffixOne", "— 1 profile baaki")
                      : t("reel.tabs.countSuffix", "— {n} profiles baaki")
                    ).replace("{n}", String(counts[lens]))}
              </span>
            </button>
            </Fragment>
          );
        })}
    </div>
  );
}
