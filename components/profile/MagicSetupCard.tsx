"use client";

import type { LucideIcon } from "lucide-react";
import { ArrowRight, Lock } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/motion";

interface Props {
  icon: LucideIcon;
  badge: string;
  title: string;
  description: string;
  tone: "gold" | "trust" | "rose";
  onSelect: () => void;
  /**
   * Still clickable — `onSelect` still fires — but dimmed, with a lock badge
   * and `lockedNote` in place of the usual "Select" row. The caller decides
   * what tapping a locked card actually does (voice-for-self shows a request
   * form instead of entering the flow); this component only ever renders the
   * locked *look*.
   */
  locked?: boolean;
  lockedNote?: string;
}

const TONE = {
  gold: {
    iconWrap: "bg-gradient-to-br from-gold-400 to-gold-600 text-primary-fg shadow-gold",
    badge: "bg-gold-100 text-gold-800 dark:bg-gold-900/40 dark:text-gold-200",
    hoverBorder: "hover:border-gold-300",
    glow: "from-gold-400/15",
  },
  trust: {
    iconWrap: "bg-gradient-to-br from-trust to-[#134432] text-white shadow-[0_8px_24px_rgb(31_122_90_/_0.35)]",
    badge: "bg-trust-bg text-trust",
    hoverBorder: "hover:border-trust/40",
    glow: "from-trust/15",
  },
  rose: {
    iconWrap: "bg-gradient-to-br from-rose-400 to-rose-600 text-white shadow-rose",
    badge: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200",
    hoverBorder: "hover:border-rose-300",
    glow: "from-rose-400/15",
  },
} as const;

/**
 * One "Magic Setup" entry-method option — Talk to AI / Upload Biodata /
 * Manual Setup. Deliberately premium: glow, lift-on-hover, glass sheen — this
 * is the first real decision a new user makes, so it earns the extra polish.
 */
export default function MagicSetupCard({
  icon: Icon,
  badge,
  title,
  description,
  tone,
  onSelect,
  locked = false,
  lockedNote,
}: Props) {
  const reduced = useReducedMotion();
  const t = TONE[tone];

  return (
    <motion.button
      type="button"
      onClick={() => {
        haptic("select");
        onSelect();
      }}
      whileHover={reduced ? undefined : { y: -4 }}
      whileTap={reduced ? undefined : { scale: 0.98 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "group relative w-full overflow-hidden rounded-lg border border-line bg-surface p-5 text-left shadow-sm",
        "transition-colors duration-300 sm:p-6",
        locked ? "opacity-70 hover:opacity-100" : t.hoverBorder,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-gradient-to-br to-transparent opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100",
          t.glow,
        )}
      />

      <div className="relative flex items-start justify-between gap-3">
        <span className={cn("grid size-12 shrink-0 place-items-center rounded-full [&_svg]:size-5.5", t.iconWrap)}>
          <Icon />
        </span>
        {locked ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-bg-subtle px-2.5 py-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-subtle">
            <Lock className="size-3" />
            Locked
          </span>
        ) : (
          <span className={cn("rounded-full px-2.5 py-1 text-[0.6875rem] font-semibold uppercase tracking-wide", t.badge)}>
            {badge}
          </span>
        )}
      </div>

      <h3 className="relative mt-4 text-lg font-semibold text-ink">{title}</h3>
      <p className="relative mt-1.5 text-[0.8125rem] leading-relaxed text-muted">{description}</p>

      {locked ? (
        <p className="relative mt-4 text-[0.8125rem] font-medium leading-snug text-subtle">{lockedNote}</p>
      ) : (
        <span className="relative mt-4 inline-flex items-center gap-1.5 text-[0.8125rem] font-semibold text-primary-text">
          Select
          <ArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-1" />
        </span>
      )}
    </motion.button>
  );
}
