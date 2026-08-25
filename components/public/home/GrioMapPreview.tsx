"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import {
  CalendarCheck,
  Heart,
  HouseHeart,
  Lock,
  ShieldCheck,
  Telescope,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * The Samajh Map, as a stranger is allowed to see it.
 *
 * ## Why not just render the real one
 *
 * `components/profile/GrioSamajhMap` is ~1000 lines and every bubble on it is
 * *this user's own rows* — a percent, a count, a reason built from their data.
 * There is no signed-out version of that, and inventing one would be the exact
 * failure the real map's header warns about: a confident explanation of state
 * that isn't true. So this is a second, deliberately smaller thing — the map's
 * **shape**, with none of its readings.
 *
 * ## What makes it honest
 *
 * Every string below is a `grioMap.*` key — the same keys `samajhMap.ts` builds
 * the real map from, resolving through the same dictionary. The branch names,
 * the four features under each, and the sentence describing what a branch does
 * are not marketing copy written next to a screenshot: they are the product's
 * own words, so this cannot drift from the thing it is advertising. Only the
 * `does` line is quoted, never `note`/`value`/`why`, because those three are
 * the user-state fields and a signed-out visitor has no state to state.
 *
 * ## What it refuses to do
 *
 * Nothing here navigates into the app. No bubble is a link, no fetch is made,
 * no session is read. It shows and it explains; the single way forward is the
 * login CTA underneath. That is the whole brief — "jaankari de sakta hai, open
 * nahi karega" — and it is also why this component is safe to prerender.
 */

type PreviewBranch = {
  id: string;
  icon: LucideIcon;
  /** Position on the orbit, as a percentage of the canvas box. */
  x: number;
  y: number;
  labelKey: string;
  labelFallback: string;
  shortKey: string;
  shortFallback: string;
  /** One real `does` line from this branch's flagship node. */
  doesKey: string;
  doesFallback: string;
  /** The branch's real nodes, by their under-a-bubble `short` names. */
  nodes: { key: string; fallback: string }[];
};

/*
 * Six branches, evenly spaced on a circle centred at (50, 42) with a radius of
 * 30. Percentages rather than pixels so the same numbers hold from a 340px
 * phone to a 900px card — the canvas is an aspect-ratio box, so a percentage
 * is the only unit that scales with both axes at once.
 *
 * The centre sits at 42 rather than 50 because a bubble carries its label
 * *below* it: the top bubble is positioned by its middle, so a symmetric orbit
 * would clip its icon on the canvas edge while leaving a band of dead space
 * under the bottom one.
 */
