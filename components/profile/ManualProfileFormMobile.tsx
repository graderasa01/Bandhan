"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, BadgeCheck, Check, ChevronLeft, ChevronRight, Hand, Sparkles, X } from "lucide-react";
import { PROFILE_FIELDS, questionFor, type ProfileFieldDef } from "@/lib/profile/fields";
import { isAnswered, missingRequired } from "@/lib/profile/stages";
import { useProfile } from "@/lib/profile/profileState";
import { cn } from "@/lib/utils";
import { ease, haptic } from "@/lib/motion";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import InfoTip from "@/components/ui/InfoTip";
import PhotoUploadCard from "@/components/profile/PhotoUploadCard";
import ManualCard, { type ManualCardDirection } from "@/components/profile/ManualCard";

/**
 * One card look for the whole deck — not per-stage anymore (2026-08-03,
 * matching a Figma reference Devesh shared: a plain white card, a single
 * accent). `ACCENT`/`DECK_BG` are the *only* place that palette is defined —
 * the card glow, the progress bar fill, and the deck background below all
 * read from these two constants (via inline `style`, since Tailwind can't
 * resolve a class name built from a JS variable), so a future colour change
 * only ever happens in one spot.
 *
 * Set to the app's real mehroon — `wine-700` (#4A1119, globals.css), the
 * same colour `Button.tsx`'s "wine" variant uses for its one marked-different
 * action (see Button.tsx's D-26 comment: "sirf do rang — gold aur mehroon").
 * An earlier purple (#7149C6, a one-off Figma reference) was tried here and
 * reverted same day (2026-08-03) — this keeps the deck on the app's actual
 * two-colour palette instead of a third hue.
 */
const ACCENT = "#4A1119";
const DECK_BG = "#4A1119";

const CARD_THEME = {
  card: "border-line/60 bg-surface",
} as const;

/** Current card + this many peeking behind it. */
const STACK_DEPTH = 3;

/**
 * The deck has no next/back buttons on purpose (see the component docstring),
 * so a first-timer has nothing to look at that says the cards move at all —
 * which is exactly what happened on a real phone (Devesh, 2026-08-06). Two
 * things fix it, and they're deliberately different in weight: a permanent
 * icon legend docked under the deck (always there, costs a glance), and this
 * one-time coach — an animated hand demonstrating the gesture, shown once
 * ever per device and dismissed the moment the user swipes for real.
 *
 * Key naming mirrors `GrioBubble`'s own hint (`grio-bubble-hint-seen`), and
 * so does the 6s auto-hide: a hint nobody reads shouldn't sit on the card.
 */
const HINT_SEEN_KEY = "manual-deck-swipe-hint-seen";
const HINT_DURATION_MS = 6000;

/**
 * A field is "wide" when it needs a card to itself — a long option list, a
 * textarea that wants room to type, or the photo uploader. Everything else
 * ("compact") is short enough that two or three can share one page without
 * feeling cramped.
 */
function isWide(f: ProfileFieldDef): boolean {
  if (f.type === "photo" || f.type === "textarea") return true;
  if (f.options && f.options.length > 4) return true;
  return false;
}

const MAX_GROUP_SIZE = 3;

/**
 * Groups `PROFILE_FIELDS` into pages — a wide field always gets its own page;
 * compact fields pack up to `MAX_GROUP_SIZE` per page. A group never spans two
 * stages (even if that leaves a group under-full) so a card is never showing
 * a mix of two different stage pills at once — this is enforced by the stage
 * check below, not just an accident of the current field order in fields.ts.
 */
function buildPages(): ProfileFieldDef[][] {
  const pages: ProfileFieldDef[][] = [];
  let current: ProfileFieldDef[] = [];

  for (const f of PROFILE_FIELDS) {
    const sameStage = current.length > 0 && current[0].stage === f.stage;
    if (isWide(f) || !sameStage || current.length >= MAX_GROUP_SIZE) {
      if (current.length > 0) pages.push(current);
      current = [];
    }
    if (isWide(f)) {
      pages.push([f]);
    } else {
      current.push(f);
    }
  }
  if (current.length > 0) pages.push(current);
  return pages;
}

