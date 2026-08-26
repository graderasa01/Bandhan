"use client";

import { Fragment, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Briefcase,
  Building2,
  CalendarDays,
  Camera,
  Check,
  ChevronLeft,
  Cigarette,
  Clock,
  Coffee,
  Feather,
  GraduationCap,
  Hand,
  Heart,
  HeartHandshake,
  Home,
  IndianRupee,
  Languages,
  MapPin,
  Palette,
  PenLine,
  Plane,
  Ruler,
  ScrollText,
  ShieldAlert,
  Sparkles,
  Sun,
  User,
  Users,
  Utensils,
  Wine,
  X,
  type LucideIcon,
} from "lucide-react";
import { PROFILE_FIELDS, questionFor, type ProfileFieldDef } from "@/lib/profile/fields";
import { categoryOf, type FieldCategoryKey } from "@/lib/profile/fieldGroups";
import { isAnswered, missingRequired, type ProfileValues } from "@/lib/profile/stages";
import { useProfile } from "@/lib/profile/profileState";
import { cn } from "@/lib/utils";
import { ease, haptic } from "@/lib/motion";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import InfoTip from "@/components/ui/InfoTip";
import PhotoUploadCard from "@/components/profile/PhotoUploadCard";
import ManualCard, { type ManualCardDirection } from "@/components/profile/ManualCard";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * One card look for the whole deck — not per-stage (2026-08-03), and as of
 * 2026-08-26 not a wine slab either: warm ivory card on a cream/blush canvas,
 * champagne-gold hairlines, wine serif questions, blush for "chosen".
 *
 * **No colour is written in this file.** Every value lives in one block in
 * `app/globals.css` (search "THE PROFILE DECK") as `--deck-*` tokens plus the
 * `.deck-*` classes below, for the same one-spot reason the old `ACCENT`/
 * `DECK_BG` constants existed — they're just CSS now, which also lets the
 * card, its chips and its inputs share a hover/focus language without every
 * rule being restated as a Tailwind string.
 *
 * That block also remaps the app's own `--bt-*` tokens on `.deck`, which is
 * what keeps shared controls (Input, Textarea, InfoTip, Button,
 * PhotoUploadCard) light inside a deck that is committed to a light ground
 * regardless of the site theme. See the note there before changing either.
 */

/** Current card + this many peeking behind it. */
const STACK_DEPTH = 3;

/**
 * The small mark beside a field's label — decoration, not data, which is why
 * it lives here and not in `fields.ts`: the catalog is the single source of
 * what is *asked*, and an icon column there would be one more thing to keep
 * in step for no answer's benefit.
 *
 * A key with no entry falls back to its category's icon (`CATEGORY_ICON`), so
 * a field added to the catalog tomorrow renders a sensible mark rather than a
 * hole — the fallback is the point, not an oversight.
 */
const FIELD_ICON: Record<string, LucideIcon> = {
  fullName: User,
  gender: Users,
  dateOfBirth: CalendarDays,
  height: Ruler,
  currentCity: MapPin,
  maritalStatus: Heart,
  motherTongue: Languages,

  education: GraduationCap,
  profession: Briefcase,
  workLocation: Building2,
  annualIncome: IndianRupee,

  familyType: Home,
  fatherOccupation: Briefcase,
  motherOccupation: Briefcase,
  siblings: Users,
  siblingsMarried: HeartHandshake,
  familyValues: HeartHandshake,

  religion: Sparkles,
  caste: Users,
  nativePlace: MapPin,

  diet: Utensils,
  smoking: Cigarette,
  drinking: Wine,
  hobbies: Palette,
  languagesKnown: Languages,
  aboutMe: PenLine,

  partnerAgeRange: CalendarDays,
  partnerCityPreference: MapPin,
  partnerEducation: GraduationCap,
  partnerReligionPreference: Sparkles,
  partnerCastePreference: Users,
  partnerManglikPreference: Sun,
  partnerWorkExpectation: Briefcase,
  relocateWilling: Plane,
  dealBreakers: ShieldAlert,

  manglikStatus: Sun,
  gotra: ScrollText,
  birthTime: Clock,
  birthPlace: MapPin,

  photos: Camera,
};

const CATEGORY_ICON: Record<FieldCategoryKey, LucideIcon> = {
  basics: User,
  career: Briefcase,
  family: Home,
  background: Users,
  lifestyle: Coffee,
  partner: Heart,
  kundli: Sparkles,
  photos: Camera,
};

