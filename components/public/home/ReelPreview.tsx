"use client";

import { AlertCircle, BadgeCheck, Bookmark, GraduationCap, Heart, Lock, MessageSquareText, X } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import ProgressRing from "@/components/ui/ProgressRing";
import Pill from "@/components/ui/Pill";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n/LanguageProvider";
import type { Translate } from "@/lib/i18n/translate";

/**
 * MOCK — marketing illustration of the Rishta Reel card (M07 §2).
 * No real profile data appears here.
 */
function actions(t: Translate) {
  return [
    { icon: X, label: t("home.reelPreview.actionSkip", "Abhi nahi"), tone: "neutral" },
    { icon: MessageSquareText, label: t("home.reelPreview.actionAskAi", "AI se poocho"), tone: "ai" },
    // Mirrors ReelActionBar's real DOWN action — renamed there from "Family ko"
    // once it was clear the button was named after the follow-up rather than
    // what it does. A marketing illustration that shows a button the app no
    // longer has is worse than no illustration.
    { icon: Bookmark, label: "Shortlist", tone: "family" },
    { icon: Heart, label: "Interest", tone: "primary" },
  ] as const;
}

export default function ReelPreview() {
  const t = useT();
  const ACTIONS = actions(t);
  const reduced = useReducedMotion();

  return (
    <div className="relative mx-auto max-w-[340px]">
      {/* Stacked cards behind — conveys "5 for today", not infinite */}
      <div
        aria-hidden
        className="absolute inset-x-6 -top-3 h-full rounded-lg border border-line bg-surface/60"
      />
      <div
        aria-hidden
        className="absolute inset-x-3 -top-1.5 h-full rounded-lg border border-line bg-surface/80"
      />

      <motion.div
        animate={reduced ? undefined : { y: [0, -6, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        className="relative overflow-hidden rounded-lg border border-line bg-surface shadow-xl"
      >
        {/* Counter */}
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <p className="text-[0.75rem] font-semibold text-ink">
            {t("home.reelPreview.counter", "Aaj ke liye 5 rishtey")}
          </p>
          <div className="flex gap-1" aria-hidden>
            {[0, 1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className={cn("size-1.5 rounded-full", i < 2 ? "bg-primary" : "bg-line-strong")}
              />
            ))}
          </div>
        </div>

        {/* Photo area — consent-gated blur (M07 §2.4) */}
        <div className="relative aspect-[4/3] bg-gradient-to-br from-wine-100 via-gold-100 to-sand-200 dark:from-wine-900 dark:via-gold-900 dark:to-sand-800">
          <div className="absolute inset-0 grid place-items-center">
            <div className="flex flex-col items-center gap-2 text-center">
              <span className="grid size-11 place-items-center rounded-full bg-surface/80 backdrop-blur-sm">
                <Lock className="size-5 text-muted" />
              </span>
              <p className="max-w-[180px] text-[0.6875rem] leading-snug text-sand-700 dark:text-sand-300">
                {t("home.reelPreview.photoLocked", "Photo mutual interest ya subscription ke baad dikhegi")}
              </p>
            </div>
          </div>

          <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
            <Pill tone="trust" size="sm">
              <BadgeCheck />
              ID
            </Pill>
            <Pill tone="trust" size="sm">
              <GraduationCap />
              Education
            </Pill>
          </div>
        </div>

        {/* Details */}
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-lg font-semibold leading-tight text-ink">Priya, 27</p>
              <p className="text-[0.8125rem] text-muted">Delhi · MBA</p>
              <p className="text-[0.8125rem] text-muted">Marketing Manager</p>
            </div>

            <ProgressRing
              size={62}
              thickness={6}
              segments={[
                { key: "p", label: "Preferences", value: 88, color: "#c9a96e" },
                { key: "d", label: "Deep profile", value: 79, color: "#ddac51" },
                { key: "t", label: "Trust", value: 91, color: "#1f7a5a" },
              ]}
            >
              <span className="font-[family-name:var(--font-display)] text-base leading-none text-ink">
                84%
              </span>
            </ProgressRing>
          </div>

          <div className="mt-3 space-y-1.5 border-t border-line pt-3">
            <p className="flex items-start gap-1.5 text-[0.75rem] text-ink">
              <BadgeCheck className="mt-px size-3.5 shrink-0 text-trust" />
              {t("home.reelPreview.reasonCity", "City preference match karti hai")}
            </p>
            <p className="flex items-start gap-1.5 text-[0.75rem] text-ink">
              <BadgeCheck className="mt-px size-3.5 shrink-0 text-trust" />
              {t("home.reelPreview.reasonFamily", "Dono ne family bonding ko priority chuna")}
            </p>
            {/* Honest concern — never hidden (M07 §4.1) */}
            <p className="flex items-start gap-1.5 text-[0.75rem] text-warn">
              <AlertCircle className="mt-px size-3.5 shrink-0" />
              {t("home.reelPreview.reasonRelocation", "Relocation preference abhi unanswered hai")}
            </p>
          </div>
        </div>

        {/* Action bar — every gesture has a button (M07 §3.4) */}
        <div className="grid grid-cols-4 gap-1 border-t border-line bg-bg-subtle p-2">
          {ACTIONS.map(({ icon: Icon, label, tone }) => (
            <div key={label} className="flex flex-col items-center gap-1 py-1.5">
              <span
                className={cn(
                  "grid size-9 place-items-center rounded-full",
                  tone === "primary" && "bg-primary text-primary-fg",
                  tone === "ai" && "bg-gold-100 text-primary-text dark:bg-gold-900/50",
                  tone === "family" && "bg-info-bg text-info",
                  tone === "neutral" && "bg-surface text-muted",
                )}
              >
                <Icon className="size-4" />
              </span>
              <span className="text-[0.5625rem] leading-none text-muted">{label}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