const PAGES = buildPages();

/**
 * One field's controls within a shared page — same catalog, same
 * `useProfile()` writes as `ManualFieldRow` in the desktop form, just sized
 * to sit alongside one or two siblings instead of owning the whole screen.
 */
function CompactField({ field, forSelf }: { field: ProfileFieldDef; forSelf: boolean }) {
  const { draft, setValue, clearField } = useProfile();
  const value = draft.values[field.key] ?? "";
  const multi = field.type === "multiselect";
  const picked = multi ? value.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const answered = isAnswered(field, draft.values);

  function set(next: string) {
    if (next.trim().length === 0) {
      clearField(field.key);
      return;
    }
    setValue(field.key, next, { source: "user", confirmed: true });
  }

  return (
    <div className="space-y-2 text-center">
      {/* A div, not a <p> — InfoTip renders its own <div> trigger, and a
          <div> can't nest inside a <p> without a hydration error. */}
      <div className="inline-flex items-center justify-center gap-1.5 text-[0.75rem] font-semibold text-ink">
        {field.label}
        {field.required ? (
          <span className="text-danger">*</span>
        ) : (
          <span className="font-normal text-subtle">optional</span>
        )}
        {field.whyNeeded && <InfoTip text={field.whyNeeded} />}
        {answered && <Check className="size-3.5 shrink-0 text-trust" aria-hidden />}
      </div>
      <p className="text-balance text-lg font-semibold leading-snug text-ink">{questionFor(field, forSelf)}</p>

      {/* Photos never go through the AI pipeline (fields.ts) — same upload
          card the desktop form and the voice flow both use. Always "wide", so
          it's always alone on its own page — never actually stacked here. */}
      {field.type === "photo" ? (
        <div className="text-left">
          <PhotoUploadCard />
        </div>
      ) : field.options ? (
        <div className="flex flex-wrap justify-center gap-1.5">
          {field.options.map((o) => {
            const on = multi ? picked.includes(o) : value === o;
            return (
              <button
                key={o}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  haptic("select");
                  if (!multi) {
                    set(on ? "" : o);
                    return;
                  }
                  const next = on ? picked.filter((p) => p !== o) : [...picked, o];
                  set(next.join(", "));
                }}
                className={cn(
                  "min-h-10 touch-target rounded-full border px-3.5 text-[0.8125rem] font-medium transition-all active:scale-95",
                  on
                    ? "border-primary bg-primary text-primary-fg shadow-sm"
                    : "border-line-strong bg-surface/80 text-ink hover:border-gold-500 hover:bg-gold-50 dark:hover:bg-gold-900/30",
                )}
              >
                {o}
              </button>
            );
          })}
        </div>
      ) : field.type === "textarea" ? (
        // Stops the swipe gesture from ever claiming a drag that starts
        // inside the box, so selecting your own text doesn't get read as
        // "go to next/previous field".
        <div className="space-y-2 text-left" onPointerDownCapture={(e) => e.stopPropagation()}>
          <Textarea
            value={value}
            rows={4}
            placeholder={field.placeholder}
            onChange={(e) => set(e.target.value)}
          />
          {field.suggestions && field.suggestions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {field.suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => set(value ? `${value} ${s}` : s)}
                  className="rounded-full border border-line-strong bg-bg-subtle px-3 py-1 text-[0.75rem] text-muted hover:border-gold-500 hover:text-ink"
                >
                  + {s}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div onPointerDownCapture={(e) => e.stopPropagation()}>
          <Input
            value={value}
            placeholder={field.placeholder ?? (field.type === "date" ? "DD/MM/YYYY" : undefined)}
            onChange={(e) => set(e.target.value)}
          />
        </div>
      )}

      {field.required && !answered && <p className="text-[0.75rem] text-warn">Ye zaroori hai.</p>}
    </div>
  );
}

