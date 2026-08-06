"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Languages, X } from "lucide-react";
import { LANGUAGE_META, type SpokenLanguage } from "@/lib/contracts/interview";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/motion";
import Sheet from "@/components/ui/Sheet";

/**
 * Every option is written in its own script, never transliterated.
 *
 * That is the whole point of the control: somebody who cannot read Hinglish is
 * exactly the person who needs it, and "Marathi" spelled in Latin letters is
 * invisible to them. मराठी is not.
 */
const ORDER: SpokenLanguage[] = [
  "hi", "en", "mr", "bn", "te", "ta", "gu", "kn", "ml", "pa", "or",
];

export default function LanguagePicker({
  value,
  onChange,
  className,
}: {
  value: SpokenLanguage;
  onChange: (lang: SpokenLanguage) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex min-h-12 touch-target items-center gap-2 rounded-full border border-line-strong",
          "bg-surface px-4 text-[0.8125rem] font-medium text-ink shadow-xs transition-colors",
          "hover:border-gold-500 hover:bg-gold-50 dark:hover:bg-gold-900/30",
          "focus-visible:ring-2 focus-visible:ring-gold-600 focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
          className,
        )}
      >
        <Languages className="size-4 text-primary-text" />
        {LANGUAGE_META[value].native}
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Bhasha chunein" variant="bottom">
        <p className="mb-4 text-[0.8125rem] leading-relaxed text-muted">
          Jis bhasha me aap bolenge, usi me sawaal poochhe jayenge.
        </p>

        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ORDER.map((code) => {
            const active = code === value;
            return (
              <li key={code}>
                <button
                  type="button"
                  onClick={() => {
                    haptic("select");
                    onChange(code);
                    setOpen(false);
                  }}
                  aria-pressed={active}
                  className={cn(
                    "flex min-h-14 w-full items-center justify-between gap-2 rounded-md border-2 px-4",
                    "text-left transition-all duration-200",
                    active
                      ? "border-primary bg-gold-50 dark:bg-gold-900/30"
                      : "border-line bg-surface hover:border-line-strong hover:bg-bg-subtle",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[0.9375rem] font-semibold text-ink">
                      {LANGUAGE_META[code].native}
                    </span>
                  </span>
                  {active && <Check className="size-4 shrink-0 text-primary-text" strokeWidth={3} />}
                </button>
              </li>
            );
          })}
        </ul>
      </Sheet>
    </>
  );
}

/**
 * Offered when what we heard does not match the chosen language.
 *
 * An offer rather than a switch: the user set the language, so a detector
 * getting one sentence right does not earn the right to change it under them.
 * Declining also has to stick, or the same prompt reappears every turn.
 */
export function LanguageSwitchOffer({
  detected,
  onAccept,
  onDismiss,
}: {
  detected: SpokenLanguage;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        className="flex items-start gap-3 rounded-md border border-info/25 bg-info-bg px-4 py-3"
      >
        <Languages className="mt-0.5 size-4 shrink-0 text-info" />
        <div className="min-w-0 flex-1">
          <p className="text-[0.8125rem] leading-snug text-ink">
            Lagta hai aap{" "}
            <span className="font-semibold">{LANGUAGE_META[detected].native}</span> me baat kar
            rahe hain. Usi me poochhun?
          </p>
          <div className="mt-2.5 flex gap-2">
            <button
              type="button"
              onClick={onAccept}
              className="min-h-12 touch-target rounded-full bg-primary px-4 text-[0.8125rem] font-semibold text-primary-fg"
            >
              Yes, {LANGUAGE_META[detected].native}
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="min-h-12 touch-target rounded-full px-3 text-[0.8125rem] font-medium text-muted hover:text-ink"
            >
              No, Keep As Is
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Close"
          className="grid size-12 shrink-0 place-items-center text-muted hover:text-ink"
        >
          <X className="size-4" />
        </button>
      </motion.div>
    </AnimatePresence>
  );
}
