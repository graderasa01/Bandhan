"use client";

import { useEffect, useRef, useState } from "react";
import { Gift, Loader2, Mic, PenLine, Send, Sparkles } from "lucide-react";
import Sheet from "@/components/ui/Sheet";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import VoiceRecorder, { type RecordedVoice } from "@/components/voice/VoiceRecorder";
import { cn } from "@/lib/utils";
import type { Celebration } from "@/components/ui/CelebrationHost";
import type { ReelIcebreakerResponse, ReelMission } from "@/lib/contracts/reel";
import { useT } from "@/components/i18n/LanguageProvider";

const MAX_LENGTH = 300;

type Mode = "voice" | "text";

/**
 * Fires after a RIGHT swipe that didn't produce an immediate mutual match —
 * the interest itself is already sent (deterministic, D-32-safe); this is
 * strictly an optional opening line on top of it, in voice or in text.
 *
 * ## Why voice lives here and not on a fifth action button
 *
 * The action bar is a four-column grid of 48px targets. A fifth one breaks
 * D-23 at 320px, and "record audio" is not a swipe-sized decision anyway — it
 * needs a prompt, a countdown, and a listen-back. Offering it *after* the
 * interest has landed also means a user who abandons the recording still sent
 * the interest, rather than losing both.
 *
 * ## Why the voice note doesn't cost a second Interest
 *
 * `sendVoiceNote` goes through `sendInterest`, which is an upsert: the interest
 * row already exists from the swipe, so the monthly quota is not charged
 * twice. One contact, one cost, regardless of how many ways it was expressed.
 */
