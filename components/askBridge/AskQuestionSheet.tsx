"use client";

import { useState } from "react";
import { HelpCircle, Loader2, Send } from "lucide-react";
import Sheet from "@/components/ui/Sheet";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import type { AskQuestionResponse } from "@/lib/contracts/askBridge";

const MAX_LENGTH = 300;

/**
 * D2's "Inse kuch poochho" — one typed question, answered only in voice.
 *
 * Unlike IcebreakerSheet, there is no Interest involved and no fallback
 * "just send" action: this either asks a real question or does nothing. The
 * recipient stays masked until they answer (see profileQuestionService), so
 * the copy here is careful never to promise the asker will be told anything
 * beyond "unhone jawab diya" — identity only travels the other way.
 */
export default function AskQuestionSheet({
  open,
  onClose,
  profileId,
  displayName,
  onAsked,
}: {
  open: boolean;
  onClose: () => void;
  profileId: string | null;
  displayName: string;
  /** Fires once the question is actually created (not on a no-op alreadyAsked reply). */
  onAsked?: () => void;
}) {
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  async function send() {
    if (!profileId || !text.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/profile-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId, questionText: text.trim() }),
      });
      const json = (await res.json()) as AskQuestionResponse;
      if (!res.ok || !json.ok) {
        toast({ title: "Sawaal nahi bheja ja saka", description: json.message, tone: "error" });
        return;
      }
      if (json.alreadyAsked) {
        toast({ title: "Aap inse pehle hi ek sawaal poochh chuke hain", tone: "info" });
      } else if (json.heldForReview) {
        toast({
          title: "Sawaal review me hai",
          description: "Check hote hi ye unhe pahunch jayega.",
          tone: "info",
        });
      } else {
        toast({ title: `${displayName} se sawaal poochh liya`, tone: "success" });
      }
      if (!json.alreadyAsked) onAsked?.();
      setText("");
      onClose();
    } catch {
      toast({ title: "Network error — dobara try karein", tone: "error" });
    } finally {
      setSending(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={`${displayName} se kuch poochein`} variant="bottom">
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-2 rounded-md border border-line bg-bg-subtle px-3 py-2.5">
          <HelpCircle className="mt-0.5 size-4 shrink-0 text-muted" />
          <p className="text-[0.8125rem] leading-snug text-muted">
            Wo aapko voice me jawab denge, tabhi unhe pata chalega ki poochne wale aap hain — aapki pehchaan
            unke jawab dene ke baad hi khulti hai.
          </p>
        </div>

        <div className="space-y-1">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX_LENGTH))}
            placeholder="Jaise: aapko ghoomna kaisa lagta hai?"
            rows={3}
            disabled={sending}
            className="w-full resize-none rounded-md border border-line-strong bg-surface px-3.5 py-2.5 text-[0.9375rem] outline-none focus:border-gold-500 focus:shadow-[0_0_0_3px_rgb(201_169_110_/_0.18)]"
          />
          <p className="text-right text-[0.6875rem] text-subtle">
            {text.length}/{MAX_LENGTH}
          </p>
        </div>

        <Button
          variant="primary"
          size="md"
          fullWidth
          disabled={!text.trim() || sending}
          onClick={send}
          icon={sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        >
          Sawaal Bhejein
        </Button>
      </div>
    </Sheet>
  );
}
