"use client";

import { useState } from "react";
import { Loader2, Send, Sparkles } from "lucide-react";
import Sheet from "@/components/ui/Sheet";
import AiQuotaUpgradeCard from "@/components/reel/AiQuotaUpgradeCard";
import { cn } from "@/lib/utils";
import type { ReelAskResponse } from "@/lib/contracts/reel";

const EXAMPLES = [
  "Family thinking match karti hai kya?",
  "Relocation ke baare me kya sochte hain?",
  "Kaisi lifestyle hai?",
];

type ChatTurn = { question: string; answer?: string; error?: string };

export default function ReelAISheet({
  open,
  onClose,
  profileId,
  displayName,
}: {
  open: boolean;
  onClose: () => void;
  profileId: string | null;
  displayName: string;
}) {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [loading, setLoading] = useState(false);
  const [quota, setQuota] = useState<{ used: number; limit: number } | null>(null);
  const [quotaExceeded, setQuotaExceeded] = useState<string | null>(null);

  async function ask(q: string) {
    if (!profileId || !q.trim() || loading || quotaExceeded) return;
    setLoading(true);
    setQuestion("");
    setTurns((t) => [...t, { question: q }]);

    try {
      const res = await fetch("/api/reel/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId, question: q }),
      });
      const json = (await res.json()) as ReelAskResponse;
      if (json.quota) setQuota(json.quota);

      if (json.code === "quota_exceeded") {
        setQuotaExceeded(json.message ?? "Aaj ke sawaal khatam ho gaye.");
        setTurns((t) => t.slice(0, -1));
        return;
      }

      setTurns((t) => {
        const next = [...t];
        const last = next[next.length - 1];
        if (json.ok && json.answer) last.answer = json.answer;
        else last.error = json.message ?? "Jawab nahi mil paaya.";
        return next;
      });
    } catch {
      setTurns((t) => {
        const next = [...t];
        next[next.length - 1].error = "Network error — dobara try karein.";
        return next;
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={`${displayName} ke baare me poochiye`} variant="bottom">
      <div className="flex flex-col gap-3">
        {quota && (
          <p className="text-[0.75rem] font-medium text-subtle">
            {quota.used}/{quota.limit} aaj ke sawaal
          </p>
        )}

        {turns.length === 0 && !quotaExceeded && (
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => ask(ex)}
                className="rounded-full border border-wine-300/60 bg-wine-50 px-3 py-1.5 text-[0.8125rem] text-wine-700 transition-colors hover:bg-wine-100 dark:border-wine-400/25 dark:bg-wine-900/30 dark:text-wine-200"
              >
                {ex}
              </button>
            ))}
          </div>
        )}

        <div className="max-h-[40dvh] space-y-3 overflow-y-auto">
          {turns.map((t, i) => (
            <div key={i} className="space-y-1.5">
              <p className="ml-auto w-fit max-w-[85%] rounded-lg rounded-tr-sm bg-gold-100 px-3 py-2 text-[0.8125rem] text-ink dark:bg-gold-900/40">
                {t.question}
              </p>
              {t.answer && (
                <p className="flex w-fit max-w-[85%] items-start gap-1.5 rounded-lg rounded-tl-sm border border-line bg-surface px-3 py-2 text-[0.8125rem] text-ink">
                  <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary-text" />
                  {t.answer}
                </p>
              )}
              {t.error && (
                <p className="w-fit max-w-[85%] rounded-lg rounded-tl-sm border border-danger/30 bg-danger-bg px-3 py-2 text-[0.8125rem] text-danger">
                  {t.error}
                </p>
              )}
            </div>
          ))}
          {loading && <Loader2 className="size-4 animate-spin text-muted" aria-label="Thinking" />}
        </div>

        {quotaExceeded ? (
          <AiQuotaUpgradeCard message={quotaExceeded} />
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(question);
            }}
            className="mt-1 flex items-center gap-2"
          >
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Kuch bhi poochiye..."
              className="h-12 flex-1 rounded-full border border-line-strong bg-surface px-4 text-[0.9375rem] outline-none focus:border-gold-500 focus:shadow-[0_0_0_3px_rgb(201_169_110_/_0.18)]"
            />
            <button
              type="submit"
              disabled={loading || !question.trim()}
              aria-label="Send"
              className={cn(
                "grid size-12 shrink-0 touch-target place-items-center rounded-full",
                "bg-gradient-to-b from-gold-400 to-gold-600 text-primary-fg shadow-gold transition-opacity",
                "disabled:opacity-40",
              )}
            >
              <Send className="size-4" />
            </button>
          </form>
        )}
      </div>
    </Sheet>
  );
}
