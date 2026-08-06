"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { HeartHandshake, Send, Sparkles } from "lucide-react";
import Button from "@/components/ui/Button";
import MessageThreadHeader from "./MessageThreadHeader";
import MessageBubble from "./MessageBubble";
import QuizBattleCard from "@/components/quiz/QuizBattleCard";
import { useGrio } from "@/components/grio/GrioProvider";
import type { ThreadViewModel, MessageViewModel } from "@/lib/contracts/messages";

const POLL_MS = 4000;

/**
 * No websocket/SWR infra exists anywhere in this app yet (confirmed — every
 * other screen is one-shot fetch-on-action, same as the Reel swipe flow).
 * Simple interval polling while the thread is open, not a new dependency.
 */
export default function MessageThread({
  initial,
  viewerId,
  showReadReceipts,
  ghostingNudge,
  contactSlot,
}: {
  initial: ThreadViewModel;
  viewerId: string;
  /** Standard/Premium only (D-11) — whether ticks on the viewer's own sent messages show seen-status. */
  showReadReceipts: boolean;
  /** Phase E — server-computed once at page load; see ghostingShieldService for why not on every poll. */
  ghostingNudge?: { otherName: string; hoursSince: number } | null;
  /** Contact-share card, rendered by the server page so the number never reaches an unentitled client. */
  contactSlot?: ReactNode;
}) {
  const [messages, setMessages] = useState<MessageViewModel[]>(initial.messages);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { open: openGrio } = useGrio();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/messages/${initial.matchId}`);
        if (!res.ok) return;
        const json = await res.json();
        if (json.ok) setMessages(json.thread.messages);
      } catch {
        // silent — next tick retries
      }
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [initial.matchId]);

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setDraft("");

    const optimisticId = `pending-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: optimisticId, senderId: viewerId, body, createdAt: new Date().toISOString(), readAt: null },
    ]);

    try {
      const res = await fetch(`/api/messages/${initial.matchId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const json = await res.json();
      if (json.ok) {
        setMessages((prev) => prev.map((m) => (m.id === optimisticId ? json.message : m)));
      }
    } catch {
      // stays in the optimistic list; the next poll tick reconciles what actually landed
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <MessageThreadHeader
        other={initial.other}
        actions={
          <button
            type="button"
            onClick={() => openGrio({ matchId: initial.matchId, name: initial.other.displayName })}
            aria-label="Ask Grio"
            className="grid size-9 shrink-0 touch-target place-items-center rounded-full text-gold-700 transition-colors hover:bg-gold-50 dark:text-gold-300 dark:hover:bg-gold-900/30"
          >
            <Sparkles className="size-5" />
          </button>
        }
      />

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-4 sm:px-6">
        {ghostingNudge && !nudgeDismissed && (
          <div className="flex items-start gap-2 rounded-md border border-gold-300/60 bg-gold-50 px-3 py-2.5 dark:bg-gold-900/20">
            <HeartHandshake className="mt-0.5 size-4 shrink-0 text-gold-700" />
            <div className="min-w-0 flex-1">
              <p className="text-[0.8125rem] leading-snug text-gold-700">
                {ghostingNudge.otherName} ka message aapko {ghostingNudge.hoursSince} ghante pehle mila tha — ek
                chhota sa jawab rishta aage badha sakta hai.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setNudgeDismissed(true)}
              aria-label="Dismiss"
              className="shrink-0 text-[0.75rem] font-medium text-gold-700 underline underline-offset-2"
            >
              Theek hai
            </button>
          </div>
        )}
        {contactSlot}
        <QuizBattleCard matchId={initial.matchId} otherName={initial.other.displayName} />
        {messages.map((m) => (
          <MessageBubble
            key={m.id}
            message={m}
            own={m.senderId === viewerId}
            showReadReceipt={showReadReceipts}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="flex shrink-0 items-end gap-2 border-t border-line bg-surface px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] sm:px-6">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Message likhein…"
          rows={1}
          className="max-h-32 flex-1 resize-none rounded-md border border-line-strong bg-surface px-3.5 py-2.5 text-[0.9375rem] outline-none focus:border-gold-500 focus:shadow-[0_0_0_3px_rgb(201_169_110_/_0.18)]"
        />
        <Button size="icon" disabled={!draft.trim() || sending} onClick={send} ariaLabel="Send Message">
          <Send className="size-4" />
        </Button>
      </div>
    </div>
  );
}
