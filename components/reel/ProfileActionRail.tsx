"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Bookmark, BookmarkCheck, Check, Ellipsis, MessageCircle, Orbit, RotateCw, Sparkles, Users, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * Where an interest stands, as the button shows it.
 *
 *   idle     — nothing sent
 *   pending  — tapped; the undo window is open and nothing has left the phone
 *   syncing  — the window closed and the request is in flight
 *   sent     — the server has it (or had it before this card was dealt)
 *   failed   — the request did not arrive; one tap retries
 *   matched  — both said yes; the slot is the chat now
 *
 * `pending` and `syncing` look exactly like `sent` on purpose. The member
 * pressed a button that says what it does, and the answer on screen is
 * "done" from that instant — API latency is the app's problem, not theirs.
 * Only a real failure is ever shown, and only once it has happened.
 */
export type InterestUi = "idle" | "pending" | "syncing" | "sent" | "failed" | "matched";

/**
 * The column of actions down the right of the photograph.
 *
 * ## Five, in a fixed order
 *
 *   Interest   — the primary action; the chat, once there is a rishta
 *   Save       — the shortlist, as a toggle
 *   Kundli     — the 36-guna sheet, with the total on the button when it is real
 *   Grio       — why this rishta, and the assistant scoped to this person
 *   More       — everything else, in one sheet
 *
 * The order never changes, from card to card or member to member. What
 * personalisation may touch is *emphasis* — whether the guna badge shows,
 * whether Grio is lit — never position, because a rail you have to re-read on
 * every card is slower than the menu it replaced (see `lib/reel/affinity.ts`).
 *
 * ## Why Interest moved here, from a big button along the bottom
 *
 * The bottom of the screen now belongs to the app's own navigation and, just
 * above it, to the person's name. A side rail is where a thumb already rests
 * on a photo feed, and it lets the one action that matters most sit next to
 * the other four without a row of 60px circles standing on somebody's
 * photograph. It is still the largest and the only filled control in the
 * column, so the eye finds it first.
 *
 * It is not a heart. A heart is the most dating-app gesture there is, and this
 * sends a formal expression of interest another family may read — two figures
 * side by side is the promise the brand's rings make.
 *
 * ## No vibration
 *
 * Nothing here calls `haptic()`. A browsing surface that buzzes on every save
 * is the jarring feel this rebuild removes; the feedback is the button itself
 * changing, in the same frame as the tap.
 */