/**
 * One page — a plain white card (see `CARD_THEME`), Reels-card styled
 * (corner glow, soft border). Fills the full `ManualCard` frame it's
 * rendered inside (which now owns the sizing/physics) — one field centres
 * itself in the same frame three fields fill, rather than the card
 * shrinking to whatever it happens to hold. `overflow-y-auto` is only a
 * safety net for the rare dense group that doesn't fit; with a full-height
 * card instead of the old 64vh one, it's rarer still.
 */
/**
 * The one white-card frame every card in the deck shares — a field page, the
 * completion screen, and (2026-08-03) the voice-question lead card all sit
 * inside the same shell, so the corner glow and card chrome only ever need
 * to change in this one place.
 */
function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className={cn("relative flex h-full w-full overflow-hidden rounded-2xl border shadow-lg backdrop-blur-xl", CARD_THEME.card)}>
      <div className="pointer-events-none absolute -right-8 -top-8 size-32 rounded-full opacity-10 blur-2xl" style={{ backgroundColor: ACCENT }} />
      <div className="relative flex flex-1 overflow-y-auto px-5 py-5">{children}</div>
    </div>
  );
}

function MobilePage({ fields, forSelf }: { fields: ProfileFieldDef[]; forSelf: boolean }) {
  return (
    <CardShell>
      {/* `m-auto` (not `justify-center` on this parent) so content centres
          vertically when it's short but still scrolls from a natural top
          edge — rather than clipping symmetrically — on the rare group
          that's taller than the frame. */}
      <div className="m-auto w-full divide-y divide-line/50">
        {fields.map((f) => (
          <div key={f.key} className="py-3.5 first:pt-0 last:pb-0">
            <CompactField field={f} forSelf={forSelf} />
          </div>
        ))}
      </div>
    </CardShell>
  );
}

/**
 * The end-of-deck card — same "one card" slot as any field page, just static
 * content instead of `MobilePage`. Still sits inside a draggable `ManualCard`
 * when it's on top, so swiping right back into the last field still works;
 * there's nothing to swipe forward into, which `goNext`'s clamp already
 * handles (the drag just elastically snaps back).
 */
function CompletionCard({
  live,
  missingReq,
  onJump,
  onPrev,
}: {
  live: boolean;
  missingReq: ProfileFieldDef[];
  onJump: (key: string) => void;
  onPrev: () => void;
}) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center overflow-y-auto rounded-2xl border border-line bg-surface px-6 py-8 text-center shadow-lg">
      <div
        className={cn(
          "w-full max-w-sm rounded-lg border px-5 py-8",
          live ? "border-trust/25 bg-trust-bg" : "border-line bg-bg-subtle",
        )}
      >
        {live ? (
          <BadgeCheck className="mx-auto size-10 text-trust" />
        ) : (
          <Sparkles className="mx-auto size-10 text-primary-text" />
        )}
        <h1 className="mt-3 text-2xl leading-tight">{live ? "Sab fields dekh liye" : "Bas thoda aur baaki hai"}</h1>
        <p className="mx-auto mt-2 max-w-md text-pretty leading-relaxed text-muted">
          {live
            ? "Jo bhi bhar diya wo save ho chuka hai — baaki jab chaho tab bhar sakte hain."
            : `${missingReq.length} zaroori fields abhi khaali hain — profile live karne ke liye ye bharne honge.`}
        </p>
      </div>

      {missingReq.length > 0 && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-1.5">
          <span className="text-[0.8125rem] text-warn">Baaki:</span>
          {missingReq.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => onJump(f.key)}
              className="rounded-full border border-warn/40 bg-warn-bg px-2.5 py-1 text-[0.75rem] font-medium text-warn transition-colors hover:bg-warn/15"
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      <div className="mt-5 flex flex-col gap-3">
        {live ? (
          <Link
            href="/user/dashboard"
            className={cn(
              "inline-flex h-12 items-center justify-center gap-2 rounded-full px-6 text-[0.9375rem] font-semibold",
              "bg-primary text-primary-fg shadow-md transition-all duration-200",
              "hover:-translate-y-0.5 hover:bg-primary-hover hover:shadow-gold",
            )}
          >
            View Dashboard
          </Link>
        ) : (
          <Button onClick={() => onJump(missingReq[0].key)}>Fill Required Fields</Button>
        )}
        <Button variant="secondary" onClick={onPrev}>
          <ArrowLeft className="size-4" />
          Go Back
        </Button>
      </div>
    </div>
  );
}

