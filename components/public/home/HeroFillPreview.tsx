"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { FileUp } from "lucide-react";
import FieldFillStream, { type StreamField } from "@/components/profile/FieldFillStream";
import CountUp from "@/components/ui/CountUp";

/**
 * MOCK — marketing illustration only. These values are never written to a
 * profile; real extraction always goes through the review-and-confirm screen
 * (master_plan §10.2).
 */
const FIELDS: StreamField[] = [
  { key: "name", label: "Poora Naam", value: "Rahul Sharma", confidence: 96 },
  { key: "dob", label: "Janm Tithi", value: "12 May 1995", confidence: 74 },
  { key: "edu", label: "Education", value: "B.Tech (Computer Science)", confidence: 89 },
  { key: "job", label: "Profession", value: "Software Engineer", confidence: 93 },
  { key: "city", label: "Current City", value: "New Delhi", confidence: 97 },
  { key: "income", label: "Annual Income", value: null, confidence: 0 },
];

/**
 * Hero product preview.
 *
 * A white card with its own border/shadow floats on the (now light gold)
 * hero — the shadow and border, not a dark-vs-light hero contrast, are what
 * read it as a real surface rather than a decorative panel.
 */
export default function HeroFillPreview() {
  const reduced = useReducedMotion();
  const [round, setRound] = useState(0);

  return (
    <div className="relative">
      <div aria-hidden className="absolute -inset-6 -z-10 rounded-full bg-gold-400/20 blur-3xl" />

      <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b border-line bg-bg-subtle px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-full bg-gold-100 text-primary-text dark:bg-gold-900/50">
              <FileUp className="size-4" />
            </span>
            <div className="leading-tight">
              <p className="text-[0.8125rem] font-semibold text-ink">biodata_rahul.pdf</p>
              <p className="text-[0.6875rem] text-muted">2 minute me profile ready</p>
            </div>
          </div>
        </div>

        <div className="p-4">
          <FieldFillStream
            key={round}
            fields={FIELDS}
            autoPlay
            intervalMs={850}
            onComplete={() => {
              if (reduced) return;
              // Loop the demo so a visitor who arrives mid-cycle still sees it.
              setTimeout(() => setRound((r) => r + 1), 4200);
            }}
          />
        </div>
      </div>

      {/* Floating trust chip */}
      <motion.div
        aria-hidden
        animate={reduced ? undefined : { y: [0, -8, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -bottom-5 -left-5 hidden rounded-lg border border-line bg-surface px-4 py-3 shadow-xl sm:block"
      >
        <p className="text-[0.625rem] font-semibold uppercase tracking-wider text-muted">
          Trust Score
        </p>
        <p className="mt-0.5 font-[family-name:var(--font-display)] text-2xl leading-none text-trust">
          <CountUp value={82} suffix="%" />
        </p>
      </motion.div>
    </div>
  );
}
