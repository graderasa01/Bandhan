"use client";

import { forwardRef, useState, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import Field, { useField } from "@/components/ui/Field";
import { CONTROL_BASE } from "@/components/ui/Input";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** v1 API — when passed, field chrome is rendered for you. */
  label?: string;
  error?: string;
  helperText?: string;
  /** v1 name */
  showCharCount?: boolean;
  /** v2 alias */
  showCount?: boolean;
  /** Grow with content instead of scrolling. */
  autoGrow?: boolean;
  aiFilled?: { confidence: number; source?: string };
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  {
    label,
    error,
    helperText,
    className,
    rows = 4,
    maxLength,
    showCharCount,
    showCount,
    autoGrow,
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
  const withCount = showCharCount || showCount;

  const control = (
    <div className="relative">
      <textarea
        ref={ref}
        id={field?.id ?? props.id}
        rows={rows}
        required={required}
        disabled={disabled ?? field?.disabled}
        maxLength={maxLength}
        aria-invalid={invalid || undefined}
        aria-describedby={
          field ? (field.invalid ? field.errorId : field.hintId) : undefined
        }
        onChange={(e) => {
          if (withCount) setCount(e.target.value.length);
          if (autoGrow) {
            e.target.style.height = "auto";
            e.target.style.height = `${e.target.scrollHeight}px`;
          }
          onChange?.(e);
        }}
        className={cn(
          CONTROL_BASE,
          "resize-y px-4 py-3 text-[0.9375rem] leading-relaxed",
          autoGrow && "resize-none overflow-hidden",
          invalid
            ? "border-danger focus:border-danger focus:shadow-[0_0_0_3px_rgb(169_42_28_/_0.15)]"
            : "border-line-strong",
          withCount && "pb-8",
          className,
        )}
        {...props}
      />

      {withCount && maxLength && (
        <span
          className={cn(
            "pointer-events-none absolute bottom-2.5 right-3 text-[0.6875rem] tabular-nums",
            count > maxLength * 0.9 ? "text-warn" : "text-subtle",
          )}
        >
          {count}/{maxLength}
        </span>
      )}
    </div>
  );

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
        {control}
      </Field>
    );
  }

  return control;
});

export default Textarea;