/**
 * The one-time gesture demo — a hand tracing the exact motion being asked
 * for, right→left across the card. `pointer-events-none` all the way down:
 * it sits directly over the top card, and a swipe that starts on top of it
 * has to reach the card underneath — the hint disappearing is a side effect
 * of that swipe landing, never a tap on this.
 *
 * Docked low rather than centred so it never covers the question itself:
 * someone who already knows the gesture can keep filling the card while this
 * lives out its six seconds.
 *
 * `bg-surface-inverse` / `text-inverse` is the same pairing `GrioBubble`'s
 * first-run tooltip uses — the app's one "this is a coach mark, not chrome"
 * look, and it stays legible against the wine deck in both themes.
 */
function SwipeCoach() {
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={ease.fast}
      className="pointer-events-none absolute inset-x-0 bottom-[calc(3.25rem+env(safe-area-inset-bottom,0px))] z-20 flex justify-center px-8"
    >
      <div className="flex max-w-[16rem] flex-col items-center gap-1.5 rounded-xl bg-surface-inverse px-4 py-3 text-center shadow-lg">
        <motion.span
          className="text-inverse"
          animate={reduced ? undefined : { x: [24, -24], opacity: [0, 1, 1, 0] }}
          transition={reduced ? undefined : { duration: 1.5, repeat: Infinity, repeatDelay: 0.25, ease: "easeInOut" }}
        >
          <Hand className="size-5" aria-hidden />
        </motion.span>
        <p className="text-[0.75rem] leading-snug text-inverse">
          Card ko <span className="font-semibold">left swipe</span> karein — agla sawaal. Peeche jaana ho to{" "}
          <span className="font-semibold">right swipe</span>.
        </p>
      </div>
    </motion.div>
  );
}

/**
 * The manual (no-AI) profile form — a full-screen, Tinder-style swipe deck:
 * one gradient stage-coloured card at a time, the next two peeking behind
 * it, drag left for the next field / drag right for the previous one. No
 * page scroll, no separate header row above the card, no auto-advance —
 * every transition is a deliberate swipe (or the equivalent ArrowLeft/
 * ArrowRight keys). Chrome is docked directly on the deck, never in a row
 * that steals space from the card: a thin per-page progress bar and a close
 * (X) button back to `onBack()` on top, the swipe legend below.
 *
 * Rendered through a portal to `document.body` rather than inline: its host,
 * `InterviewMode`'s per-phase `motion.div`, keeps a live (if resting)
 * `transform` on itself via `animate={{ y: 0 }}`, which creates a containing
 * block for any `position: fixed` descendant — a fixed element rendered
 * inline here would clip to that centered column instead of the real
 * viewport. The portal sidesteps that with zero changes to `InterviewMode`
 * or `OnboardingShell`, so every other onboarding phase is unaffected.
 */