const BRANCHES: PreviewBranch[] = [
  {
    id: "today",
    icon: CalendarCheck,
    x: 50,
    y: 14,
    labelKey: "grioMap.branch.today.label",
    labelFallback: "Aaj ka din",
    shortKey: "grioMap.branch.today.short",
    shortFallback: "Aaj",
    doesKey: "grioMap.reel.does",
    doesFallback: "Roz ke chune hue rishtey, ek-ek karke — matching engine ke banaye order me.",
    nodes: [
      { key: "grioMap.dashboard.short", fallback: "Aaj" },
      { key: "grioMap.reel.short", fallback: "Reel" },
      { key: "grioMap.vibe.short", fallback: "Vibe" },
      { key: "grioMap.circle.short", fallback: "Circle" },
    ],
  },
  {
    id: "profile",
    icon: UserRound,
    x: 80,
    y: 29,
    labelKey: "grioMap.branch.profile.label",
    labelFallback: "Aapko samajhta hai",
    shortKey: "grioMap.branch.profile.short",
    shortFallback: "Aap",
    doesKey: "grioMap.profile-core.does",
    doesFallback:
      "Aapki basic pehchaan — naam, sheher, kaam, parivaar. Yahi log sabse pehle dekhte hain.",
    nodes: [
      { key: "grioMap.profile-core.short", fallback: "Profile" },
      { key: "grioMap.intelligence.short", fallback: "Sawaal" },
      { key: "grioMap.preferences.short", fallback: "Pasand" },
      { key: "grioMap.deep-profile.short", fallback: "Deep" },
    ],
  },
  {
    id: "rishta",
    icon: Heart,
    x: 80,
    y: 59,
    labelKey: "grioMap.branch.rishta.label",
    labelFallback: "Ek rishta",
    shortKey: "grioMap.branch.rishta.short",
    shortFallback: "Rishta",
    doesKey: "grioMap.matches.does",
    doesFallback:
      "Wo log jinke saath dono taraf se haan ho chuki hai — aur har rishte ka stage.",
    nodes: [
      { key: "grioMap.matches.short", fallback: "Rishte" },
      { key: "grioMap.interests.short", fallback: "Interest" },
      { key: "grioMap.messages.short", fallback: "Chat" },
      { key: "grioMap.questions.short", fallback: "Sawaal" },
    ],
  },
  {
    id: "family",
    icon: HouseHeart,
    x: 50,
    y: 74,
    labelKey: "grioMap.branch.family.label",
    labelFallback: "Ghar aur parampara",
    shortKey: "grioMap.branch.family.short",
    shortFallback: "Ghar",
    doesKey: "grioMap.family.does",
    doesFallback: "Ghar walon ko jodna, aur unse poochhna ki wo kya ummeed rakhte hain.",
    nodes: [
      { key: "grioMap.family.short", fallback: "Parivaar" },
      { key: "grioMap.kundli.short", fallback: "Kundli" },
      { key: "grioMap.biodata.short", fallback: "Biodata" },
    ],
  },
  {
    id: "discovery",
    icon: Telescope,
    x: 20,
    y: 59,
    labelKey: "grioMap.branch.discovery.label",
    labelFallback: "Smart Discovery",
    shortKey: "grioMap.branch.discovery.short",
    shortFallback: "Khoj",
    doesKey: "grioMap.filters.does",
    doesFallback: "Search aur gehre filter — verified only, trust score, sheher, padhai.",
    nodes: [
      { key: "grioMap.filters.short", fallback: "Filters" },
      { key: "grioMap.behaviour.short", fallback: "Learning" },
      { key: "grioMap.shortlist.short", fallback: "Shortlist" },
      { key: "grioMap.boost.short", fallback: "Boost" },
    ],
  },
  {
    id: "trust",
    icon: ShieldCheck,
    x: 20,
    y: 29,
    labelKey: "grioMap.branch.trust.label",
    labelFallback: "Trust aur pehchaan",
    shortKey: "grioMap.branch.trust.short",
    shortFallback: "Trust",
    doesKey: "grioMap.trust-score.does",
    doesFallback:
      "Verification aur poori profile ka ek saaf hisaab — doosre isi se bharosa banate hain.",
    nodes: [
      { key: "grioMap.verify-contact.short", fallback: "OTP" },
      { key: "grioMap.photos.short", fallback: "Photo" },
      { key: "grioMap.trust-score.short", fallback: "Score" },
      { key: "grioMap.app-setup.short", fallback: "Setup" },
    ],
  },
];

const CENTRE = { x: 50, y: 44 };
/** Long enough to finish reading the note, short enough to feel alive. */
const AUTO_ADVANCE_MS = 3200;

