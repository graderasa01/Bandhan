"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BrainCircuit, FileText, Loader2, Sparkles, Send, X } from "lucide-react";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { useGrio } from "./GrioProvider";
import GrioMatchPicker from "./GrioMatchPicker";
import GrioSendConfirm from "./GrioSendConfirm";
import GrioActionChips, { type GrioActionRequest } from "./GrioActionChips";
import GrioDeck from "./GrioDeck";
import GrioMemoryPanel from "./GrioMemoryPanel";
import SuggestedMessageCard from "./SuggestedMessageCard";
import {
  type ConciergeMessage,
  type ConciergeMatchOption,
  type ConciergeResponse,
} from "@/lib/contracts/concierge";
import { parseGrioSegments } from "@/lib/contracts/grio";

const GENERAL_STARTERS = [
  "Achhi bio kaise likhun?",
  "Pehli baat-cheet me kya poochun?",
  "Family ko kaise convince karun?",
];

const scopedStarters = (name: string) => [
  `${name} ko pehla message kya likhun?`,
  "Ek achha icebreaker line do",
  "Inke last message ka reply likhne me madad karo",
  "Ek pyari line ya quote suggest karo",
];

/**
 * The rail above the composer — doc 11 §3.4.
 *
 * Fixed: same four, same order, every session, scoped or not. They deliberately
 * do not react to context, because a rail that reshuffles is a rail nobody
 * builds muscle memory for — the user's thumb should know where "My pending"
 * is before their eyes find it. Contextual suggestions already have a home:
 * the buttons Grio proposes inside a reply.
 *
 * Labels are English per the app's CTA convention; the question each one sends
 * is Hinglish, like the rest of the conversation.
 */
const SHORTCUTS: { label: string; ask: string }[] = [
  { label: "My pending", ask: "Mera abhi kya pending hai?" },
  { label: "Today's matches", ask: "Aaj ke rishtey kaise chal rahe hain?" },
  { label: "Write a message", ask: "Kisi ko message likhne me meri madad karo" },
  { label: "Improve profile", ask: "Meri profile me kya sudhaar kar sakta hoon?" },
];

/**
 * The chat engine, shared by the global overlay (components/grio/GrioOverlay)
 * and the standalone /user/concierge page. Scope (which match, if any, Grio
 * is helping message) lives in GrioProvider, not local state — so the in-chat
 * "Ask Grio" button and the picker both feed the same place.
 */