function iconFor(field: ProfileFieldDef): LucideIcon {
  return FIELD_ICON[field.key] ?? CATEGORY_ICON[categoryOf(field.key)];
}

/**
 * The gold flourish between two questions on one card, and above the deck
 * title. Small on purpose — the reference's ornament is a full stop between
 * blocks, not an illustration.
 */
function Ornament({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 12" className={className} aria-hidden focusable="false">
      <path
        d="M12 1.5 15.5 6 12 10.5 8.5 6z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <circle cx="3" cy="6" r="1" fill="currentColor" />
      <circle cx="21" cy="6" r="1" fill="currentColor" />
    </svg>
  );
}

/**
 * A deck whose only navigation is a gesture gives a first-timer nothing to
 * look at that says the cards move at all — which is exactly what happened on
 * a real phone (Devesh, 2026-08-06). Two things fix it, and they're
 * deliberately different in weight: the permanent hand mark in the card's
 * footer (always there, costs a glance), and this one-time coach — an
 * animated hand demonstrating the gesture, shown once ever per device and
 * dismissed the moment the user swipes for real.
 *
 * Key naming mirrors `GrioBubble`'s own hint (`grio-bubble-hint-seen`), and
 * so does the 6s auto-hide: a hint nobody reads shouldn't sit on the card.
 */
const HINT_SEEN_KEY = "manual-deck-swipe-hint-seen";
const HINT_DURATION_MS = 6000;

/**
 * True when the keystroke belongs to something the user is typing into, so
 * the deck's own arrow-key navigation must stay out of the way. Covers the
 * whole editable family, not just `<input>`: a `contenteditable` host reports
 * no useful tag name, and a native `<select>` uses the arrows to change its
 * own value.
 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";
}

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
 * Groups fields into pages — a wide field always gets its own page; compact
 * fields pack up to `MAX_GROUP_SIZE` per page. A group never spans two stages
 * (even if that leaves a group under-full) so a card is never showing a mix of
 * two different stage pills at once — this is enforced by the stage check
 * below, not just an accident of the current field order in fields.ts.
 *
 * Takes its fields rather than reading `PROFILE_FIELDS` directly: the deck is
 * now built from whatever subset the caller scoped it to (see `deckFields`).
 */
