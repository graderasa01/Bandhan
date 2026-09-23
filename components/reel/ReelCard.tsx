"use client";

import { motion, type MotionValue } from "framer-motion";
import { Camera, ImageOff, Lock, Megaphone, Sparkles } from "lucide-react";
import PhotoSlideDeck, { type PhotoDeckControl } from "@/components/profile/PhotoSlideDeck";
import PhotoUnlockCta, { PhotoLockHint } from "@/components/subscription/PhotoUnlockCta";
import ProfileActionRail, { type InterestUi } from "./ProfileActionRail";
import ReelIdentity from "./ReelIdentity";
import type { ReelDetailsSection } from "./ReelDetailsSheet";
import { reelReasons } from "@/lib/reel/insights";
import { cn } from "@/lib/utils";
import type { ReelCardViewModel } from "@/lib/contracts/reel";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * Everything the card can do, owned by the screen rather than the card.
 *
 * The card is a picture of one person and a set of doors; what is behind each
 * door (a sheet, an optimistic interest, the chat) belongs to `ReelStack`,
 * because a `fixed` sheet rendered inside a transformed card is positioned
 * against the card instead of the viewport, and because an interest must
 * outlive the card it was sent from.
 */
export interface ReelCardActions {
  interest: InterestUi;
  /** Length of the undo window, and a key that changes when a new one opens. */
  pendingMs: number;
  pendingKey: number | null;
  saved: boolean;
  /** "28" — shown on the Kundli button only when real and not being ignored. */
  kundliBadge: string | null;
  grioLit: boolean;
  /** "Pehle dekha tha" — the history the rail's own states do not already say. */
  historyNote: string | null;
  onInterest: () => void;
  onSave: () => void;
  onKundli: () => void;
  onGrio: () => void;
  onMore: () => void;
  onDetails: (section?: ReelDetailsSection) => void;
  onReasons: () => void;
  /** Present only when the card carries the Verified Parent Blessing. */
  onVoice?: () => void;
  /** Present only when the photo lock is `add_own_photo` — see `PhotoUnlockCta`. */
  onAddPhoto?: () => void;
}

export interface ReelCardProps {
  card: ReelCardViewModel;
  /**
   * The page on screen. Its neighbours render the same card — so the next
   * person is already painted when the feed moves — but take no input and are
   * out of the accessibility tree.
   */
  active?: boolean;
  /** The owner previewing their own card: no rail, no pair-level signal, no feed chrome to clear. */
  selfPreview?: boolean;
  /** Filled while this card is on screen, so the feed's sideways swipe can walk its photos. */
  photoControlRef?: React.RefObject<PhotoDeckControl | null>;
  /** The sideways rubber-band while a finger walks the photos — applied to the photo only. */
  mediaX?: MotionValue<number>;
  /** Absent on the self-preview, which has no one to act on. */
  actions?: ReelCardActions;
}

/* ---------- Clearances for the floating chrome ----------
 *
 * The photo runs edge to edge under a one-row top bar (see `ReelStack`). The
 * offsets it needs live here as named constants rather than as magic numbers
 * through the JSX — change the bar's height and this is the one place that
 * follows.
 *
 * Written out in full rather than composed: Tailwind finds utilities by
 * scanning source text, so a class assembled from a template literal is a
 * class that never gets generated.
 */
/** Story bars ride in a band of their own above the top bar (which starts 1rem down). */
const CHROME_CLEAR_TOP = "top-[calc(0.5rem_+_env(safe-area-inset-top,0px))]";
/** Spotlight / mission — the first free band under the top bar. */
const CHROME_CHIP_TOP = "top-[calc(3.75rem_+_env(safe-area-inset-top,0px))]";
/** The photo's own note clears the chip band too. */
const CHROME_NOTE_TOP = "top-[calc(6.25rem_+_env(safe-area-inset-top,0px))]";

/**
 * One reel: a person, full bleed, with their name and five doors over them.
 *
 * ## The card no longer moves itself
 *
 * It used to own the whole gesture — drag, axis lock, threshold, fly-off — and
 * a card that was decided flew off the screen. That was a stack-of-cards
 * metaphor on a screen that became a vertical feed (D-92): every "next" was a
 * card being thrown away and another rising from underneath it, and every
 * Interest threw the person you had just chosen off the screen, then opened a
 * sheet about them a network round-trip later. Both are gone.
 *
 * Now `ReelFeed` owns every drag and moves whole pages — previous, current and
 * next are all mounted, so the person below is already painted when the
 * finger lifts — and nothing on this card is ever thrown. An Interest changes
 * the button, not the screen.
 *
 * ## What is on the face of it
 *
 * The media, two legibility scrims, at most one status chip (Spotlight or the
 * day's mission), the person's name block (`ReelIdentity`) and the action
 * rail (`ProfileActionRail`). Nothing else: the old badges that narrated a
 * drag ("INTEREST" / "NOT NOW" stamped over somebody's face) went with the
 * gestures they narrated.
 */
