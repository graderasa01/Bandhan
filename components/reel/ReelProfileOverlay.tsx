"use client";

import { BadgeCheck, Briefcase, GraduationCap, MapPin } from "lucide-react";
import type { ReelCardViewModel } from "@/lib/contracts/reel";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * Who this is, over their own photograph.
 *
 * Everything here is a field the person filled in themselves. Nothing is
 * derived, nothing is phrased by a model, and every line disappears when its
 * field is empty rather than rendering a dash or an "N/A" — a profile that has
 * not said where it works should read as a shorter card, not a broken one.
 *
 * ## The chips
 *
 * Two kinds, drawn differently because they are two different claims:
 *
 *   • shared — a `sharedTag`, i.e. something the code compared between *you
 *     two* ("Same city: Jaipur"). Deterministic overlap, never AI (D-32).
 *     Marked by a gold dot and a gold micro-label, on the same dark glass as
 *     everything else on the card.
 *   • plain — one of this person's own L1 facts, taken straight from
 *     `buildCandidateFacts`, which is the single source for "what may be shown
 *     about somebody else" and has already dropped anything they kept private.
 *
 * The shared chip used to be a near-opaque cream pill with gold-700 text, and
 * over a photograph it was the worst of both: bright enough to compete with the
 * face it sits on, and dark-gold-on-cream at 12px, which is the lowest contrast
 * pairing in the palette (Devesh, 2026-09-21 — "achha dikhe"). Both chips are
 * now the reel's own frosted glass, and the gold survives where the app puts
 * gold everywhere else: as a detail on a dark ground, never as a fill.
 *
 * The values are printed as they are stored, the same way the details sheet
 * prints them, so a chip can never say something the profile does not.
 */

/**
 * The facts whose *value* is a readable chip on its own, in the order a
 * stranger would find them useful.
 *
 * This is an allow-list rather than "every lifestyle fact" because most L1
 * values only mean something next to their label. `buildCandidateFacts` pushes
 * `{ label: "Smoking", value: "Nahi" }`, and a chip reading "Nahi" over
 * somebody's photograph says nothing at all — it was on the first build of this
 * overlay and it was the one thing on the card a reader could not decode.
 * "Vegetarian", "Joint family", "Reading" need no label.
 *
 * The keys are the exact labels `candidateFacts.ts` writes. That is a coupling,
 * and a deliberate one: it is the same file `SHEET_FACT_GROUPS` already couples
 * to, and going through it is what keeps a chip from ever showing a field the
 * person kept private.
 */
const CHIP_FACT_LABELS = ["Shauk", "Khaan-paan", "Parivaar ka prakar", "Bhashayein"] as const;

/** A fact's value may be a list ("Reading, Music") — a chip takes the first. */
function firstValue(value: string): string {
  const head = value.split(",")[0]?.trim();
  return head && head.length <= 22 ? head : value.trim().slice(0, 22);
}

export interface ProfileChip {
  /** The value — the word that actually means something on its own. */
  text: string;
  /** "Same city", "Common hobby" — the field, when the tag names one. */
  label?: string;
  shared: boolean;
}

/**
 * "Common hobby: Padhna" → label + value, so the chip can print the field
 * small and warm and the answer big and white.
 *
 * Read off the tag rather than passed down from `computeSharedTags`, because
 * the tag is already translated by the time it reaches a card and re-deriving
 * the pair server-side would mean shipping both halves through the view model
 * for a typographic choice. Only the three shapes that function can produce
 * exist here, and one of them ("Dono Veg") has no field to name — it comes
 * back label-less and reads as one phrase, which is what it is.
 */
function splitTag(tag: string): { text: string; label?: string } {
  const at = tag.indexOf(": ");
  if (at <= 0) return { text: tag };
  return { label: tag.slice(0, at), text: tag.slice(at + 2) };
}

/**
 * Up to three chips for this person, built from data already on the card.
 *
 * Exported so the same rule can be read (and tested) without mounting the
 * component — and so nothing else in the reel invents a second answer to
 * "what are this person's chips".
 */
export function profileChips(card: ReelCardViewModel, limit = 3): ProfileChip[] {
  const chips: ProfileChip[] = [];

  // The pair's own overlap leads: it is the only chip that says something
  // about the reader as well as the person.
  for (const tag of card.sharedTags) chips.push({ ...splitTag(tag), shared: true });

  // Their published mindset badge — deterministic, from their own poll answers.
  if (card.vibeBadge) chips.push({ text: card.vibeBadge.label, shared: false });

  for (const label of CHIP_FACT_LABELS) {
    const fact = card.facts.find((f) => f.label === label);
    if (!fact) continue;
    const text = firstValue(fact.value);
    if (!text) continue;
    if (chips.some((c) => c.text.toLowerCase() === text.toLowerCase())) continue;
    chips.push({ text, shared: false });
  }

  return chips.slice(0, limit);
}

