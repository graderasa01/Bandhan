"use client";

import { useState } from "react";
import { Check, Copy, Send } from "lucide-react";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * The distinct "this line is meant to be sent" card — Copy always works, Send
 * needs a recipient (scope).
 *
 * `heading`/`sendLabel` exist so Ask Bridge questions can use the same card:
 * both are a span of model-written text the user is about to send to a real
 * person, and both must stay editable at the next step. Only the words on the
 * label differ, which is not enough to justify a second component.
 */
export default function SuggestedMessageCard({
  text,
  recipientName,
  heading,
  sendLabel,
  onSend,
}: {
  text: string;
  recipientName: string | null;
  heading?: string;
  sendLabel?: string;
  onSend: (text: string) => void;
}) {
  const t = useT();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: t("grio.copyFailed", "Copy nahi ho paya"), tone: "error" });
    }
  }

  return (
    <div className="max-w-[85%] rounded-lg border border-gold-300/70 bg-gold-50 px-3.5 py-3 dark:border-gold-700/50 dark:bg-gold-900/20">
      <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-gold-700 dark:text-gold-300">
        {heading ?? t("grio.suggestedMessage", "Suggested message")}
        {recipientName ? ` · ${recipientName}` : ""}
      </p>
      <p className="mt-1 text-[0.875rem] italic leading-relaxed text-ink">&ldquo;{text}&rdquo;</p>
      <div className="mt-2.5 flex gap-2">
        <Button
          size="sm"
          variant="secondary"
          icon={copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          onClick={copy}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button size="sm" variant="accent" icon={<Send className="size-3.5" />} onClick={() => onSend(text)}>
          {sendLabel ?? (recipientName ? `Send to ${recipientName}` : "Send")}
        </Button>
      </div>
    </div>
  );
}