export default function ReelCard({
  card,
  active = true,
  selfPreview = false,
  photoControlRef,
  mediaX,
  actions,
}: ReelCardProps) {
  const t = useT();
  const showPhoto = card.photoUnlocked && card.photoUrl;
  const reasonsCount = selfPreview ? 0 : reelReasons(card).length;

  return (
    <div
      // The neighbours are scenery: `inert` takes them out of the tab order
      // and the accessibility tree in one attribute, so a keyboard user is
      // never offered the rail of a person they cannot see.
      inert={!active}
      className="absolute inset-0 overflow-hidden bg-grad-photo"
    >
      {/* ── The person ─────────────────────────────────────────────────── */}
      <motion.div className="absolute inset-0" style={active && mediaX ? { x: mediaX } : undefined}>
        {showPhoto ? (
          // `bioNote` is not passed as a trailing text slide: their own words
          // open in the details sheet, one tap from the name, and a slide
          // repeating them would be the same sentence in two places.
          <PhotoSlideDeck
            slides={card.slides}
            bioNote={null}
            fallbackPhotoUrl={card.photoUrl}
            fallbackFocalY={card.photoFocalY}
            displayName={card.displayName}
            // The neighbours are mounted to be ready, and `priority` is what
            // makes the next person's photo load before they are reached.
            priority={!selfPreview}
            progressTopClassName={selfPreview ? undefined : CHROME_CLEAR_TOP}
            noteTopClassName={selfPreview ? undefined : CHROME_NOTE_TOP}
            controlRef={active ? photoControlRef : undefined}
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center">
            <div className="flex flex-col items-center gap-2 px-8 pb-48 text-center">
              <span className="grid size-12 place-items-center rounded-full bg-surface/85 backdrop-blur-sm">
                {card.photoUnlocked ? <ImageOff className="size-5 text-muted" /> : <Lock className="size-5 text-muted" />}
              </span>
              {/* Two different absences: when the gate is open the profile
                  simply has no photo, and blaming the gate there invents a
                  restriction. The locked line says the card's own reason
                  (D-90) — and says it on every locked card, photo or not,
                  so the line itself never tells whether one exists. */}
              <p className="max-w-[15rem] text-[0.8125rem] leading-snug text-white/95 [text-shadow:0_1px_8px_rgb(0_0_0_/_0.4)]">
                {card.photoUnlocked ? (
                  `${card.displayName} ${t("reel.card.noPhotoYet", "ne abhi tak photo nahi daali")}`
                ) : (
                  <PhotoLockHint lock={card.photoLock} />
                )}
              </p>
              {!card.photoUnlocked &&
                (actions?.onAddPhoto && card.photoLock === "add_own_photo" ? (
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={actions.onAddPhoto}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-surface/90 px-3.5 text-[0.8125rem] font-semibold text-primary-text backdrop-blur-sm transition-colors hover:bg-surface"
                  >
                    <Camera className="size-3.5 shrink-0" aria-hidden />
                    {t("subscription.photoUnlockCta.addYourPhoto", "Add Your Photo")}
                  </button>
                ) : (
                  <PhotoUnlockCta
                    lock={card.photoLock}
                    className="rounded-full bg-surface/90 px-3.5 text-[0.8125rem] backdrop-blur-sm hover:bg-surface hover:no-underline"
                  />
                ))}
            </div>
          </div>
        )}
      </motion.div>

      {/* Legibility scrims. Two, not one: the bottom carries the name block and
          the rail, the top keeps the one-row bar readable over a bright sky.
          Neither is decoration — remove them and white text lands on whatever
          the photograph happens to be. */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/45 via-black/12 to-transparent",
          selfPreview ? "h-20" : "h-32",
        )}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[58%] bg-[linear-gradient(to_top,rgb(0_0_0/0.82)_0%,rgb(0_0_0/0.55)_24%,rgb(0_0_0/0.2)_58%,transparent_100%)]"
      />

      {/* One status chip at most. Spotlight is a paid delivery and is labelled
          on the card itself (D-90 Phase 6); the mission is server-decided, at
          most twice a day, and never on a paid card. */}
      {!selfPreview && (card.spotlight || card.mission) && (
        <div className={cn(CHROME_CHIP_TOP, "pointer-events-none absolute left-3 z-10 max-w-[70%]")}>
          {card.spotlight ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-gold-400/60 bg-black/45 px-2.5 py-1 text-[0.6875rem] font-semibold text-gold-100 backdrop-blur-md">
              <Megaphone className="size-3" aria-hidden />
              {t("reel.card.spotlight", "Spotlight")}
              <span className="sr-only">
                {" — "}
                {t("reel.card.spotlightNote", "Ye member ne apni profile aage rakhi hai.")}
              </span>
            </span>
          ) : (
            card.mission && (
              <p className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-gold-400/60 bg-black/45 py-1 pl-2 pr-2.5 text-[0.75rem] font-medium text-gold-100 backdrop-blur-md">
                <Sparkles className="size-3.5 shrink-0" aria-hidden />
                <span className="min-w-0 truncate">{card.mission.headline}</span>
              </p>
            )
          )}
        </div>
      )}

      {/* ── The name, and the doors ────────────────────────────────────── */}
      {/* One bottom-anchored row: the name block takes the width the rail
          leaves it, and the rail stands to its right. They share a baseline so
          the eye reads "who" and "what can I do" as one line of sight. */}
      <div className="absolute inset-x-0 bottom-0 z-10 flex items-end gap-1 pb-3 pl-3.5 pr-1">
        <div className="min-w-0 flex-1 pb-0.5">
          <ReelIdentity
            card={card}
            reasonsCount={reasonsCount}
            historyNote={actions?.historyNote ?? null}
            selfPreview={selfPreview}
            onReasons={actions?.onReasons}
            onDetails={actions?.onDetails}
            onVoice={actions?.onVoice}
          />
        </div>
        {actions && (
          <div className="shrink-0">
            <ProfileActionRail
              interest={actions.interest}
              pendingMs={actions.pendingMs}
              pendingKey={actions.pendingKey}
              saved={actions.saved}
              kundliBadge={actions.kundliBadge}
              grioLit={actions.grioLit && reasonsCount > 0}
              onInterest={actions.onInterest}
              onSave={actions.onSave}
              onKundli={actions.onKundli}
              onGrio={actions.onGrio}
              onMore={actions.onMore}
            />
          </div>
        )}
      </div>
    </div>
  );
}
