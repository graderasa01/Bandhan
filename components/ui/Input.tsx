"use client";

import { forwardRef, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import Field, { useField } from "@/components/ui/Field";

export const CONTROL_BASE = [
  "w-full rounded-md border bg-surface text-ink",
  "placeholder:text-subtle",
  "transition-[border-color,box-shadow,background-color] duration-200",
  "outline-none",
  "focus:border-gold-500 focus:shadow-[0_0_0_3px_rgb(201_169_110_/_0.18)]",
  "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-bg-subtle",
].join(" ");

export const CONTROL_SIZE = {
  sm: "h-10 px-3 text-sm",
  md: "h-12 px-4 text-[0.9375rem]",
  lg: "h-14 px-5 text-base",
} as const;

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "prefix"> {
  /** v1 API — when passed, the field chrome is rendered for you. */
  label?: string;
  error?: string;
  helperText?: string;
  /** Inside the control, left side. */
  prefix?: ReactNode;
  /** Inside the control, right side. */
  suffix?: ReactNode;
  inputSize?: keyof typeof CONTROL_SIZE;
  /** Live character counter — needs maxLength. */
  showCount?: boolean;
  /** AI extracted this value (master_plan §10.3). */
  aiFilled?: { confidence: number; source?: string };
}

const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    label,
    error,
    helperText,
    className,
    prefix,
    suffix,
    inputSize = "md",
    showCount,
    maxLength,
    onChange,
    aiFilled,
    required,
    disabled,
    ...props
  },
  ref,
) {
  const field = useField();
  const [count, setCount] = useState(
    String(props.defaultValue ?? props.value ?? "").length,
  );

  const invalid = Boolean(error) || field?.invalid;

  const control = (
    <input
      ref={ref}
      id={field?.id ?? props.id}
      required={required}
      disabled={disabled ?? field?.disabled}
      maxLength={maxLength}
      aria-invalid={invalid || undefined}
      aria-describedby={
        field ? (field.invalid ? field.errorId : field.hintId) : undefined
      }
      onChange={(e) => {
        if (showCount) setCount(e.target.value.length);
        onChange?.(e);
      }}
      className={cn(
        CONTROL_BASE,
        CONTROL_SIZE[inputSize],
        invalid
          ? "border-danger focus:border-danger focus:shadow-[0_0_0_3px_rgb(169_42_28_/_0.15)]"
          : "border-line-strong",
        prefix && "pl-10",
        (suffix || showCount) && "pr-12",
        className,
      )}
      {...props}
    />
  );

  const wrapped =
    prefix || suffix || showCount ? (
      <div className="relative">
        {prefix && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle [&_svg]:size-4">
            {prefix}
          </span>
        )}
        {control}
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-subtle [&_svg]:size-4">
            {suffix}
          </span>
        )}
        {showCount && maxLength && !suffix && (
          <span
            className={cn(
              "pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[0.6875rem] tabular-nums",
              count > maxLength * 0.9 ? "text-warn" : "text-subtle",
            )}
          >
            {count}/{maxLength}
          </span>
        )}
      </div>
    ) : (
      control
    );

  // v1 call sites pass `label` directly — render the chrome for them.
  if (label !== undefined) {
    return (
      <Field
        label={label}
        error={error}
        hint={helperText}
        required={required}
        disabled={disabled}
        aiFilled={aiFilled}
      >
        {wrapped}
      </Field>
    );
  }

  return wrapped;
});

export default Input;
