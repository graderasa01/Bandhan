"use client";

import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import Sheet from "@/components/ui/Sheet";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * Last stop before a message actually leaves — always editable, never auto-fired.
 *
 * Phase H reuses it for Ask Bridge questions, which is why the title, ceiling
 * and helper line are overridable. The two flows want the same thing in the
 * same shape — a suggestion the user can rewrite up to the last keystroke — and
 * a second near-identical sheet would only be a second place for that promise
 * to quietly stop being true.
 */
export default function GrioSendConfirm({
  open,
  recipientName,
  initialText,
  title,
  note,
  maxLength = 2000,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  recipientName: string | null;
  initialText: string;
  /** Overrides the default "Send to {name}" heading. */
  title?: string;
  /** One line above the box — used to state a cost or a one-shot rule. */
  note?: string;
  maxLength?: number;
  onCancel: () => void;
  onConfirm: (text: string) => void;
}) {
  const t = useT();
  const [text, setText] = useState(initialText);

  useEffect(() => {
    if (open) setText(initialText);
  }, [open, initialText]);

  return (
    <Sheet
      open={open}
      onClose={onCancel}
      variant="bottom"
      title={
        title ??
        (recipientName
          ? `${t("grio.sendConfirm.sendToPrefix", "Send to")} ${recipientName}`
          : t("grio.sendConfirm.send", "Send"))
      }
    >
      {note ? <p className="mb-2 text-[0.8125rem] text-muted">{note}</p> : null}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, maxLength))}
        rows={4}
        className="w-full resize-none rounded-md border border-line-strong bg-surface px-3.5 py-2.5 text-[0.9375rem] outline-none focus:border-gold-500 focus:shadow-[0_0_0_3px_rgb(201_169_110_/_0.18)]"
      />
      <div className="mt-3 flex gap-2">
        <Button variant="secondary" fullWidth onClick={onCancel}>
          {t("grio.sendConfirm.cancel", "Cancel")}
        </Button>
        <Button variant="accent" fullWidth disabled={!text.trim()} onClick={() => onConfirm(text.trim())}>
          {t("grio.sendConfirm.send", "Send")}
        </Button>
      </div>
    </Sheet>
  );
}