export default function GrioMapPreview() {
  const t = useT();
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [touched, setTouched] = useState(false);

  /*
   * The map introduces itself. A canvas of six unlabelled circles asks the
   * visitor to work out that it is interactive; one that is already moving
   * through its own branches has answered that before the question is asked.
   * The first tap ends it for good — an element that keeps re-animating under
   * someone who has taken control is fighting them.
   */
  useEffect(() => {
    if (touched || reduced) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % BRANCHES.length), AUTO_ADVANCE_MS);
    return () => clearInterval(id);
  }, [touched, reduced]);

  const select = useCallback((i: number) => {
    setTouched(true);
    setIndex(i);
  }, []);

  const active = BRANCHES[index];

  return (
    <div className="mx-auto w-full max-w-lg lg:max-w-none">
      <div
        className={cn(
          "spotlight grain relative isolate overflow-hidden rounded-2xl",
          "border border-white/10 bg-wine-700 dark:bg-wine-900",
          "shadow-[0_30px_70px_-30px_rgb(0_0_0_/_0.55)]",
        )}
      >
        {/* The orbit. A fixed aspect box, so every percentage below lands in
            the same place on a 340px phone and a 900px card. */}
        {/* Square on a phone. At 4/5 the orbit finished ~80px above the note
            card and the gap read as a mistake; a square box is the shape the
            circle actually needs. */}
        <div className="relative aspect-square w-full sm:aspect-[5/4] lg:aspect-[6/5]">
          {/* Spokes, drawn under the bubbles. The live one is gold and full
              width; the rest are a hairline, so the canvas still reads as one
              connected map rather than six loose circles. */}
          <svg
            aria-hidden
            className="absolute inset-0 size-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            {BRANCHES.map((b, i) => (
              <line
                key={b.id}
                x1={CENTRE.x}
                y1={CENTRE.y}
                x2={b.x}
                y2={b.y}
                stroke="currentColor"
                className={cn(
                  "text-gold-300 transition-opacity duration-500",
                  i === index ? "opacity-70" : "opacity-15",
                )}
                strokeWidth={i === index ? 2 : 1}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>

          {/* Grio, at the centre of its own map. */}
          <div
            className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${CENTRE.x}%`, top: `${CENTRE.y}%` }}
          >
            <div className="relative grid size-16 place-items-center rounded-full bg-gradient-to-br from-gold-200 to-gold-400 shadow-[0_0_0_1px_rgb(255_255_255_/_0.25),0_10px_30px_-8px_rgb(201_169_110_/_0.9)] sm:size-[4.5rem]">
              {!reduced && (
                <motion.span
                  aria-hidden
                  className="absolute inset-0 rounded-full border border-gold-200"
                  animate={{ scale: [1, 1.45], opacity: [0.55, 0] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: "easeOut" }}
                />
              )}
              <span className="font-[family-name:var(--font-display)] text-lg text-wine-800 sm:text-xl">
                Grio
              </span>
            </div>
          </div>

          {BRANCHES.map((branch, i) => {
            const Icon = branch.icon;
            const isActive = i === index;
            return (
              <button
                key={branch.id}
                type="button"
                onClick={() => select(i)}
                aria-pressed={isActive}
                /* No `touch-target` here: that utility sets position:relative,
                   which overrode this element's `absolute` and dropped all six
                   bubbles into normal flow — the percentages then read as
                   offsets from wherever the stack had put them. The bubble is
                   48px on its own, so the utility has nothing to add anyway. */
                className="absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5 outline-none"
                style={{ left: `${branch.x}%`, top: `${branch.y}%` }}
              >
                <span
                  className={cn(
                    "grid size-12 place-items-center rounded-full border transition-all duration-300 sm:size-14",
                    isActive
                      ? "scale-110 border-gold-200 bg-gold-300/25 text-gold-100 shadow-[0_0_0_4px_rgb(201_169_110_/_0.18)]"
                      : "border-white/15 bg-white/[0.07] text-white/55 hover:border-white/30 hover:text-white/80",
                  )}
                >
                  <Icon className="size-[18px] sm:size-5" />
                </span>
                <span
                  className={cn(
                    "text-[0.6875rem] font-semibold transition-colors duration-300",
                    isActive ? "text-gold-100" : "text-white/45",
                  )}
                >
                  {t(branch.shortKey, branch.shortFallback)}
                </span>
              </button>
            );
          })}
        </div>

        {/* The note. Inside the canvas on purpose: the real map's one hard rule
            is that nothing lives outside it, because a bubble at the top and a
            paragraph at the bottom is a menu with a document stapled to it. */}
        <div className="relative border-t border-white/10 bg-black/15 px-5 py-5 backdrop-blur-sm sm:px-6">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-gold-200/80">
            {t(active.shortKey, active.shortFallback)}
          </p>
          <p className="mt-1.5 font-[family-name:var(--font-display)] text-lg text-white sm:text-xl">
            {t(active.labelKey, active.labelFallback)}
          </p>
          {/* min-h keeps the card from resizing as the sentence changes length,
              which on auto-advance would make the whole section jump. */}
          <p className="mt-2 min-h-[4.25rem] text-[0.875rem] leading-relaxed text-white/65 sm:min-h-[3.5rem]">
            {t(active.doesKey, active.doesFallback)}
          </p>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {active.nodes.map((node) => (
              <span
                key={node.key}
                className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[0.75rem] text-white/70"
              >
                {t(node.key, node.fallback)}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* The gate, said plainly and once. */}
      <div className="mt-4 flex flex-col items-center gap-3 rounded-xl border border-line bg-surface p-4 text-center sm:flex-row sm:justify-between sm:text-left">
        <p className="flex items-center gap-2.5 text-[0.875rem] text-muted">
          <Lock className="size-4 shrink-0 text-primary-text" />
          {t("home.map.gate", "Yahan sirf naksha hai. Aapka apna map login ke baad khulta hai.")}
        </p>
        <Link
          href="/login?next=/user/grio-map"
          className="touch-target shrink-0 rounded-md border border-gold-300 px-4 py-2 text-[0.875rem] font-semibold text-primary-text transition-colors hover:bg-gold-50 dark:hover:bg-gold-900/30"
        >
          {t("home.map.cta", "Apna map kholein")}
        </Link>
      </div>
    </div>
  );
}