export default function ManualProfileFormMobile({
  onBack,
  initialFocusKey,
  leadCard,
}: {
  onBack: () => void;
  /** From a `?mode=manual&field=<key>` link — land on the page containing
   *  this field instead of the first one. */
  initialFocusKey?: string | null;
  /**
   * An extra card prepended before the field pages, at index 0 — used when
   * entering from the voice interview (InterviewMode's "targeted" phase) so
   * its own forward swipe lands on the first manual field card, same deck.
   * A render prop rather than a plain node so its own "fill the form
   * instead" action can call the exact same `goNext` a swipe would.
   */
  leadCard?: (goNext: () => void) => React.ReactNode;
}) {
  const { draft, live } = useProfile();
  const LEAD = leadCard ? 1 : 0;
  const total = PAGES.length + LEAD;

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [showCoach, setShowCoach] = useState(false);

  function dismissCoach() {
    setShowCoach(false);
    try {
      window.localStorage.setItem(HINT_SEEN_KEY, "1");
    } catch {
      /* storage blocked (private mode) — the hint just shows again next time */
    }
  }

  // Shown once per device, then auto-retired. Deliberately not gated on
  // `index === 0`: entering at a deep field from a `?field=` link is exactly
  // the case where someone has never seen the deck before.
  useEffect(() => {
    try {
      if (window.localStorage.getItem(HINT_SEEN_KEY)) return;
    } catch {
      return;
    }
    setShowCoach(true);
    // `dismissCoach` is a fresh function each render but only ever touches
    // setState + localStorage, so the first render's copy stays correct.
    const hide = setTimeout(dismissCoach, HINT_DURATION_MS);
    return () => clearTimeout(hide);
  }, []);

  // Belt-and-braces alongside the portal root's own `overflow-hidden` — the
  // real (invisible) OnboardingShell document behind this takeover must not
  // scroll either.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  function pageIndexForKey(key: string) {
    const i = PAGES.findIndex((g) => g.some((f) => f.key === key));
    return i < 0 ? -1 : i + LEAD;
  }

  const [index, setIndex] = useState(() => {
    const i = initialFocusKey ? pageIndexForKey(initialFocusKey) : -1;
    return i >= 0 ? i : 0;
  });

  const forSelf = draft.fillingFor === "self";
  const missingReq = missingRequired(draft.values);

  function jumpTo(key: string) {
    const i = pageIndexForKey(key);
    if (i < 0) return;
    haptic("tap");
    dismissCoach();
    setIndex(i);
  }

  // Any successful navigation — swipe, arrow key, or a jump from the
  // completion card — is proof the gesture landed, so the coach has done its
  // job and retires for good.
  function goNext() {
    haptic("tap");
    dismissCoach();
    setIndex((i) => Math.min(i + 1, total));
  }

  function goPrev() {
    haptic("tap");
    dismissCoach();
    setIndex((i) => Math.max(i - 1, 0));
  }

  /**
   * Reels/Stories mapping — swipe *left* to go forward, right to go back
   * (flipped 2026-08-06; it used to be the mirror of this). Deliberately the
   * only place the gesture gets its meaning: `ManualCard` just reports which
   * way the finger travelled. Its fly-off/fly-in animation mirrors this, so
   * the two flip together — see the choreography note in its docstring.
   */
  function handleDismiss(direction: ManualCardDirection) {
    if (direction === "LEFT") goNext();
    else goPrev();
  }

  // The only fallback for anyone who can't (or doesn't want to) swipe —
  // mirrors ReelStack's own keydown listener. goNext/goPrev only ever use
  // setState's functional form, so they never go stale; safe to omit from deps.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleIndices: number[] = [];
  for (let d = 0; d < STACK_DEPTH; d++) {
    const i = index + d;
    if (i > total) break;
    visibleIndices.push(i);
  }

  if (!mounted) return null;

  return createPortal(
    // EXPERIMENTAL — Devesh asked to preview a purple deck background
    // (2026-08-03), a one-off Figma reference colour, not the app's usual
    // bg-bg neutral. See the CARD_THEME docstring above — DECK_BG is read
    // here, not hardcoded, so this stays in sync with that single palette.
    <div className="fixed inset-0 z-40 flex h-[100dvh] w-full flex-col overflow-hidden" style={{ backgroundColor: DECK_BG }}>
      {/* Docked directly on the deck, not a separate header section —
          `pointer-events-none` on the row so a drag started anywhere in this
          strip still reaches the card underneath; only the X button opts
          back in. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center gap-3 px-4 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] sm:px-6">
        <button
          type="button"
          onClick={() => {
            haptic("tap");
            onBack();
          }}
          aria-label="Close"
          className="pointer-events-auto grid size-9 shrink-0 touch-target place-items-center rounded-full bg-surface/85 text-ink shadow-sm backdrop-blur-sm transition-colors hover:bg-surface"
        >
          <X className="size-5" />
        </button>

        <div
          className="flex flex-1 items-center gap-1"
          role="progressbar"
          aria-valuenow={Math.min(index + 1, total)}
          aria-valuemin={1}
          aria-valuemax={total}
        >
          {Array.from({ length: total }).map((_, i) => (
            <div
              key={i}
              className={cn("h-1 flex-1 rounded-full transition-colors", i > index && "bg-bg-subtle/80")}
              style={i <= index ? { backgroundColor: ACCENT } : undefined}
            />
          ))}
        </div>

        {/* Balances the close button so the progress row stays centered. */}
        <span className="size-9 shrink-0" aria-hidden />
      </div>

      {/* `px-8`, not `px-4` — Android's system back-gesture claims a strip
          along the screen's outer edge for itself before a touch ever
          reaches the page, regardless of `touch-action` (it's OS-level,
          below the browser). It's mainly velocity-gated too — a touch that
          starts still and *then* moves rarely triggers it, a fast flick
          starting near the edge often does — so on top of `touch-none!`
          (ManualCard.tsx) fixing the in-page gesture fight, more margin here
          just gives a normal grab-the-card swipe more room to start outside
          that strip before a fast/curved motion can still catch its edge.
          Not a full fix (nothing in web code can suppress that OS gesture;
          its width also varies by OEM — some go wider than this margin),
          just fewer swipes starting inside it. */}
      <div className="relative mx-auto w-full max-w-md flex-1 px-8 pb-[calc(2.75rem+env(safe-area-inset-bottom,0px))] pt-[calc(3.25rem+env(safe-area-inset-top,0px))]">
        <div className="relative h-full w-full">
          <AnimatePresence initial={false}>
            {[...visibleIndices].reverse().map((i, pos) => {
              const depth = visibleIndices.length - 1 - pos;
              let content: React.ReactNode;
              if (leadCard && i === 0) {
                content = <CardShell>{leadCard(goNext)}</CardShell>;
              } else {
                const page = i - LEAD < PAGES.length ? PAGES[i - LEAD] : null;
                content = page ? (
                  <MobilePage fields={page} forSelf={forSelf} />
                ) : (
                  <CompletionCard live={live} missingReq={missingReq} onJump={jumpTo} onPrev={goPrev} />
                );
              }
              return (
                <ManualCard key={i} draggable={depth === 0} depth={depth} onDismiss={handleDismiss}>
                  {content}
                </ManualCard>
              );
            })}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>{showCoach && <SwipeCoach key="swipe-coach" />}</AnimatePresence>

      {/* The permanent half of the instructions — the deck has no next/back
          buttons by design, so without this the gesture is undiscoverable
          once the one-time coach above has retired. Icons carry the
          direction; the two words only name what it does.

          `pointer-events-none` for the same reason the top row has it: this
          strip sits in the deck's bottom padding, well inside thumb reach,
          and a swipe that starts here has to reach the card — it is a label,
          never a button. Colours are literal white-on-wine rather than
          theme tokens because `DECK_BG` behind it is a fixed constant, not a
          themed surface. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-center justify-center gap-1.5 px-4 pb-[calc(0.65rem+env(safe-area-inset-bottom,0px))] text-[0.6875rem] font-medium text-white/85">
        <Hand className="size-3.5 text-white/55" aria-hidden />
        <span className="inline-flex items-center gap-1 rounded-full bg-white/10 py-1 pl-2 pr-2.5 ring-1 ring-white/15">
          <ChevronLeft className="size-3.5" aria-hidden />
          Next
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-white/10 py-1 pl-2.5 pr-2 ring-1 ring-white/15">
          Back
          <ChevronRight className="size-3.5" aria-hidden />
        </span>
      </div>
    </div>,
    document.body,
  );
}
