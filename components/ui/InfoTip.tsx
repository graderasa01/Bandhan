"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The "why do you need this?" answer, tucked behind a tap instead of printed
 * under every question.
 *
 * A paragraph of justification under each field reads as the product being
 * defensive about its own form — most answers ("Height", "Profession") need no
 * defence at all, and printing one anyway is the clutter. Click-to-reveal
 * (not hover-only: half of this product's traffic is a thumb, not a cursor)
 * keeps the explanation one tap away for the person who wants it without
 * taxing everyone who doesn't.
 */
export default function InfoTip({
  text,
  className,
  label = "Ye kyu chahiye?",
}: {
  text: string;
  className?: string;
  /** Override for non-"why" uses, e.g. a legend explaining icon states. */
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={cn("relative inline-flex", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={label}
        className={cn(
          "grid size-5 touch-target place-items-center rounded-full text-subtle",
          "transition-colors hover:bg-bg-subtle hover:text-muted",
          open && "bg-bg-subtle text-muted",
        )}
      >
        <Info className="size-3.5" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="tooltip"
            initial={{ opacity: 0, scale: 0.94, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className={cn(
              "absolute left-0 top-full z-20 mt-2 w-64 max-w-[80vw] rounded-md border border-line",
              "bg-surface p-3 text-[0.75rem] leading-relaxed text-muted shadow-lg",
            )}
          >
            {text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
