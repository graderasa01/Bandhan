"use client";

import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { motion } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useField } from "@/components/ui/Field";
import { CONTROL_BASE, CONTROL_SIZE } from "@/components/ui/Input";
import { haptic, spring } from "@/lib/motion";

/* ------------------------------------------------------------------ */
/* Select                                                              */
/* ------------------------------------------------------------------ */

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: { value: string; label: string; disabled?: boolean }[];
  placeholder?: string;
  selectSize?: keyof typeof CONTROL_SIZE;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { options, placeholder, selectSize = "md", className, ...props },
  ref,
) {
  const field = useField();

  return (
    <div className="relative">
      <select
        ref={ref}
        id={field?.id ?? props.id}
        aria-invalid={field?.invalid || undefined}
        aria-describedby={field?.invalid ? field.errorId : field?.hintId}
        disabled={props.disabled ?? field?.disabled}
        className={cn(
          CONTROL_BASE,
          CONTROL_SIZE[selectSize],
          "cursor-pointer appearance-none pr-10",
          field?.invalid ? "border-danger" : "border-line-strong",
          !props.value && !props.defaultValue && placeholder && "text-subtle",
          className,
        )}
        {...props}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-subtle" />
    </div>
  );
});

/* ------------------------------------------------------------------ */
/* Checkbox                                                            */
/* ------------------------------------------------------------------ */

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: ReactNode;
  description?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, description, className, onChange, ...props },
  ref,
) {
  return (
    <label
      className={cn(
        "group flex min-h-12 cursor-pointer items-start gap-3 rounded-md p-2 -mx-2",
        "transition-colors hover:bg-bg-subtle",
        props.disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      <span className="relative mt-0.5 grid size-5 shrink-0 place-items-center">
        <input
          ref={ref}
          type="checkbox"
          className="peer sr-only"
          onChange={(e) => {
            haptic("select");
            onChange?.(e);
          }}
          {...props}
        />
        <span
          className={cn(
            "size-5 rounded-[6px] border-2 border-line-strong bg-surface transition-all duration-200",
            "peer-checked:border-primary peer-checked:bg-primary",
            "peer-focus-visible:ring-2 peer-focus-visible:ring-gold-600 peer-focus-visible:ring-offset-2",
          )}
        />
        <Check
          className="pointer-events-none absolute size-3.5 scale-0 text-primary-fg transition-transform duration-200 peer-checked:scale-100"
          strokeWidth={3}
        />
      </span>

      <span className="min-w-0">
        <span className="block text-[0.9375rem] leading-snug text-ink">{label}</span>
        {description && (
          <span className="mt-0.5 block text-[0.8125rem] leading-snug text-muted">{description}</span>
        )}
      </span>
    </label>
  );
});

/* ------------------------------------------------------------------ */
/* Switch                                                              */
/* ------------------------------------------------------------------ */

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  label?: ReactNode;
  description?: string;
  /** Renders a lock hint — used for plan-critical notification channels. */
  locked?: boolean;
}

export const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  { label, description, locked, className, onChange, ...props },
  ref,
) {
  return (
    <label
      className={cn(
        "flex min-h-12 items-center justify-between gap-4",
        props.disabled || locked ? "cursor-not-allowed opacity-70" : "cursor-pointer",
        className,
      )}
    >
      {(label || description) && (
        <span className="min-w-0">
          {label && <span className="block text-[0.9375rem] text-ink">{label}</span>}
          {description && (
            <span className="mt-0.5 block text-[0.8125rem] leading-snug text-muted">{description}</span>
          )}
        </span>
      )}

      <span className="relative inline-flex shrink-0">
        <input
          ref={ref}
          type="checkbox"
          role="switch"
          className="peer sr-only"
          disabled={props.disabled || locked}
          onChange={(e) => {
            haptic("select");
            onChange?.(e);
          }}
          {...props}
        />
        <span
          className={cn(
            "h-7 w-12 rounded-full bg-line-strong transition-colors duration-200",
            "peer-checked:bg-primary",
            "peer-focus-visible:ring-2 peer-focus-visible:ring-gold-600 peer-focus-visible:ring-offset-2",
          )}
        />
        <span
          className={cn(
            "pointer-events-none absolute left-0.5 top-0.5 size-6 rounded-full bg-surface shadow-sm",
            "transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
            "peer-checked:translate-x-5",
          )}
        />
      </span>
    </label>
  );
});

/* ------------------------------------------------------------------ */
/* ChoiceCard — big tappable option, better than a dropdown on mobile   */
/* ------------------------------------------------------------------ */

export interface ChoiceCardProps {
  name: string;
  value: string;
  checked: boolean;
  onSelect: (value: string) => void;
  title: string;
  description?: string;
  icon?: ReactNode;
  disabled?: boolean;
}

/**
 * Used for profile questions with 2–6 options (family type, diet, decision
 * style). A 48px dropdown hides the options; a card grid shows them, which
 * measurably reduces drop-off on long forms.
 */
export function ChoiceCard({
  name,
  value,
  checked,
  onSelect,
  title,
  description,
  icon,
  disabled,
}: ChoiceCardProps) {
  return (
    <label
      className={cn(
        "relative flex cursor-pointer items-start gap-3 rounded-md border-2 p-4",
        "transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
        checked
          ? "border-primary bg-gold-50 shadow-sm dark:bg-gold-900/30"
          : "border-line bg-surface hover:border-line-strong hover:bg-bg-subtle",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => {
          haptic("select");
          onSelect(value);
        }}
        className="peer sr-only"
      />

      {icon && (
        <span
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-full transition-colors [&_svg]:size-5",
            checked ? "bg-primary text-primary-fg" : "bg-bg-subtle text-muted",
          )}
        >
          {icon}
        </span>
      )}

      <span className="min-w-0 flex-1">
        <span className="block text-[0.9375rem] font-semibold leading-snug text-ink">{title}</span>
        {description && (
          <span className="mt-1 block text-[0.8125rem] leading-snug text-muted">{description}</span>
        )}
      </span>

      {checked && (
        <motion.span
          layoutId={`choice-${name}`}
          transition={spring.snappy}
          className="grid size-5 shrink-0 place-items-center rounded-full bg-primary"
        >
          <Check className="size-3 text-primary-fg" strokeWidth={3} />
        </motion.span>
      )}
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* ChipGroup — multi-select for interests / preferences                */
/* ------------------------------------------------------------------ */

export function ChipGroup({
  options,
  selected,
  onToggle,
  max,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
  max?: number;
}) {
  const atLimit = max !== undefined && selected.length >= max;

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const isOn = selected.includes(o.value);
        const blocked = !isOn && atLimit;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={isOn}
            disabled={blocked}
            onClick={() => {
              haptic("select");
              onToggle(o.value);
            }}
            className={cn(
              "min-h-11 touch-target rounded-full border px-4 text-sm font-medium",
              "transition-all duration-200 active:scale-95",
              isOn
                ? "border-primary bg-primary text-primary-fg shadow-sm"
                : "border-line-strong bg-surface text-ink hover:border-gold-500 hover:bg-gold-50 dark:hover:bg-gold-900/30",
              blocked && "cursor-not-allowed opacity-40",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
