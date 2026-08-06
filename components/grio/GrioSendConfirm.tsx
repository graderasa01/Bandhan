"use client";

import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import Sheet from "@/components/ui/Sheet";

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
    <Sheet open={open} onClose={onCancel} variant="bottom" title={recipientName ? `Send to ${recipientName}` : "Send"}>
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
          Send
        </Button>
      </div>
    </Sheet>
  );
}
