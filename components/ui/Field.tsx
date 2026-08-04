"use client";

import { createContext, useContext, useId, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Check, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { ease } from "@/lib/motion";

type FieldCtx = {
  id: string;
  errorId: string;
  hintId: string;
  invalid: boolean;
  disabled: boolean;
};

const FieldContext = createContext<FieldCtx | null>(null);

export function useField() {
  return useContext(FieldContext);
}

export interface FieldProps {
  label?: string;
  hint?: string;
  error?: string;
  /** Shows a green check + subtle celebration when the value becomes valid. */
  valid?: boolean;
  required?: boolean;
  optional?: boolean;
  disabled?: boolean;
  /** AI extracted this value — shows provenance + confidence. */
  aiFilled?: { confidence: number; source?: string };
  className?: string;
  children: ReactNode;
}

/**
 * Wraps a control with label / hint / error / AI-provenance.
 *
 * The AI badge is a product requirement, not decoration: master_plan §10.3
 * requires every AI-extracted field to surface its confidence, and D-32
 * requires extracted values to be visibly distinguishable from user input.
 */
export default function Field({
  label,
  hint,
  error,
  valid,
  required,
  optional,
  disabled = false,
  aiFilled,
  className,
  children,
}: FieldProps) {
  const base = useId();
  const ctx: FieldCtx = {
    id: `${base}-input`,
    errorId: `${base}-error`,
    hintId: `${base}-hint`,
    invalid: Boolean(error),
    disabled,
  };

  return (
    <FieldContext.Provider value={ctx}>
      <div className={cn("flex flex-col gap-1.5", className)}>
        {label && (
          <div className="flex items-baseline justify-between gap-3">
            <label
              htmlFor={ctx.id}
              className={cn(
                "text-[0.8125rem] font-semibold text-ink",
                disabled && "opacity-50",
              )}
            >
              {label}
              {required && <span className="ml-0.5 text-danger">*</span>}
              {optional && <span className="ml-1.5 font-normal text-subtle">optional</span>}
            </label>

            {aiFilled && <AIFilledBadge confidence={aiFilled.confidence} />}
          </div>
        )}

        <motion.div
          animate={error ? { x: [0, -5, 5, -3, 3, 0] } : { x: 0 }}
          transition={{ duration: 0.35 }}
        >
          {children}
        </motion.div>

        <AnimatePresence mode="wait" initial={false}>
          {error ? (
            <motion.p
              key="error"
              id={ctx.errorId}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={ease.fast}
              className="flex items-center gap-1.5 text-[0.75rem] font-medium text-danger"
            >
              <AlertCircle className="size-3.5 shrink-0" />
              {error}
            </motion.p>
          ) : valid ? (
            <motion.p
              key="valid"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={ease.fast}
              className="flex items-center gap-1.5 text-[0.75rem] font-medium text-trust"
            >
              <Check className="size-3.5 shrink-0" />
              Sahi hai
            </motion.p>
          ) : hint ? (
            <motion.p
              key="hint"
              id={ctx.hintId}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-[0.75rem] leading-snug text-muted"
            >
              {hint}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>
    </FieldContext.Provider>
  );
}

/** Confidence badge — master_plan §10.3. Low confidence must look different. */
export function AIFilledBadge({ confidence }: { confidence: number }) {
  const tone =
    confidence >= 90
      ? "border-trust/30 bg-trust-bg text-trust"
      : confidence >= 75
        ? "border-gold-300 bg-gold-50 text-primary-text dark:bg-gold-900/40"
        : "border-warn/30 bg-warn-bg text-warn";

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5",
        "text-[0.625rem] font-semibold tabular-nums",
        tone,
        confidence < 75 && "animate-pulse-soft",
      )}
      title={
        confidence < 75
          ? "Confidence kam hai — please check kar lijiye"
          : "AI ne ye value nikali hai"
      }
    >
      <Sparkles className="size-2.5" />
      {confidence}%
    </span>
  );
}