export default function ReelProfileOverlay({ card }: { card: ReelCardViewModel }) {
  const t = useT();
  const chips = profileChips(card);

  const META: { icon: typeof MapPin; value: string | null }[] = [
    { icon: MapPin, value: card.city },
    { icon: GraduationCap, value: card.education },
    { icon: Briefcase, value: card.profession },
  ];

  // The text shadow is a real one, not decoration: this text lands on whatever
  // the photograph happens to be, and the bottom scrim alone is not enough over
  // a bright sari or a sunlit wall.
  return (
    // Width-capped so the name, the meta lines and the chips all stop short of
    // the utility rail on the right — the rail shares this vertical band by
    // design (see ReelCard), and a full-width name would run underneath it.
    <div className="max-w-[14.5rem] text-white [text-shadow:0_1px_3px_rgb(0_0_0_/_0.55),0_2px_16px_rgb(0_0_0_/_0.5)] min-[400px]:max-w-[17rem]">
      {/* `text-white` is repeated here rather than inherited from the wrapper:
          `@layer base` sets `h1,h2,h3 { color: var(--color-ink) }` directly on
          the element, and a direct rule beats an inherited one however the
          parent is coloured — which rendered the name in near-black over the
          photograph. A utility on the element itself wins, because Tailwind's
          utilities layer sits above base. */}
      <h2 className="flex items-center gap-1.5 font-[family-name:var(--font-display)] text-[1.75rem] font-bold leading-none text-white">
        <span className="min-w-0 truncate">
          {card.displayName}
          {card.age ? `, ${card.age}` : ""}
        </span>
        {card.verified && (
          <>
            <BadgeCheck className="size-5 shrink-0 fill-trust text-white" aria-hidden />
            <span className="sr-only">{t("reel.trustStrip.photoVerified", "Photo Verified")}</span>
          </>
        )}
      </h2>

      {META.some((m) => m.value) && (
        <ul className="mt-2 space-y-[3px]">
          {META.map(({ icon: Icon, value }) =>
            value ? (
              <li key={value} className="flex items-center gap-1.5 text-[0.875rem] font-medium leading-tight text-white">
                <Icon className="size-[15px] shrink-0 text-white/85" aria-hidden />
                <span className="min-w-0 truncate">{value}</span>
              </li>
            ) : null,
          )}
        </ul>
      )}

      {/* Their own words. Two lines on the card; the rest is one tap away in
          More Details, so nothing they wrote is lost, only deferred. */}
      {card.bioNote && (
        <p className="mt-2 line-clamp-2 text-[0.875rem] leading-snug text-white/95">{card.bioNote}</p>
      )}

      {chips.length > 0 && (
        <ul className="mt-2.5 flex flex-wrap gap-1.5">
          {chips.map((chip) => {
            // "Jaipur" twice on one card — once on the location line, again as
            // the value of "Same city" two rows below it. The chip's news is
            // the *sameness*, not the place, so where the card has already
            // printed the place the label carries the chip alone. Only when
            // the value is genuinely this word: a chip that named nothing
            // would be worse than the repetition it avoids.
            const echoesMeta = Boolean(
              chip.label && card.city && chip.text.trim().toLowerCase() === card.city.trim().toLowerCase(),
            );
            return (
            <li
              key={chip.text}
              className={cn(
                // One geometry for both kinds, so the row reads as a set rather
                // than as two things that happen to be next to each other.
                // `text-shadow:none` because each pill carries its own ground —
                // the wrapper's shadow is for text lying directly on the photo,
                // and at 10px it only smears.
                "inline-flex items-center gap-1.5 rounded-full py-[5px] pr-2.5 backdrop-blur-md",
                "shadow-[0_6px_18px_-8px_rgb(0_0_0_/_0.65)] [text-shadow:none]",
                chip.shared
                  ? "bg-black/45 pl-2 ring-1 ring-gold-300/45"
                  : "bg-black/40 pl-2.5 ring-1 ring-white/20",
              )}
            >
              {/* The whole "this is about you two" signal, in four pixels of
                  gold. It replaced a cream fill that said the same thing by
                  shouting — and a dot costs the photograph nothing. */}
              {chip.shared && (
                <span
                  aria-hidden
                  className="size-1 shrink-0 rounded-full bg-gold-400 shadow-[0_0_5px_rgb(221_172_81_/_0.9)]"
                />
              )}
              {chip.label && (
                <span
                  className={cn(
                    "font-semibold uppercase leading-none tracking-[0.06em] text-gold-300/90",
                    // Alone in the pill it is the chip, not a caption over one.
                    echoesMeta ? "text-[0.6875rem]" : "text-[0.625rem]",
                  )}
                >
                  {chip.label}
                </span>
              )}
              {!echoesMeta && <span className="text-[0.75rem] font-semibold leading-none text-white">{chip.text}</span>}
              {chip.shared && <span className="sr-only">{t("reel.overlay.sharedChip", "— aap dono me common")}</span>}
            </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