export default function ProfileActionRail({
  interest,
  pendingMs,
  pendingKey,
  saved,
  kundliBadge,
  grioLit,
  onInterest,
  onSave,
  onKundli,
  onGrio,
  onMore,
}: {
  interest: InterestUi;
  /** Length of the undo window, for the ring that runs out around the button. */
  pendingMs: number;
  /** Changes each time a new window opens, so the ring restarts rather than resuming. */
  pendingKey: number | null;
  saved: boolean;
  /** "28" — the guna total, only when both birth times make it the real number. */
  kundliBadge: string | null;
  /** Emphasis only: this member reaches for Grio, and this card has reasons to talk about. */
  grioLit: boolean;
  onInterest: () => void;
  onSave: () => void;
  onKundli: () => void;
  onGrio: () => void;
  onMore: () => void;
}) {
  const t = useT();
  const reduced = useReducedMotion();

  const done = interest === "pending" || interest === "syncing" || interest === "sent";
  const primaryLabel =
    interest === "matched"
      ? t("reel.rail.message", "Message")
      : interest === "failed"
        ? t("reel.rail.retry", "Retry")
        : done
          ? t("reel.rail.sent", "Sent")
          : t("reel.rail.interest", "Interest");
  const primaryAria =
    interest === "matched"
      ? t("reel.rail.messageAria", "Inse baat karein — rishta jud chuka hai")
      : interest === "pending"
        ? t("reel.rail.pendingAria", "Interest bhej rahe hain — cancel karne ke liye dobara tap karein")
        : interest === "failed"
          ? t("reel.rail.retryAria", "Interest nahi gaya — dobara bhejein")
          : done
            ? t("reel.rail.sentAria", "Interest bheja ja chuka hai")
            : t("reel.rail.interestAria", "Interest bhejein — inke parivaar ko pata chalega");
  const PrimaryIcon: LucideIcon =
    interest === "matched" ? MessageCircle : interest === "failed" ? RotateCw : done ? Check : Users;

  // Same guard every control over the card uses: a press here must reach the
  // button and never start a drag on the photograph underneath it.
  const guard = (e: React.PointerEvent) => e.stopPropagation();

  return (
    <div className="pointer-events-auto flex flex-col items-center gap-3" role="group" aria-label={t("reel.rail.groupLabel", "Profile actions")}>
      {/* ── Primary ─────────────────────────────────────────────────── */}
      <button
        type="button"
        onPointerDown={guard}
        onClick={onInterest}
        aria-label={primaryAria}
        className="group flex w-16 flex-col items-center gap-1"
      >
        <span className="relative grid size-[3.25rem] place-items-center">
          {/* The undo window, running out. It is the only animation on this
              rail that lasts longer than a tap, and it says one thing: "abhi
              tak kuch gaya nahi — ek tap aur, aur ye ruk jayega". */}
          {interest === "pending" && pendingKey !== null && !reduced && (
            <svg aria-hidden viewBox="0 0 60 60" className="pointer-events-none absolute -inset-1 size-[calc(100%+0.5rem)] -rotate-90">
              <motion.circle
                key={pendingKey}
                cx="30"
                cy="30"
                r="28"
                fill="none"
                stroke="rgb(245 214 150)"
                strokeWidth="2.5"
                strokeLinecap="round"
                initial={{ pathLength: 1 }}
                animate={{ pathLength: 0 }}
                transition={{ duration: pendingMs / 1000, ease: "linear" }}
              />
            </svg>
          )}
          <motion.span
            // Re-keyed per state so each change plays its own small moment —
            // the press lands, the button answers. No spring overshoot beyond
            // a few percent: it confirms, it does not celebrate.
            key={interest}
            initial={reduced ? false : { scale: interest === "idle" ? 1 : 0.84 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 520, damping: 26 }}
            className={cn(
              "grid size-full place-items-center rounded-full transition-colors",
              interest === "idle" &&
                "bg-accent text-gold-200 shadow-[0_10px_26px_rgb(74_17_25_/_0.45)] ring-2 ring-gold-400/70",
              (done || interest === "matched") && "reel-glass reel-glass--on text-gold-100",
              interest === "failed" && "reel-glass text-rose-200",
            )}
          >
            <PrimaryIcon className="size-6" strokeWidth={interest === "idle" ? 2 : 2.4} aria-hidden />
          </motion.span>
        </span>
        <RailLabel strong>{primaryLabel}</RailLabel>
      </button>

      <RailButton
        icon={saved ? BookmarkCheck : Bookmark}
        label={saved ? t("reel.rail.saved", "Saved") : t("reel.rail.save", "Save")}
        aria={
          saved
            ? t("reel.rail.savedAria", "Shortlist se hatayein")
            : t("reel.rail.saveAria", "Shortlist me save karein — sirf aap aur aapka Family Circle dekh sakte hain")
        }
        pressed={saved}
        lit={saved}
        onClick={onSave}
        guard={guard}
      />

      <RailButton
        icon={Orbit}
        label={t("reel.rail.kundli", "Kundli")}
        aria={
          kundliBadge
            ? t("reel.rail.kundliBadgeAria", "Kundli milan dekhein — {n} guna").replace("{n}", kundliBadge)
            : t("reel.rail.kundliAria", "Kundli milan dekhein — 36 guna")
        }
        badge={kundliBadge}
        onClick={onKundli}
        guard={guard}
      />

      <RailButton
        icon={Sparkles}
        label={t("reel.rail.grio", "Grio")}
        aria={t("reel.rail.grioAria", "Ye rishta kyun — aur Grio se is profile ke baare me poochein")}
        lit={grioLit}
        onClick={onGrio}
        guard={guard}
      />

      <RailButton
        icon={Ellipsis}
        label={t("reel.rail.more", "More")}
        aria={t("reel.rail.moreAria", "Aur options — details, like, sawaal, report")}
        onClick={onMore}
        guard={guard}
      />
    </div>
  );
}

function RailButton({
  icon: Icon,
  label,
  aria,
  pressed,
  lit = false,
  badge = null,
  onClick,
  guard,
}: {
  icon: LucideIcon;
  label: string;
  aria: string;
  /** Set only on a real toggle, so a screen reader hears "pressed" where it means something. */
  pressed?: boolean;
  lit?: boolean;
  badge?: string | null;
  onClick: () => void;
  guard: (e: React.PointerEvent) => void;
}) {
  return (
    <button
      type="button"
      onPointerDown={guard}
      onClick={onClick}
      aria-label={aria}
      aria-pressed={pressed}
      className="group flex w-16 flex-col items-center gap-1"
    >
      <span
        className={cn(
          "grid size-11 place-items-center rounded-full reel-glass",
          lit && "reel-glass--on text-gold-100",
        )}
      >
        <Icon className={cn("size-5", lit && pressed && "fill-current")} aria-hidden />
        {/* A child of the glass, never the glass itself: `.reel-glass` is the
            positioned ancestor this badge measures from. */}
        {badge && (
          <span
            aria-hidden
            className="absolute -right-1.5 -top-1 min-w-5 rounded-full bg-gold-300 px-1 text-center text-[0.625rem] font-bold leading-4 text-wine-900 shadow-[0_2px_6px_rgb(0_0_0_/_0.4)]"
          >
            {badge}
          </span>
        )}
      </span>
      <RailLabel>{label}</RailLabel>
    </button>
  );
}

function RailLabel({ children, strong = false }: { children: React.ReactNode; strong?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "text-center text-[0.6875rem] leading-tight text-white [text-shadow:0_1px_6px_rgb(0_0_0_/_0.6)]",
        strong ? "font-semibold" : "font-medium text-white/95",
      )}
    >
      {children}
    </span>
  );
}
