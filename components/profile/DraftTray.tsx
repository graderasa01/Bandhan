"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CheckCircle2, ChevronUp, Sparkles, X } from "lucide-react";
import { FIELD_BY_KEY } from "@/lib/profile/fields";
import { useProfile } from "@/lib/profile/profileState";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/motion";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * Everything understood so far, as chips.
 *
 * This is the screen's reward loop: a value the AI just picked out of a spoken
 * sentence lands here with a small pop, so "arre, isne samajh liya" is
 * something the user *sees* rather than has to go looking for. A flat list at
 * the bottom of a long page does not do that.
 *
 * On phones it is a sticky tray so it stays visible while speaking; on large
 * screens it lives in the side panel next to the question.
 */

/** A glanceable marker per field. Presentation only — data stays in the catalog. */
const EMOJI: Record<string, string> = {
  fullName: "🙏",
  gender: "🧑",
  dateOfBirth: "🎂",
  height: "📏",
  currentCity: "📍",
  maritalStatus: "💍",
  education: "🎓",
  profession: "💼",
  motherTongue: "🗣️",
  religion: "🕉️",
  caste: "🪔",
  gotra: "🪔",
  manglikStatus: "✨",
  birthTime: "🕰️",
  birthPlace: "🌅",
  nativePlace: "🏡",
  diet: "🍽️",
  familyType: "👨‍👩‍👧",
  fatherOccupation: "👨",
  motherOccupation: "👩",
  siblings: "👧",
  siblingsMarried: "💐",
  annualIncome: "💰",
  workLocation: "🏢",
  partnerAgeRange: "🎯",
  partnerCityPreference: "🗺️",
  partnerEducation: "📚",
  partnerWorking: "👩‍💻",
  aboutMe: "📝",
  hobbies: "🎨",
  languagesKnown: "🌐",
  familyValues: "🏛️",
  relocateWilling: "✈️",
  dealBreakers: "🚫",
  smoking: "🚭",
  drinking: "🍷",
};

