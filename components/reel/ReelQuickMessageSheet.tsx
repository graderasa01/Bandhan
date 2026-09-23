"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, Lock, MessageCircle, Send } from "lucide-react";
import Sheet from "@/components/ui/Sheet";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n/LanguageProvider";

const MAX_LENGTH = 2000;

type State = { kind: "idle" } | { kind: "sending" } | { kind: "locked"; message: string } | { kind: "error"; message: string };

/**
 * Reply without leaving the reel — for a rishta that already happened.
 *
 * A matched person is in the feed (D-92b) and the rail's primary slot is the
 * chat on their card. Opening the full thread for "haan, kal baat karte hain"
 * meant leaving the feed, finding your place again, and scrolling back — the
 * exact round trip this rebuild removes. So the common case is a composer
 * here: type, send, keep browsing. The full conversation (history, voice,
 * everything) stays one tap away as "Open Chat".
 *
 * It writes through the one message endpoint (`/api/messages/[matchId]`),
 * which is also where the chat gate lives (`canChatInMatch` → D-90's
 * `getChatAccess`). A locked chat answers 402 and this sheet says so and
 * offers the thread, where the unlock is — it never tries to be a second
 * place a chat can be opened or paid for.
 *
 * Only ever offered on a matched card: before a match there is no chat, and
 * the honest pre-match message is a note on an interest (IcebreakerSheet).
 */
export default function ReelQuickMessageSheet({
  matchId,
  name,
  onClose,
  onSent,
}: {
  /** Null while closed. */
  matchId: string | null;
  name: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const t = useT();
  const [body, setBody] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const lastMatch = useRef<string | null>(null);

  // A different person is a different conversation: start clean. The same
  // person re-opened keeps an unsent draft.
  useEffect(() => {
    if (!matchId || matchId === lastMatch.current) return;
    lastMatch.current = matchId;
    setBody("");
    setState({ kind: "idle" });
  }, [matchId]);

  async function send() {
    const text = body.trim();
    if (!matchId || !text || state.kind === "sending") return;
    setState({ kind: "sending" });
    try {
      const res = await fetch(`/api/messages/${matchId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (res.status === 402) {
        setState({
          kind: "locked",
          message: json.message ?? t("reel.message.locked", "Ye chat abhi khuli nahi hai — Open Chat par unlock ka raasta hai."),
        });
        return;
      }
      if (!res.ok || !json.ok) {
        setState({ kind: "error", message: json.message ?? t("reel.message.failed", "Message nahi gaya — dobara try karein.") });
        return;
      }
      setBody("");
      setState({ kind: "idle" });
      onSent();
    } catch {
      setState({ kind: "error", message: t("reel.message.network", "Network problem — dobara try karein.") });
    }
  }

  const locked = state.kind === "locked";

  return (
    <Sheet
      open={matchId !== null}
      onClose={onClose}
      title={name}
      description={t("reel.message.subtitle", "Rishta jud chuka hai — yahin se jawab bhejiye")}
      variant="bottom"
    >
      <div className="flex flex-col gap-3 pb-1">
        {locked ? (
          <p className="flex items-start gap-2 rounded-lg border border-gold-300/60 bg-gold-50 px-3 py-2.5 text-[0.875rem] leading-snug text-ink dark:bg-gold-900/20">
            <Lock className="mt-0.5 size-4 shrink-0 text-gold-700" aria-hidden />
            <span className="min-w-0">{state.message}</span>
          </p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
            className="flex items-end gap-2"
          >
            <label className="sr-only" htmlFor="reel-quick-message">
              {t("reel.message.label", "Message")}
            </label>
            <textarea
              id="reel-quick-message"
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, MAX_LENGTH))}
              onKeyDown={(e) => {
                // Enter sends, Shift+Enter is a new line — the chat's own rule.
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={2}
              placeholder={t("reel.message.placeholder", "Namaste…")}
              className="min-h-12 flex-1 resize-none rounded-2xl border border-line-strong bg-surface px-3.5 py-3 text-[0.9375rem] leading-snug outline-none focus:border-gold-500 focus:shadow-[0_0_0_3px_rgb(201_169_110_/_0.18)]"
            />
            <button
              type="submit"
              disabled={!body.trim() || state.kind === "sending"}
              aria-label={t("reel.message.send", "Send")}
              className={cn(
                "grid size-12 shrink-0 place-items-center rounded-full bg-accent text-accent-fg transition-opacity",
                "disabled:opacity-40",
              )}
            >
              {state.kind === "sending" ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Send className="size-5" aria-hidden />}
            </button>
          </form>
        )}

        {state.kind === "error" && (
          <p role="alert" className="text-[0.8125rem] text-danger">
            {state.message}
          </p>
        )}

        {matchId && (
          <Link
            href={`/user/messages/${matchId}`}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-line-strong px-4 text-[0.875rem] font-semibold text-ink transition-colors hover:bg-bg-subtle"
          >
            <MessageCircle className="size-4" aria-hidden />
            {t("reel.lane.openChat", "Open Chat")}
          </Link>
        )}
      </div>
    </Sheet>
  );
}