function buildPages(fields: ProfileFieldDef[]): ProfileFieldDef[][] {
  const pages: ProfileFieldDef[][] = [];
  let current: ProfileFieldDef[] = [];

  for (const f of fields) {
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

/**
 * Which fields this deck is about, decided **once, on mount**.
 *
 * The freezing is the whole point, and it is worth being explicit about why a
 * live `useMemo(..., [draft.values])` would be wrong here: with `pendingOnly`,
 * a field stops being pending the instant the user types into it. Recomputing
 * would delete the card out from under the finger holding it — the answer
 * lands, the page count drops, every index after it shifts by one, and the
 * deck jumps to a different question. So the set is snapshotted at entry and
 * held for the life of the deck; re-entering is what picks up the new state.
 *
 * `focusKey` is unioned back in unconditionally. A chip tapped at the exact
 * moment its field stopped being empty (a race with the draft sync, or a
 * stale dashboard) must still land on a real card rather than silently
 * scrolling to whatever happens to sit at that index.
 */
function selectDeckFields(
  values: ProfileValues,
  opts: { only?: readonly string[] | null; pendingOnly?: boolean; focusKey?: string | null },
): ProfileFieldDef[] {
  const allow = opts.only ? new Set(opts.only) : null;
  const picked = PROFILE_FIELDS.filter((f) => {
    if (allow && !allow.has(f.key)) return false;
    if (f.key === opts.focusKey) return true;
    // Photos never appear in draft values (stages.ts), so `isAnswered` reads
    // them as pending forever — they'd pin themselves to every filtered deck.
    if (opts.pendingOnly && (f.type === "photo" || isAnswered(f, values))) return false;
    return true;
  });
  // A scope that filtered everything out still has to render something, or the
  // deck opens on a bare completion card with no way to see what it covered.
  return picked.length > 0 ? picked : PROFILE_FIELDS.filter((f) => (allow ? allow.has(f.key) : true));
}

/**
 * One field's controls within a shared page — same catalog, same
 * `useProfile()` writes as `ManualFieldRow` in the desktop form, just sized
 * to sit alongside one or two siblings instead of owning the whole screen.
 */
function CompactField({ field, forSelf }: { field: ProfileFieldDef; forSelf: boolean }) {
  const t = useT();
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

  const Icon = iconFor(field);

  return (
    <div className="text-center">
      {/* A div, not a <p> — InfoTip renders its own <div> trigger, and a
          <div> can't nest inside a <p> without a hydration error. */}
      <div className="deck-label">
        <span className="deck-label-icon">
          <Icon className="size-3.5" aria-hidden />
        </span>
        <span className="deck-label-name">{field.label}</span>
        {field.required ? (
          <span className="text-danger">*</span>
        ) : (
          <span className="deck-label-optional">{t("profile.manualProfileFormMobile.optional", "optional")}</span>
        )}
        {field.whyNeeded && <InfoTip text={field.whyNeeded} />}
        {answered && <Check className="size-3.5 shrink-0 text-trust" aria-hidden />}
      </div>
      <p className="deck-question mt-3">{questionFor(field, forSelf)}</p>

      {/* Photos never go through the AI pipeline (fields.ts) — same upload
          card the desktop form and the voice flow both use. Always "wide", so
          it's always alone on its own page — never actually stacked here. */}
      {field.type === "photo" ? (
        <div className="mt-5 space-y-2 text-left">
          <PhotoUploadCard />
          {/* The "optional" chip beside the label is easy to miss on the one
              card in the deck people are most likely to read as a wall — a
              new account on the gate deck hits this immediately after seven
              cards of required fields, so the exemption is spelled out in
              full rather than left to a one-word tag. Says what skipping
              actually costs too: not the profile going live (it goes live
              either way), just how far it travels. */}
          <p className="text-[0.75rem] leading-snug text-muted">
            {t(
              "profile.manualProfileFormMobile.photoOptionalNote",
              "Photo zaroori nahi hai — iske bina bhi profile live ho jayegi. Par jinhe aap dikhna chahte hain, unke liye ek saaf photo sabse bada farq daalti hai.",
            )}
          </p>
        </div>
      ) : field.options ? (
        /* Not a grid — an option is as wide as its own words, and a fixed
           column would either clip "Baat kar ke tay karenge" or leave "Haan"
           swimming in a box. Wrapping centred is what lets a two-word and a
           five-word answer sit on the same row without either being padded
           to match the other. */
        <div className="mt-5 flex flex-wrap justify-center gap-2.5">
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
                className="deck-chip touch-target"
              >
                {o}
                {/* The blush fill alone reads as "hovered" as much as
                    "chosen" on a warm card, so the chosen one also carries a
                    mark. aria-pressed above is what actually announces it. */}
                {on && (
                  <span className="deck-chip-check">
                    <Check className="size-3.5" aria-hidden />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ) : field.type === "textarea" ? (
        // Stops the swipe gesture from ever claiming a drag that starts
        // inside the box, so selecting your own text doesn't get read as
        // "go to next/previous field".
        <div className="mt-5 space-y-2.5 text-left" onPointerDownCapture={(e) => e.stopPropagation()}>
          <Textarea
            className="deck-input"
            value={value}
            rows={4}
            placeholder={field.placeholder}
            onChange={(e) => set(e.target.value)}
          />
          {field.suggestions && field.suggestions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {field.suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => set(value ? `${value} ${s}` : s)}
                  className="deck-suggest"
                >
                  + {s}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-5" onPointerDownCapture={(e) => e.stopPropagation()}>
          <Input
            className={cn("deck-input", field.type === "text" && "deck-input-quill")}
            /* A quill in the box on the one field type you answer in your own
               words. Not on dates — a date field wants its own format hint
               (below), and two marks in one box is one too many. */
            prefix={field.type === "text" ? <Feather className="deck-quill" /> : undefined}
            value={value}
            placeholder={field.placeholder ?? (field.type === "date" ? "DD/MM/YYYY" : undefined)}
            onChange={(e) => set(e.target.value)}
          />
        </div>
      )}

      {field.required && !answered && (
        <p className="mt-2.5 text-[0.75rem] text-warn">{t("profile.manualProfileFormMobile.requiredHint", "Ye zaroori hai.")}</p>
      )}
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
 * The one ivory-card frame every card in the deck shares — a field page and
 * (2026-08-03) the voice-question lead card sit inside the same shell, so the
 * card chrome only ever needs to change in this one place.
 *
 * Two children, in this order: a scrolling content area and an optional
 * footer pinned to the card's bottom edge. The scroller is what
 * `ManualCard`'s `findScroller` walks up to when a drag starts on a tall
 * card, so it has to stay a real `overflow-y: auto` box (`.deck-card-scroll`)
 * — and the footer has to stay *outside* it, or the nav scrolls away with
 * the questions.
 */
function CardShell({ children, footer }: { children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="deck-card">
      <div className="deck-card-body">
        <div className="deck-card-scroll">{children}</div>
      </div>
      {footer}
    </div>
  );
}

/**
 * A card in the stack that isn't the live one. Deliberately empty: the two
 * cards peeking behind carry the "there's more, and it swipes" message on
 * their own, and rendering their real questions back there put a second
 * readable question on screen behind the one being answered. Also keeps the
 * photo uploader from mounting three cards deep.
 *
 * The real page renders the moment this card reaches depth 0, which is the
 * same instant the user asked for it.
 */
function StackGhost({ depth }: { depth: number }) {
  return <div className="deck-ghost" data-depth={depth} aria-hidden />;
}

function MobilePage({
  fields,
  forSelf,
  footer,
}: {
  fields: ProfileFieldDef[];
  forSelf: boolean;
  footer?: React.ReactNode;
}) {
  return (
    <CardShell footer={footer}>
      {/* `m-auto` (not `justify-center` on this parent) so content centres
          vertically when it's short but still scrolls from a natural top
          edge — rather than clipping symmetrically — on the rare group
          that's taller than the frame. */}
      <div className="m-auto w-full">
        {fields.map((f, i) => (
          <Fragment key={f.key}>
            {i > 0 && (
              <div className="deck-divider" aria-hidden>
                <Ornament className="h-3 w-6 shrink-0" />
              </div>
            )}
            <CompactField field={f} forSelf={forSelf} />
          </Fragment>
        ))}
      </div>
    </CardShell>
  );
}

/**
 * The card's own bottom strip — swipe hint on the left of the blush band,
 * the round Next on the right.
 *
 * It used to be a floating row docked to the deck *below* the card, which
 * read as app chrome rather than as part of the thing being swiped. Inside
 * the card it belongs to the question, and it costs the deck nothing: the
 * padding the floating row needed under the card is exactly what the card
 * grew by.
 *
 * Both buttons keep the arrangement the floating row settled on (Back left,
 * Next right, chevrons pointing where the button takes you) rather than
 * pointing the way you *swipe* — the same thing every carousel does, and the
 * gesture still moves the card the other way. A drag that starts on this
 * strip drags the card, exactly like one starting on a question: the strip
 * is inside the draggable card and nothing here stops propagation, while
 * `ManualCard` only swallows the click a gesture synthesises once it has
 * travelled far enough to be a real swipe.
 */
function DeckFooter({
  index,
  total,
  onPrev,
  onNext,
}: {
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  const t = useT();
  return (
    <div className="deck-footer">
      <button
        type="button"
        onClick={onPrev}
        disabled={index === 0}
        aria-label={t("profile.manualProfileFormMobile.backAriaLabel", "Back")}
        className="deck-back touch-target"
      >
        <ChevronLeft className="size-4" aria-hidden />
        {t("profile.manualProfileFormMobile.back", "Back")}
      </button>

      {/* The gesture is still the primary way through the deck — the
          one-time coach retires, so this is what's left saying "you can
          also just swipe". */}
      <span className="deck-hint">
        <Hand className="size-4 shrink-0" aria-hidden />
      </span>

      <button
        type="button"
        onClick={onNext}
        disabled={index >= total}
        aria-label={t("profile.manualProfileFormMobile.nextAriaLabel", "Next")}
        className="deck-next"
      >
        <ArrowRight className="size-5" aria-hidden />
      </button>
    </div>
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
  scopeLabel,
  gate,
  onDone,
}: {
  live: boolean;
  missingReq: ProfileFieldDef[];
  onJump: (key: string) => void;
  onPrev: () => void;
  /** Set when the deck covered one category — changes what "finished" means. */
  scopeLabel?: string | null;
  /** The first-run gate deck (see the `gate` prop on the component below). */
  gate?: boolean;
  /** Leaves the deck. On a scoped run this is the primary action, because the
   *  natural next move is picking another category, not staying here. */
  onDone: () => void;
}) {
  const t = useT();
  /**
   * The gate deck carries a `scopeLabel` too (its header says "Zaroori
   * baatein · 4/7"), but it must not get the *scoped* ending — "section ho
   * gaya, wapas jaakar agla chunein" is the one thing this deck never means.
   * Finishing it is either "your profile is live now" or "these required
   * fields are still empty", so it routes through the live/not-live copy.
   */
  const section = Boolean(scopeLabel) && !gate;
  return (
    /* Same shell as every other card (`.deck-card`), but its own scroller —
       it has no footer strip, because finishing the deck is what its own
       buttons below are for. */
    <div className="deck-card">
      <div className="deck-card-body">
        <div className="deck-card-scroll flex-col items-center justify-center text-center">
          <div
            className={cn(
              "w-full max-w-sm rounded-2xl border px-5 py-8",
              live || section ? "border-trust/25 bg-trust-bg" : "border-line bg-bg-subtle",
            )}
          >
            {live || section ? (
              <BadgeCheck className="mx-auto size-10 text-trust" />
            ) : (
              <Sparkles className="mx-auto size-10 text-primary-text" />
            )}
            <h1 className="deck-question mt-3">
              {section
                ? t("profile.manualProfileFormMobile.completionTitleScoped", "{section} ho gaya").replace(
                    "{section}",
                    scopeLabel!,
                  )
                : live
                  ? gate
                    ? t("profile.manualProfileFormMobile.completionTitleGateLive", "Aapki profile ab live hai")
                    : t("profile.manualProfileFormMobile.completionTitleLive", "Sab fields dekh liye")
                  : t("profile.manualProfileFormMobile.completionTitleNotLive", "Bas thoda aur baaki hai")}
            </h1>
            <p className="mx-auto mt-2 max-w-md text-pretty leading-relaxed text-muted">
              {section
                ? t(
                    "profile.manualProfileFormMobile.completionDescriptionScoped",
                    "Save ho gaya. Wapas jaakar agla section chun sakte hain.",
                  )
                : live
                  ? gate
                    ? t(
                        "profile.manualProfileFormMobile.completionDescriptionGateLive",
                        "Zaroori baatein poori ho gayin. Baaki details aur photo jab chahein tab add kar sakte hain — profile abhi bhi live rahegi.",
                      )
                    : t(
                        "profile.manualProfileFormMobile.completionDescriptionLive",
                        "Jo bhi bhar diya wo save ho chuka hai — baaki jab chaho tab bhar sakte hain.",
                      )
                  : t(
                      "profile.manualProfileFormMobile.completionDescriptionNotLive",
                      "{count} zaroori fields abhi khaali hain — profile live karne ke liye ye bharne honge.",
                    ).replace("{count}", String(missingReq.length))}
            </p>
          </div>
  
          {missingReq.length > 0 && (
            <div className="mt-5 flex flex-wrap items-center justify-center gap-1.5">
              <span className="text-[0.8125rem] text-warn">{t("profile.manualProfileFormMobile.remainingLabel", "Baaki:")}</span>
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
            {/* A required field still empty outranks everything — even on a scoped
                deck, where finishing the section is otherwise the whole goal. */}
            {missingReq.length > 0 ? (
              <Button onClick={() => onJump(missingReq[0].key)}>
                {t("profile.manualProfileFormMobile.fillRequiredFields", "Fill Required Fields")}
              </Button>
            ) : section ? (
              <Button onClick={onDone}>
                {t("profile.manualProfileFormMobile.backToList", "Back to List")}
              </Button>
            ) : gate ? (
              /* Not a dashboard link like the full-catalog ending below: closing
                 the gate deck is what hands the user back to `InterviewMode`,
                 which owes them the going-live celebration (and the one-shot
                 mindset flow) before any dashboard. */
              <Button onClick={onDone}>
                {t("profile.manualProfileFormMobile.continue", "Continue")}
              </Button>
            ) : live ? (
              <Link
                href="/user/dashboard"
                className={cn(
                  "inline-flex h-12 items-center justify-center gap-2 rounded-full px-6 text-[0.9375rem] font-semibold",
                  "bg-primary text-primary-fg shadow-md transition-all duration-200",
                  "hover:-translate-y-0.5 hover:bg-primary-hover hover:shadow-gold",
                )}
              >
                {t("profile.manualProfileFormMobile.viewDashboard", "View Dashboard")}
              </Link>
            ) : null}
            <Button variant="secondary" onClick={onPrev}>
              <ArrowLeft className="size-4" />
              {t("profile.manualProfileFormMobile.goBack", "Go Back")}
            </Button>
          </div>
        </div>
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
 * lives out its six seconds. Its offset clears the card's own footer strip
 * (`DeckFooter`) — the coach explains the gesture, so it must not sit on top
 * of the buttons that are the alternative to it.
 *
 * `bg-surface-inverse` / `text-inverse` is the same pairing `GrioBubble`'s
 * first-run tooltip uses — the app's one "this is a coach mark, not chrome"
 * look. Inside the deck those two tokens resolve to the light island's own
 * dark/ivory pair (globals.css), so it stays a legible dark tooltip on the
 * ivory card in both themes.
 */
function SwipeCoach() {
  const t = useT();
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={ease.fast}
      className="pointer-events-none absolute inset-x-0 bottom-[calc(6rem+env(safe-area-inset-bottom,0px))] z-20 flex justify-center px-8"
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
          {t(
            "profile.manualProfileFormMobile.swipeCoachTextBefore",
            "Card ko",
          )}{" "}
          <span className="font-semibold">{t("profile.manualProfileFormMobile.swipeCoachLeftSwipe", "left swipe")}</span>{" "}
          {t("profile.manualProfileFormMobile.swipeCoachTextMiddle", "karein — agla sawaal. Peeche jaana ho to")}{" "}
          <span className="font-semibold">{t("profile.manualProfileFormMobile.swipeCoachRightSwipe", "right swipe")}</span>.
        </p>
      </div>
    </motion.div>
  );
}

/**
 * The manual (no-AI) profile form — a full-screen, Tinder-style swipe deck:
 * one ivory card at a time, two blank ones peeking behind it, drag left for
 * the next field / drag right for the previous one. No page scroll, no
 * auto-advance — every transition is a deliberate swipe (or the equivalent
 * ArrowLeft/ArrowRight keys, or the buttons in the card's own footer).
 *
 * Three parts, top to bottom: a header (close button, the scope's name, a
 * progress bar and card count), the card stack, and — inside whichever card
 * is on top — the footer strip carrying Back/Next. The nav used to float on
 * the deck *under* the card; it moved into the card on 2026-08-26 so the
 * whole screen reads as one object being swiped rather than a card sitting
 * in an app frame.
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
  only,
  pendingOnly = false,
  scopeLabel,
  gate = false,
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
  /**
   * Restrict the deck to these field keys — how one category ("Partner ki
   * ummeed") becomes nine cards instead of thirty-nine. Omitted means the
   * whole catalog, which is what the first-run onboarding still wants.
   */
  only?: readonly string[] | null;
  /** Drop anything already answered. See `selectDeckFields` for why this is
   *  resolved once at mount and never recomputed. */
  pendingOnly?: boolean;
  /** Shown in the top bar so a scoped deck says what it covers. */
  scopeLabel?: string | null;
  /**
   * First-run gate deck — the eight fields that make a profile live, plus the
   * optional photo (`GATE_DECK_KEYS`, stages.ts). Purely about what *finishing*
   * means: the caller still passes the field set through `only`, and this flag
   * only tells the ending card not to say "section done, pick the next one".
   */
  gate?: boolean;
}) {
  const t = useT();
  const { draft, live } = useProfile();
  const LEAD = leadCard ? 1 : 0;

  // Frozen at mount — the lazy initialiser runs exactly once, which is what
  // makes `pendingOnly` safe to combine with editing (see `selectDeckFields`).
  const [pages] = useState<ProfileFieldDef[][]>(() =>
    buildPages(
      selectDeckFields(draft.values, { only, pendingOnly, focusKey: initialFocusKey }),
    ),
  );
  const total = pages.length + LEAD;

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
    const i = pages.findIndex((g) => g.some((f) => f.key === key));
    return i < 0 ? -1 : i + LEAD;
  }

  const [index, setIndex] = useState(() => {
    const i = initialFocusKey ? pageIndexForKey(initialFocusKey) : -1;
    return i >= 0 ? i : 0;
  });

  const forSelf = draft.fillingFor === "self";
  // Narrowed to this deck: every chip on the completion card is a `jumpTo`,
  // and `jumpTo` can only reach a page that exists here. On a scoped deck the
  // unfiltered list would render chips that silently do nothing when tapped.
  const deckKeys = new Set(pages.flat().map((f) => f.key));
  const missingReq = missingRequired(draft.values).filter((f) => deckKeys.has(f.key));

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
      // A caret inside a field owns the arrow keys, full stop. This listener
      // is on `window`, so without the guard the deck read a plain "move the
      // cursor back one letter" as "previous card" *and* preventDefault'd it
      // — the caret never moved and the card jumped instead. Reported on the
      // Current City card (2026-08-07), which is the deck's main type-a-word
      // card, but it hit every text/date field the same way.
      if (isEditableTarget(e.target)) return;
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

  const shown = Math.min(index + 1, total);

  // Built once and handed to whichever card is on top — every card in the
  // deck shows the same strip, and only the top one is ever rendered with it
  // (everything behind is a `StackGhost`).
  const footer = <DeckFooter index={index} total={total} onPrev={goPrev} onNext={goNext} />;

  return createPortal(
    <div className="deck deck-canvas fixed inset-0 z-40 flex h-[100dvh] w-full flex-col overflow-hidden">
      {/* A real block in the column, not an overlay floating on the cards.
          The old header was absolutely positioned (the deck was one flat
          colour, so anything over it looked docked) and the deck below it
          paid for that with hand-tuned top padding in two sizes. With a
          title in it, the header has to reserve its own height or a small
          phone puts the ornament on top of the first question. */}
      <header className="relative z-10 mx-auto w-full max-w-[430px] shrink-0 px-5 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] sm:max-w-[560px]">
        {/* The title owns the full width — the close button rides the
            progress row below instead of sitting beside it. Sharing the row
            cost the title ~90px, which at 320px was enough to fold "Partner
            ki ummeed" onto two lines and make the whole header read small. */}
        <div className="text-center">
          <Ornament className="deck-ornament mx-auto h-3 w-6" />
          {/* Only a scoped deck has a name to print. The bar alone says
              "some progress"; with nine cards instead of the whole catalog
              behind it, saying which nine — and how far in — is the
              difference between a deck that feels finishable and one that
              feels endless. */}
          {scopeLabel && <h1 className="deck-title mt-1">{scopeLabel}</h1>}
        </div>

        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              haptic("tap");
              onBack();
            }}
            aria-label={t("profile.manualProfileFormMobile.closeAriaLabel", "Close")}
            className="deck-close size-9 shrink-0 touch-target"
          >
            <X className="size-5" />
          </button>

          <div
            className="deck-progress flex-1"
            role="progressbar"
            aria-valuenow={shown}
            aria-valuemin={1}
            aria-valuemax={total}
          >
            <div className="deck-progress-fill" style={{ width: `${(shown / total) * 100}%` }} />
          </div>
          <span className="deck-progress-count" aria-hidden>
            {shown}/{total}
          </span>
        </div>
      </header>

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
      {/* The stack sits a little inside the header's own gutter (`px-5`),
          which is also what leaves the two peeking cards room to fan out to
          the right without touching the screen edge — and the bottom padding
          is the same allowance underneath, so their bottom edges peek below
          the live card instead of being clipped off the screen. The Back/Next
          row that used to float here moved inside the card (`DeckFooter`). */}
      <div className="relative mx-auto w-full max-w-[430px] flex-1 px-8 pb-[calc(2rem+env(safe-area-inset-bottom,0px))] pt-4 sm:max-w-[560px]">
        <div className="relative h-full w-full">
          <AnimatePresence initial={false}>
            {[...visibleIndices].reverse().map((i, pos) => {
              const depth = visibleIndices.length - 1 - pos;
              let content: React.ReactNode;
              if (depth > 0) {
                // Everything behind the live card is a blank card — see
                // `StackGhost`.
                content = <StackGhost depth={depth} />;
              } else if (leadCard && i === 0) {
                content = <CardShell footer={footer}>{leadCard(goNext)}</CardShell>;
              } else {
                const page = i - LEAD < pages.length ? pages[i - LEAD] : null;
                content = page ? (
                  <MobilePage fields={page} forSelf={forSelf} footer={footer} />
                ) : (
                  <CompletionCard
                    live={live}
                    missingReq={missingReq}
                    onJump={jumpTo}
                    onPrev={goPrev}
                    scopeLabel={scopeLabel}
                    gate={gate}
                    onDone={onBack}
                  />
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

    </div>,
    document.body,
  );
}
