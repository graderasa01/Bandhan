"use client";

import { useState } from "react";
import { Check, Pencil, User, Users } from "lucide-react";
import { MINIMUM_LIVE_FIELDS } from "@/lib/profile/readiness";
import { isValidFieldValue } from "@/lib/profile/readiness";
import { normalizeAnswer, type BoloValues } from "@/lib/bolo/draft";
import type { FillingFor } from "@/lib/contracts/interview";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n/LanguageProvider";
import { CONTROL_BASE, CONTROL_SIZE } from "@/components/ui/Input";

/**
 * The profile, as eight rows.
 *
 * Exactly the minimum a live profile needs, each ticking over from "…" to its
 * value as an answer is saved. While the conversation runs it lives folded in
 * `ProfileSheet` — the proof that answering is doing something, one tap away —
 * and once everything is in it is the review screen itself: tap a row to
 * correct it by hand. The same component in both roles, so a fix on the review
 * step looks like the thing that was just being filled.
 */
export default function ProfileFillCard({
  values,
  fillingFor,
  editable,
  onChange,
  highlight,
  showHeader = true,
  className,
}: {
  values: BoloValues;
  fillingFor: FillingFor | null;
  /** Rows can be tapped and edited. */
  editable: boolean;
  onChange?: (key: string, value: string) => void;
  /** Keys saved in the latest turn — flashed once so the eye lands on them. */
  highlight?: string[];
  /** The title-and-progress row. Off inside a sheet that already carries both. */
  showHeader?: boolean;
  className?: string;
}) {
  const t = useT();
  const [editing, setEditing] = useState<string | null>(null);
  const done = MINIMUM_LIVE_FIELDS.filter((f) => isValidFieldValue(f, values[f.key])).length;
  const Who = fillingFor === "self" || fillingFor === null ? User : Users;

  return (
    <section className={cn("rounded-2xl border border-line bg-surface shadow-md", className)}>
      {showHeader && (
        <header className="flex items-center gap-3 border-b border-line px-4 py-3">
          <span className="bt-ring [--paper-ring-size:2.25rem]">
            <Who className="size-[17px]" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[0.9375rem] font-semibold text-ink">
              {fillingFor === "son"
                ? t("bolo.card.titleSon", "Bete ki profile")
                : fillingFor === "daughter"
                  ? t("bolo.card.titleDaughter", "Beti ki profile")
                  : t("bolo.card.title", "Aapki profile")}
            </p>
            <p className="text-xs text-muted">
              {done}/{MINIMUM_LIVE_FIELDS.length} {t("bolo.card.progress", "bhar gaye")}
            </p>
          </div>
          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-bg-subtle" aria-hidden>
            <div
              className="h-full rounded-full bg-trust transition-[width] duration-500"
              style={{ width: `${(done / MINIMUM_LIVE_FIELDS.length) * 100}%` }}
            />
          </div>
        </header>
      )}

      <ul className="divide-y divide-line">
        {MINIMUM_LIVE_FIELDS.map((field) => {
          const raw = values[field.key] ?? "";
          const valid = isValidFieldValue(field, raw);
          const isEditing = editable && editing === field.key;
          const flash = highlight?.includes(field.key);
          return (
            <li
              key={field.key}
              className={cn(
                "flex min-h-12 items-center gap-3 px-4 py-2 transition-colors duration-700",
                flash && "bg-trust-bg",
              )}
            >
              <span
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full border text-[10px]",
                  valid ? "border-trust bg-trust text-white" : "border-line-strong text-subtle",
                )}
                aria-hidden
              >
                {valid ? <Check className="size-3.5" /> : null}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[0.6875rem] uppercase tracking-wide text-muted">{field.label}</p>
                {isEditing ? (
                  <FieldEditor
                    fieldKey={field.key}
                    type={field.type}
                    options={field.options}
                    value={raw}
                    placeholder={field.placeholder}
                    onCommit={(next) => {
                      onChange?.(field.key, next);
                      setEditing(null);
                    }}
                    onCancel={() => setEditing(null)}
                  />
                ) : (
                  <p className={cn("truncate text-[0.9375rem]", valid ? "font-medium text-ink" : "text-subtle")}>
                    {raw ? raw : editable ? t("bolo.card.tapToFill", "Tap karke bharein") : "…"}
                  </p>
                )}
              </div>
              {editable && !isEditing && (
                <button
                  type="button"
                  onClick={() => setEditing(field.key)}
                  className="grid size-10 shrink-0 place-items-center rounded-full text-muted hover:bg-bg-subtle hover:text-ink"
                  aria-label={`${t("bolo.card.edit", "Edit")} ${field.label}`}
                >
                  <Pencil className="size-4" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function FieldEditor({
  fieldKey,
  type,
  options,
  value,
  placeholder,
  onCommit,
  onCancel,
}: {
  fieldKey: string;
  type: string;
  options?: string[];
  value: string;
  placeholder?: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState(value);
  const control = cn(CONTROL_BASE, CONTROL_SIZE.sm, "mt-1 border-line-strong");

  if (type === "select" && options) {
    return (
      <select
        autoFocus
        className={cn(control, "cursor-pointer")}
        value={options.includes(draft) ? draft : ""}
        onChange={(e) => onCommit(e.target.value)}
        onBlur={onCancel}
      >
        <option value="" disabled>
          {t("bolo.card.choose", "Choose")}
        </option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      autoFocus
      className={control}
      value={draft}
      placeholder={placeholder}
      inputMode={type === "date" ? "numeric" : "text"}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onCommit(normalizeAnswer(fieldKey, draft));
        if (e.key === "Escape") onCancel();
      }}
      onBlur={() => onCommit(normalizeAnswer(fieldKey, draft))}
    />
  );
}
