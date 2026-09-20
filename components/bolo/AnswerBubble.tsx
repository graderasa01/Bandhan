"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check } from "lucide-react";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n/LanguageProvider";

export interface BubbleContent {
  /** A new id is a new answer — the only thing that animates. */
  id: number;
  text: string;
  /** `accepted`: in the draft, ticked. `sent`: typed to a live Grio, not saved yet. */
  state: "accepted" | "sent";
}

/**
 * The latest answer, under the question, in the visitor's own corner.
 *
 * One bubble, not a chat log. Spoken, tapped or typed, an answer lands here in
 * the same shape — "Aap · 12 May 1995 ✓" — and the next one replaces it. It
 * shows what the draft *accepted*, never a raw transcript, which is also why a
 * tool call that saves the same value twice cannot put up a second bubble.
 */
export default function AnswerBubble({ content, className }: { content: BubbleContent | null; className?: string }) {
  const t = useT();
  const reduced = useReducedMotion();
  const you = t("bolo.bubble.you", "Aap");

  return (
    // No room is held before the first answer; after it, the row keeps its height as answers replace each other.
    <div className={cn("grid justify-items-end", content && "min-h-11", className)}>
      <p className="sr-only" aria-live="polite">
        {content ? `${you}: ${content.text}` : ""}
      </p>
      <AnimatePresence initial={false}>
        {content && (
          <motion.p
            key={content.id}
            aria-hidden
            className="bolo-pane bolo-bubble inline-flex h-[41px] max-w-[88%] items-center gap-[8px] pl-[17px] pr-[10px] text-[13.5px] leading-snug text-primary [grid-area:1/1]"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            transition={spring.snappy}
          >
            <span className="shrink-0 font-semibold">{you}</span>
            <span className="shrink-0 text-muted-2">·</span>
            <span className={cn("min-w-0 truncate", content.state === "sent" && "text-secondary")}>{content.text}</span>
            {content.state === "accepted" ? (
              <motion.span
                className="grid size-[23px] shrink-0 place-items-center rounded-full bg-[#37db96] text-white"
                initial={reduced ? false : { scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ ...spring.bouncy, delay: reduced ? 0 : 0.08 }}
              >
                <Check className="size-[14px]" strokeWidth={3.6} />
              </motion.span>
            ) : (
              <span className="flex h-[21px] shrink-0 items-center gap-1 px-1.5">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="size-1.5 animate-pulse-soft rounded-full bg-gold-300"
                    style={{ animationDelay: `${i * 180}ms` }}
                  />
                ))}
              </span>
            )}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
