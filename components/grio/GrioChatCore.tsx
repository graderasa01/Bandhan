"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Loader2, Sparkles, Send, X } from "lucide-react";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { useGrio } from "./GrioProvider";
import GrioMatchPicker from "./GrioMatchPicker";
import GrioSendConfirm from "./GrioSendConfirm";
import SuggestedMessageCard from "./SuggestedMessageCard";
import {
  SEND_MARKER_START,
  SEND_MARKER_END,
  type ConciergeMessage,
  type ConciergeMatchOption,
  type ConciergeResponse,
} from "@/lib/contracts/concierge";

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

type Segment = { type: "text"; value: string } | { type: "send"; value: string };

function parseSegments(content: string): Segment[] {
  const segments: Segment[] = [];
  let rest = content;
  while (rest.length > 0) {
    const startIdx = rest.indexOf(SEND_MARKER_START);
    if (startIdx === -1) {
      segments.push({ type: "text", value: rest });
      break;
    }
    if (startIdx > 0) segments.push({ type: "text", value: rest.slice(0, startIdx) });
    const afterStart = rest.slice(startIdx + SEND_MARKER_START.length);
    const endIdx = afterStart.indexOf(SEND_MARKER_END);
    if (endIdx === -1) {
      segments.push({ type: "text", value: rest.slice(startIdx) });
      break;
    }
    const value = afterStart.slice(0, endIdx).trim();
    if (value) segments.push({ type: "send", value });
    rest = afterStart.slice(endIdx + SEND_MARKER_END.length);
  }
  return segments;
}

/**
 * The chat engine, shared by the global overlay (components/grio/GrioOverlay)
 * and the standalone /user/concierge page. Scope (which match, if any, Grio
 * is helping message) lives in GrioProvider, not local state — so the in-chat
 * "Ask Grio" button and the picker both feed the same place.
 */
export default function GrioChatCore({ compact = false }: { compact?: boolean }) {
  const { scope, setScope } = useGrio();
  const { toast } = useToast();
  const router = useRouter();

  const [messages, setMessages] = useState<ConciergeMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<{ text: string; matchId: string; name: string } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
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
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-6">
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
          const segments = parseSegments(m.content);
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
                ) : (
                  <div
                    key={j}
                    className="max-w-[85%] rounded-lg border border-line bg-surface px-3.5 py-2.5 text-[0.875rem] leading-relaxed text-ink"
                  >
                    {seg.value}
                  </div>
                ),
              )}
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

      <div className="flex shrink-0 items-end gap-2 border-t border-line bg-surface px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] sm:px-6">
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