function Chip({
  fieldKey,
  value,
  isNew,
  unsure,
  inferred,
  onEdit,
  onClear,
}: {
  fieldKey: string;
  value: string;
  isNew: boolean;
  unsure: boolean;
  inferred: boolean;
  onEdit: (key: string) => void;
  onClear: (key: string) => void;
}) {
  const t = useT();
  const reduced = useReducedMotion();
  const def = FIELD_BY_KEY[fieldKey];

  /**
   * The glow is a moment, not a state.
   *
   * `isNew` stays true for the whole turn — it is the "landed this turn" set,
   * and it only clears on the next submit. A pulse tied straight to it would
   * still be going while the user reads the next question, at which point it
   * has stopped meaning "this one just arrived". So arrival starts its own
   * short timer instead.
   */
  const [glow, setGlow] = useState(isNew);
  useEffect(() => {
    if (!isNew) return;
    setGlow(true);
    const t = setTimeout(() => setGlow(false), 1500);
    return () => clearTimeout(t);
  }, [isNew]);

  if (!def) return null;

  return (
    <motion.li
      layout={!reduced}
      // The pop. Deliberately springy and only on arrival — this is the moment
      // the AI proves it understood, and it should feel like something landed.
      // Low damping on purpose: the chip overshoots a touch and settles, which
      // is the difference between "appeared" and "landed".
      initial={reduced ? false : { scale: 0.55, opacity: 0, y: 18 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      transition={
        reduced ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 18, mass: 0.7 }
      }
      className={cn(
        "group relative flex items-center gap-1.5 rounded-full border py-1 pl-2.5 pr-1",
        "shadow-xs backdrop-blur-sm transition-colors",
        unsure
          ? "border-warn/40 bg-warn-bg/80"
          : inferred
            ? "border-info/30 bg-info-bg/80"
            : isNew
              // Gold, not the journey's coral — this is the "AI got it right"
              // cue, and gold is already this product's colour for that
              // (the `ai-action` button, the mic). Reusing it here instead of
              // introducing a third accent is what keeps it reading as one
              // system rather than one more colour to learn.
              ? "border-gold-300 bg-gold-50/90 dark:border-gold-400/40 dark:bg-gold-900/30"
              : "border-line bg-surface/85",
        // Coral-and-gold breath, once. Reduced-motion users get the colour
        // change above and nothing that moves.
        glow && !reduced && "animate-jadu",
      )}
    >
      {/* A single ring expanding out of the chip as it lands — the "jadu" part.
          An outline rather than a fill, so it never tints the label it is
          celebrating, and pointer-events-none so it cannot eat a tap. */}
      <AnimatePresence>
        {glow && !reduced && (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full border-2 border-gold-400/80"
            initial={{ scale: 0.92, opacity: 0.9 }}
            animate={{ scale: 1.4, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
          />
        )}
      </AnimatePresence>

      {/* "Got it, exactly." One green tick, one beat, gone — the confirmation
          a person glances for after speaking, not a permanent badge. */}
      <AnimatePresence>
        {glow && (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-trust text-white shadow-sm"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={reduced ? { duration: 0.15 } : { type: "spring", stiffness: 500, damping: 20 }}
          >
            <CheckCircle2 className="size-3" strokeWidth={3} />
          </motion.span>
        )}
      </AnimatePresence>

      <button
        type="button"
        onClick={() => {
          haptic("tap");
          onEdit(fieldKey);
        }}
        className="flex min-h-11 touch-target items-center gap-1.5 text-left"
        aria-label={`${def.label} ${t("profile.draftTray.editSuffix", "badlein")}`}
      >
        <span aria-hidden className="text-[0.875rem] leading-none">
          {EMOJI[fieldKey] ?? "•"}
        </span>
        <span className="min-w-0">
          <span className="block text-[0.625rem] uppercase leading-none tracking-wider text-subtle">
            {def.label}
          </span>
          <span className="mt-0.5 block max-w-[9rem] truncate text-[0.8125rem] font-medium leading-tight text-ink sm:max-w-[12rem]">
            {value}
          </span>
        </span>
      </button>

      <button
        type="button"
        onClick={() => {
          haptic("tap");
          onClear(fieldKey);
        }}
        aria-label={`${def.label} ${t("profile.draftTray.removeSuffix", "hata dijiye")}`}
        className={cn(
          // Visually small so the chip stays a chip; `touch-target` gives it the
          // 48px hit area D-23 requires via a pseudo-element.
          "grid size-8 shrink-0 touch-target place-items-center rounded-full text-subtle",
          "transition-colors hover:bg-danger/10 hover:text-danger",
        )}
      >
        <X className="size-3" strokeWidth={2.5} />
      </button>
    </motion.li>
  );
}

function ChipList({
  rows,
  highlight,
  onEdit,
  onClear,
}: {
  rows: { key: string; value: string; unsure: boolean; inferred: boolean }[];
  highlight: string[];
  onEdit: (key: string) => void;
  onClear: (key: string) => void;
}) {
  /**
   * This turn's captures first.
   *
   * The tray is a single visible row until it is expanded, so a chip that
   * lands at position nine pops where nobody can see it — and the pop is the
   * whole point of the tray. Sorting the new ones to the front means the
   * animation always happens in view. `layout` on each chip turns the reorder
   * into the older chips politely making room, which reads as the same event.
   */
  const ordered = [...rows].sort(
    (a, b) => Number(highlight.includes(b.key)) - Number(highlight.includes(a.key)),
  );

  return (
    <ul className="flex flex-wrap gap-1.5">
      {/* No exit animation on purpose: a chip should vanish the instant it is
          dismissed, and `layout` already smooths the reflow. */}
      <AnimatePresence initial={false}>
        {ordered.map((r) => (
          <Chip
            key={r.key}
            fieldKey={r.key}
            value={r.value}
            isNew={highlight.includes(r.key)}
            unsure={r.unsure}
            inferred={r.inferred}
            onEdit={onEdit}
            onClear={onClear}
          />
        ))}
      </AnimatePresence>
    </ul>
  );
}

function useRows() {
  const { draft } = useProfile();
  return Object.entries(draft.values)
    .filter(([, v]) => v && v.trim().length > 0)
    .filter(([k]) => FIELD_BY_KEY[k])
    .map(([key, value]) => ({
      key,
      value,
      unsure: draft.meta[key]?.confirmed === false,
      inferred: draft.meta[key]?.source === "inferred",
    }));
}

/** Phones: sticky above the fold-bottom so it is visible while speaking. */
export function DraftTrayMobile({
  highlight,
  onEdit,
  sticky = true,
}: {
  highlight: string[];
  onEdit: (key: string) => void;
  /** False on screens with nothing left below to float over (e.g. "live"). */
  sticky?: boolean;
}) {
  const t = useT();
  const { clearField } = useProfile();
  const rows = useRows();
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion();

  if (rows.length === 0) return null;
  const unsureCount = rows.filter((r) => r.unsure).length;

  return (
    <motion.div
      // The tray itself arrives once, the moment the first detail lands — a
      // slide up from the bottom edge it is about to live on.
      initial={reduced ? false : { y: "100%", opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 380, damping: 32 }}
      className={cn("-mx-4 mt-8 sm:-mx-6 lg:hidden", sticky && "sticky bottom-0 z-20")}
    >
      <div className="border-t border-line bg-bg/90 px-4 pb-safe pt-2 backdrop-blur-xl sm:px-6">
        {/* Styled as a real button — border, fill, hover state — not a bare
            text row, so it reads as something to tap rather than a caption. */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex min-h-12 w-full items-center gap-2 rounded-full border border-line-strong bg-surface px-4 text-left shadow-xs transition-colors hover:border-gold-500 hover:bg-gold-50 dark:hover:bg-gold-900/40"
        >
          <Sparkles className="size-3.5 shrink-0 text-primary-text" />
          <span className="flex-1 text-[0.75rem] font-semibold uppercase tracking-wider text-ink">
            {rows.length} {t("profile.draftTray.detailsFound", "Details Mil Gayi")}
            {unsureCount > 0 && (
              <span className="text-warn">
                {" "}
                · {unsureCount} {t("profile.draftTray.reviewThese", "dekh lijiye")}
              </span>
            )}
          </span>
          <ChevronUp
            className={cn(
              "size-4 shrink-0 text-muted transition-transform duration-200",
              open && "rotate-180",
            )}
          />
        </button>

        {/* Collapsed shows nothing below the summary row — a sliver of the
            first row of chips, clipped mid-height, read as broken rather than
            collapsed. Either the full list is open, or none of it is. */}
        <div
          className={cn(
            "overflow-y-auto transition-[max-height,opacity] duration-300",
            open ? "max-h-[45dvh] pb-2 pt-2 opacity-100" : "max-h-0 opacity-0",
          )}
        >
          <ChipList rows={rows} highlight={highlight} onEdit={onEdit} onClear={clearField} />
        </div>
      </div>
    </motion.div>
  );
}