export default function GrioChatCore({
  compact = false,
  standalone = false,
}: {
  compact?: boolean;
  /**
   * True on the full-page `/user/concierge` entry, false inside the overlay.
   * The overlay stays mounted on every `/user/*` page even while closed, so
   * the deck uses this to tell "the user is looking at me" from "I exist" —
   * without it, every page load would fetch cards nobody is looking at.
   */
  standalone?: boolean;
}) {
  const { scope, setScope } = useGrio();
  const { toast } = useToast();
  const router = useRouter();

  const [messages, setMessages] = useState<ConciergeMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<{ text: string; matchId: string; name: string } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Not on an empty conversation: with the deck at the top of this scroller,
    // jumping to the bottom on mount would scroll the cards out of view before
    // the user has seen them.
    if (messages.length === 0) return;
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  async function ask(text: string) {
    const content = text.trim();
    if (!content || sending) return;
    setError(null);
    setDraft("");
    const next: ConciergeMessage[] = [...messages, { role: "user", content }];
    setMessages(next);
    setSending(true);

    try {
      const res = await fetch("/api/concierge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.slice(-12), matchId: scope?.matchId }),
      });
      const json = (await res.json()) as ConciergeResponse;
      if (!res.ok || !json.ok || !json.reply) {
        setError(json.message ?? "Jawab nahi mila — dobara try karein.");
        return;
      }
      setMessages((prev) => [...prev, { role: "assistant", content: json.reply! }]);
    } catch {
      setError("Network error — dobara try karein.");
    } finally {
      setSending(false);
    }
  }

  async function sendToMatch(text: string, matchId: string, name: string) {
    try {
      const res = await fetch(`/api/messages/${matchId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Bhej nahi paye", description: json.message ?? "Dobara try karein.", tone: "error" });
        return;
      }
      toast({
        title: `Bhej diya ${name} ko ✓`,
        tone: "success",
        action: { label: "Chat kholein", onClick: () => router.push(`/user/messages/${matchId}`) },
      });
    } catch {
      toast({ title: "Network error — dobara try karein", tone: "error" });
    }
  }

  function handleSendClick(text: string) {
    if (scope) {
      setConfirmState({ text, matchId: scope.matchId, name: scope.name });
      return;
    }
    setPendingText(text);
    setPickerOpen(true);
  }

  function handlePick(match: ConciergeMatchOption) {
    setScope({ matchId: match.matchId, name: match.name });
    setPickerOpen(false);
    if (pendingText) {
      setConfirmState({ text: pendingText, matchId: match.matchId, name: match.name });
      setPendingText(null);
    }
  }

  function handleConfirmSend(finalText: string) {
    if (!confirmState) return;
    void sendToMatch(finalText, confirmState.matchId, confirmState.name);
    setConfirmState(null);
  }

  const starters = scope ? scopedStarters(scope.name) : GENERAL_STARTERS;

  return (
    <div className={cn("flex h-full min-h-0 flex-1 flex-col", compact ? "" : "")}>
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-2.5 sm:px-6">
        {scope ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-gold-300 bg-gold-50 py-1 pl-3 pr-1.5 text-[0.75rem] font-medium text-gold-700 dark:border-gold-700/50 dark:bg-gold-900/20 dark:text-gold-300">
            💬 {scope.name} ke liye
            <button
              type="button"
              onClick={() => setScope(null)}
              aria-label="Scope hataayein"
              className="grid size-5 place-items-center rounded-full hover:bg-gold-200/60 dark:hover:bg-gold-800/40"
            >
              <X className="size-3" />
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="rounded-full border border-line px-3 py-1 text-[0.75rem] text-muted transition-colors hover:border-gold-400 hover:text-ink"
          >
            + Kisi ko bhejna hai?
          </button>
        )}

        <button
          type="button"
          onClick={() => setMemoryOpen(true)}
          aria-label="Grio kya yaad rakhta hai"
          className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-[0.75rem] text-muted transition-colors hover:border-gold-400 hover:text-ink"
        >
          <BrainCircuit className="size-3.5" />
          Memory
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-6">
        {/* Above the conversation and inside the same scroller: the first thing
            on open, and out of the way once there is a conversation to read. */}
        <GrioDeck standalone={standalone} />

        {messages.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-wine-100 text-wine-700 dark:bg-wine-900/50 dark:text-wine-300">
              <Sparkles className="size-5" />
            </span>
            <p className="max-w-xs text-[0.8125rem] text-muted">
              {scope
                ? `${scope.name} ke saath rishtey me madad ke liye poochiye — icebreaker, reply, ya kuch aur.`
                : "Rishtey ke safar me general guidance ke liye poochiye — kisi specific profile ke baare me nahi, wo faisla hamesha aapka apna hai."}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {starters.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => ask(s)}
                  className="rounded-full border border-line px-3 py-1.5 text-[0.75rem] text-muted transition-colors hover:border-gold-400 hover:text-ink"
                >
                  {s}
                </button>
              ))}
            </div>

            {!scope && (
              <Link
                href="/user/biodata"
                className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-gold-300 bg-gold-50 px-3 py-1.5 text-[0.75rem] font-medium text-gold-700 transition-colors hover:border-gold-500 dark:border-gold-700/50 dark:bg-gold-900/20 dark:text-gold-300"
              >
                <FileText className="size-3.5" />
                Parents ke liye biodata banao
              </Link>
            )}
          </div>
        )}

        {messages.map((m, i) => {
          if (m.role === "user") {
            return (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] rounded-lg bg-gradient-to-b from-gold-400 to-gold-600 px-3.5 py-2.5 text-[0.875rem] leading-relaxed text-primary-fg">
                  {m.content}
                </div>
              </div>
            );
          }
          const segments = parseGrioSegments(m.content);
          // Actions are collected and rendered as one row under the reply
          // rather than inline where the marker happened to land. The model
          // controls *which* buttons appear, never where they sit — a chip
          // wedged mid-sentence reads as part of the sentence.
          const actions: GrioActionRequest[] = segments
            .filter((seg): seg is Extract<typeof seg, { type: "action" }> => seg.type === "action")
            .map(({ key, arg }) => ({ key, arg }));

          return (
            <div key={i} className="flex flex-col items-start gap-2">
              {segments.map((seg, j) =>
                seg.type === "send" ? (
                  <SuggestedMessageCard
                    key={j}
                    text={seg.value}
                    recipientName={scope?.name ?? null}
                    onSend={handleSendClick}
                  />
                ) : seg.type === "text" ? (
                  <div
                    key={j}
                    className="max-w-[85%] rounded-lg border border-line bg-surface px-3.5 py-2.5 text-[0.875rem] leading-relaxed text-ink"
                  >
                    {seg.value}
                  </div>
                ) : null,
              )}
              <GrioActionChips actions={actions} />
            </div>
          );
        })}

        {sending && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3.5 py-2.5 text-muted">
              <Loader2 className="size-3.5 animate-spin" />
              <span className="text-[0.8125rem]">Soch rahe hain…</span>
            </div>
          </div>
        )}

        {error && <p className="text-center text-[0.75rem] text-danger">{error}</p>}
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 border-t border-line bg-surface">
        <div className="flex gap-2 overflow-x-auto px-4 pt-2.5 [scrollbar-width:none] sm:px-6 [&::-webkit-scrollbar]:hidden">
          {SHORTCUTS.map((s) => (
            <button
              key={s.label}
              type="button"
              disabled={sending}
              onClick={() => ask(s.ask)}
              className="shrink-0 rounded-full border border-line px-3 py-1.5 text-[0.75rem] text-muted transition-colors hover:border-gold-400 hover:text-ink disabled:opacity-50"
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex shrink-0 items-end gap-2 bg-surface px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] sm:px-6">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 1000))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              ask(draft);
            }
          }}
          placeholder="Apna sawaal likhein…"
          rows={1}
          disabled={sending}
          className="max-h-32 flex-1 resize-none rounded-md border border-line-strong bg-surface px-3.5 py-2.5 text-[0.9375rem] outline-none focus:border-gold-500 focus:shadow-[0_0_0_3px_rgb(201_169_110_/_0.18)]"
        />
        <Button size="icon" disabled={!draft.trim() || sending} onClick={() => ask(draft)} ariaLabel="Bhejein">
          <Send className="size-4" />
        </Button>
      </div>

      <GrioMemoryPanel open={memoryOpen} onClose={() => setMemoryOpen(false)} />
      <GrioMatchPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onPick={handlePick} />
      <GrioSendConfirm
        open={confirmState !== null}
        recipientName={confirmState?.name ?? null}
        initialText={confirmState?.text ?? ""}
        onCancel={() => setConfirmState(null)}
        onConfirm={handleConfirmSend}
      />
    </div>
  );
}
