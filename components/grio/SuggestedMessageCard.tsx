"use client";

import { useState } from "react";
import { Check, Copy, Send } from "lucide-react";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

/** The distinct "this line is meant to be sent" card — Copy always works, Send needs a recipient (scope). */
export default function SuggestedMessageCard({
  text,
  recipientName,
  onSend,
}: {
  text: string;
  recipientName: string | null;
  onSend: (text: string) => void;
}) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Copy nahi ho paya", tone: "error" });
    }
  }

  return (
    <div className="max-w-[85%] rounded-lg border border-gold-300/70 bg-gold-50 px-3.5 py-3 dark:border-gold-700/50 dark:bg-gold-900/20">
      <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-gold-700 dark:text-gold-300">
        Suggested message{recipientName ? ` · ${recipientName}` : ""}
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
          {recipientName ? `${recipientName} ko bhejein` : "Bhejein"}
        </Button>
      </div>
    </div>
  );
}