export default function IcebreakerSheet({
  open,
  onClose,
  profileId,
  displayName,
  voiceEnabled = false,
  mission = null,
  voiceQuest = null,
  onCelebration,
}: {
  open: boolean;
  onClose: () => void;
  profileId: string | null;
  displayName: string;
  voiceEnabled?: boolean;
  mission?: ReelMission | null;
  voiceQuest?: { title: string; rewardLabel: string } | null;
  onCelebration?: (c: Celebration) => void;
}) {
  const { toast } = useToast();
  const t = useT();
  const [mode, setMode] = useState<Mode>("voice");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [recorded, setRecorded] = useState<RecordedVoice | null>(null);
  const requestedFor = useRef<string | null>(null);

  // Voice is the default only when it's actually available; otherwise the
  // sheet must open on something the user can use.
  useEffect(() => {
    if (open) setMode(voiceEnabled ? "voice" : "text");
  }, [open, voiceEnabled]);

  // The AI opening line costs a call, so only fetch it if the user goes to the
  // text tab — most won't when voice is offered.
  useEffect(() => {
    if (!open || mode !== "text" || !profileId || requestedFor.current === profileId) return;
    requestedFor.current = profileId;
    setLoading(true);
    setMessage("");

    fetch("/api/reel/icebreaker", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId }),
    })
      .then((r) => r.json())
      .then((json: ReelIcebreakerResponse) => {
        if (json.ok && json.suggestion) setMessage(json.suggestion.slice(0, MAX_LENGTH));
        // Generation failed or no key configured — empty textarea, interest is already sent regardless.
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, mode, profileId]);

  useEffect(() => {
    if (!open) {
      requestedFor.current = null;
      setRecorded(null);
    }
  }, [open]);

  async function sendWithMessage() {
    if (!profileId || !message.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/reel/icebreaker", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId, message: message.trim() }),
      });
      const json = (await res.json()) as ReelIcebreakerResponse;
      if (json.ok) {
        toast({ title: t("reel.icebreakerSheet.messageSent", "Message bhej diya"), tone: "success" });
        onClose();
      } else {
        toast({
          title: t("reel.icebreakerSheet.messageSendFailed", "Message nahi bheja ja saka"),
          description: json.message,
          tone: "error",
        });
      }
    } catch {
      toast({ title: t("reel.icebreakerSheet.networkError", "Network error — dobara try karein"), tone: "error" });
    } finally {
      setSending(false);
    }
  }

  async function sendVoice() {
    if (!profileId || !recorded || sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/voice-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId, mediaId: recorded.mediaId }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({
          title: t("reel.icebreakerSheet.voiceSendFailed", "Voice note nahi bheji ja saki"),
          description: json.message,
          tone: "error",
        });
        return;
      }

      if (json.heldForReview) {
        toast({
          title: t("reel.icebreakerSheet.reviewTitle", "Recording review me hai"),
          description: t("reel.icebreakerSheet.reviewDescription", "Check hote hi ye unhe pahunch jayegi."),
          tone: "info",
        });
      } else {
        toast({
          title: `${displayName} ${t("reel.icebreakerSheet.voiceSent", "ko voice note bhej di")}`,
          tone: "success",
        });
      }

      if (json.celebration) onCelebration?.(json.celebration);
      onClose();
    } catch {
      toast({ title: t("reel.icebreakerSheet.networkError", "Network error — dobara try karein"), tone: "error" });
    } finally {
      setSending(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`${displayName} ${t("reel.icebreakerSheet.title", "ko interest bhej diya")}`}
      variant="bottom"
    >
      <div className="flex flex-col gap-3">
        {mission && (
          <div className="flex items-start gap-2 rounded-md border border-gold-300/60 bg-gold-50 px-3 py-2.5 dark:bg-gold-900/20">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-gold-700" />
            <div className="min-w-0">
              <p className="text-[0.8125rem] font-semibold leading-snug text-gold-700">{mission.headline}</p>
              <p className="mt-0.5 text-[0.8125rem] leading-snug text-muted">{mission.suggestion}</p>
            </div>
          </div>
        )}

        {voiceEnabled && (
          <div className="grid grid-cols-2 gap-1 rounded-full border border-line bg-bg-subtle p-1" role="tablist">
            {(["voice", "text"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={cn(
                  "flex min-h-11 items-center justify-center gap-1.5 rounded-full text-[0.8125rem] font-medium transition-colors",
                  mode === m ? "bg-surface text-ink shadow-sm" : "text-muted",
                )}
              >
                {m === "voice" ? <Mic className="size-4" /> : <PenLine className="size-4" />}
                {m === "voice" ? t("reel.icebreakerSheet.tabVoice", "Voice") : t("reel.icebreakerSheet.tabText", "Text")}
              </button>
            ))}
          </div>
        )}

        {mode === "voice" && voiceEnabled ? (
          <>
            <VoiceRecorder
              onRecorded={setRecorded}
              onCleared={() => setRecorded(null)}
              hint={t("reel.icebreakerSheet.voiceHint", "10 second — bas itna kaafi hai")}
              disabled={sending}
            />

            {voiceQuest && !recorded && (
              <p className="flex items-center justify-center gap-1.5 text-center text-[0.75rem] text-muted">
                <Gift className="size-3.5 shrink-0 text-gold-700" />
                {voiceQuest.title} {t("reel.icebreakerSheet.questConnector", "poora hone par")} {voiceQuest.rewardLabel}
              </p>
            )}

            <div className="mt-1 flex flex-col gap-2 sm:flex-row-reverse">
              <Button
                variant="primary"
                size="md"
                fullWidth
                disabled={!recorded || sending}
                onClick={sendVoice}
                icon={sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              >
                {t("reel.icebreakerSheet.sendVoiceNote", "Send Voice Note")}
              </Button>
              <Button variant="ghost" size="md" fullWidth disabled={sending} onClick={onClose}>
                {t("reel.icebreakerSheet.justSendInterest", "Just Send Interest")}
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-[0.8125rem] text-muted">
              {t(
                "reel.icebreakerSheet.aiSuggestionHint",
                "AI ne ek opening line suggest ki hai — chahein to edit kar lijiye, ya sirf interest bhej dijiye.",
              )}
            </p>

            {loading ? (
              <div className="flex items-center gap-2 rounded-md border border-line bg-bg-subtle px-3.5 py-6">
                <Loader2 className="size-4 animate-spin text-muted" />
                <span className="text-[0.8125rem] text-muted">
                  {t("reel.icebreakerSheet.suggestionLoading", "Suggestion taiyaar ho raha hai…")}
                </span>
              </div>
            ) : (
              <div className="space-y-1">
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value.slice(0, MAX_LENGTH))}
                  placeholder={t("reel.icebreakerSheet.messagePlaceholder", "Apna message likhiye…")}
                  rows={4}
                  className="w-full resize-none rounded-md border border-line-strong bg-surface px-3.5 py-2.5 text-[0.9375rem] outline-none focus:border-gold-500 focus:shadow-[0_0_0_3px_rgb(201_169_110_/_0.18)]"
                />
                <p className="text-right text-[0.6875rem] text-subtle">
                  {message.length}/{MAX_LENGTH}
                </p>
              </div>
            )}

            <div className="mt-1 flex flex-col gap-2 sm:flex-row-reverse">
              <Button
                variant="primary"
                size="md"
                fullWidth
                disabled={loading || sending || !message.trim()}
                onClick={sendWithMessage}
                icon={<Send className="size-4" />}
              >
                {t("reel.icebreakerSheet.sendWithInterest", "Send with Interest")}
              </Button>
              <Button variant="ghost" size="md" fullWidth disabled={sending} onClick={onClose}>
                {t("reel.icebreakerSheet.justSendInterest", "Just Send Interest")}
              </Button>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
