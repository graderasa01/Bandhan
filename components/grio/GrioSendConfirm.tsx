"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import Button from "@/components/ui/Button";
import { ease, slideUpSheet } from "@/lib/motion";

/** Last stop before a message actually leaves — always editable, never auto-fired. */
export default function GrioSendConfirm({
  open,
  recipientName,
  initialText,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  recipientName: string | null;
  initialText: string;
  onCancel: () => void;
  onConfirm: (text: string) => void;
}) {
  const [text, setText] = useState(initialText);

  useEffect(() => {
    if (open) setText(initialText);
  }, [open, initialText]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[70] bg-ink/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: ease.fast }}
            onClick={onCancel}
          />
          <motion.div
            className="fixed inset-x-0 bottom-0 z-[71] rounded-t-xl border-t border-line bg-surface pb-[env(safe-area-inset-bottom,0px)] shadow-lg"
            variants={slideUpSheet}
            initial="hidden"
            animate="show"
            exit="exit"
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <p className="font-semibold text-ink">{recipientName ? `${recipientName} ko bhejein` : "Bhejein"}</p>
              <button
                type="button"
                onClick={onCancel}
                aria-label="Band karein"
                className="grid size-8 place-items-center rounded-full text-muted transition-colors hover:bg-bg-subtle hover:text-ink"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="p-4">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, 2000))}
                rows={4}
                className="w-full resize-none rounded-md border border-line-strong bg-surface px-3.5 py-2.5 text-[0.9375rem] outline-none focus:border-gold-500 focus:shadow-[0_0_0_3px_rgb(201_169_110_/_0.18)]"
              />
              <div className="mt-3 flex gap-2">
                <Button variant="secondary" fullWidth onClick={onCancel}>
                  Cancel
                </Button>
                <Button variant="accent" fullWidth disabled={!text.trim()} onClick={() => onConfirm(text.trim())}>
                  Bhejein
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
