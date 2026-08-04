"use client";

import { useEffect, useState } from "react";
import { Check, Quote, Sparkles, Trash2 } from "lucide-react";
import { FIELD_BY_KEY, questionFor } from "@/lib/profile/fields";
import { useProfile } from "@/lib/profile/profileState";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/motion";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import Sheet from "@/components/ui/Sheet";

/**
 * Fix one captured value.
 *
 * Extraction is confident, not correct — so every value it produced has to be
 * reachable and changeable, or a misheard city sits on the profile forever. The
 * screen also shows *where* the value came from: "ye kahan se aaya?" is the
 * first thing anyone asks about a field they did not type, and `sourceSpan`
 * already holds the answer.
 *
 * Editing re-stamps provenance as the user's own. A value they corrected must
 * stop carrying an AI confidence badge that vouches for the old reading.
 */
export default function FieldEditSheet({
  fieldKey,
  onClose,
}: {
  fieldKey: string | null;
  onClose: () => void;
}) {
  const { draft, editField, clearField } = useProfile();
  const field = fieldKey ? FIELD_BY_KEY[fieldKey] : undefined;
  const current = fieldKey ? (draft.values[fieldKey] ?? "") : "";
  const meta = fieldKey ? draft.meta[fieldKey] : undefined;

  const [value, setValue_] = useState(current);

  // Reset the buffer whenever a different field is opened.
  useEffect(() => {
    setValue_(current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldKey]);

  const forSelf = draft.fillingFor === "self";
  const multi = field?.type === "multiselect";
  const picked = multi ? value.split(",").map((s) => s.trim()).filter(Boolean) : [];

  function save() {
    if (!fieldKey) return;
    const next = value.trim();
    if (next.length === 0) {
      clearField(fieldKey);
    } else {
      haptic("success");
      editField(fieldKey, next);
    }
    onClose();
  }

  /*
   * One Sheet whose `open` toggles, never two Sheets swapped by an early
   * return. Returning a different <Sheet> element when there is nothing to edit
   * leaves the open one mounted — it stops closing on save, Escape or the close
   * button, and keeps showing values that state has already moved past.
   */
  return (
    <Sheet
      open={Boolean(field && fieldKey)}
      onClose={onClose}
      title={field?.label}
      variant="bottom"
    >
      {!field || !fieldKey ? null : (
      <>
      <p className="text-[0.9375rem] leading-relaxed text-muted">
        {questionFor(field, forSelf)}
      </p>

      {/* Provenance. The user never typed this, so they are owed the sentence it
          came out of. */}
      {meta?.sourceSpan && (
        <p className="mt-3 flex items-start gap-2.5 rounded-md border border-line bg-bg-subtle px-3.5 py-2.5 text-[0.8125rem] leading-snug text-muted">
          <Quote className="mt-0.5 size-3.5 shrink-0 text-subtle" />
          <span>
            Aapne kaha tha: <span className="italic text-ink">&ldquo;{meta.sourceSpan}&rdquo;</span>
          </span>
        </p>
      )}
      {meta?.inferredFrom && (
        <p className="mt-3 flex items-start gap-2.5 rounded-md border border-info/25 bg-info-bg px-3.5 py-2.5 text-[0.8125rem] leading-snug text-muted">
          <Sparkles className="mt-0.5 size-3.5 shrink-0 text-info" />
          <span>
            Ye aapne bataya nahi tha — <span className="text-ink">{meta.inferredFrom}</span>
          </span>
        </p>
      )}

      <div className="mt-5">
        {field.options ? (
          <div className="flex flex-wrap gap-2">
            {field.options.map((o) => {
              const on = multi ? picked.includes(o) : value === o;
              return (
                <button
                  key={o}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    haptic("select");
                    if (!multi) {
                      setValue_(o);
                      return;
                    }
                    const next = on ? picked.filter((p) => p !== o) : [...picked, o];
                    setValue_(next.join(", "));
                  }}
                  className={cn(
                    "min-h-12 touch-target rounded-full border px-4 text-sm font-medium transition-all active:scale-95",
                    on
                      ? "border-primary bg-primary text-primary-fg shadow-sm"
                      : "border-line-strong bg-surface text-ink hover:border-gold-500 hover:bg-gold-50 dark:hover:bg-gold-900/30",
                  )}
                >
                  {o}
                </button>
              );
            })}
          </div>
        ) : field.type === "textarea" ? (
          <Textarea
            value={value}
            rows={4}
            aria-label={field.label}
            placeholder={field.placeholder}
            onChange={(e) => setValue_(e.target.value)}
          />
        ) : (
          <Input
            autoFocus
            value={value}
            aria-label={field.label}
            placeholder={field.placeholder ?? (field.type === "date" ? "DD/MM/YYYY" : undefined)}
            onChange={(e) => setValue_(e.target.value)}
          />
        )}
      </div>

      <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
        <Button onClick={save} className="sm:flex-1" disabled={value.trim() === current.trim()}>
          <Check className="size-4" />
          Theek hai
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            haptic("tap");
            if (fieldKey) clearField(fieldKey);
            onClose();
          }}
        >
          <Trash2 className="size-4" />
          Hata dijiye
        </Button>
      </div>

      <p className="mt-4 text-[0.75rem] leading-snug text-subtle">
        Hatane par ye sawaal dobara poochha jayega.
      </p>
      </>
      )}
    </Sheet>
  );
}
