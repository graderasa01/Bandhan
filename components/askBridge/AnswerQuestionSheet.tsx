"use client";

import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import Sheet from "@/components/ui/Sheet";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import VoiceRecorder, { type RecordedVoice } from "@/components/voice/VoiceRecorder";
import type { Celebration } from "@/components/ui/CelebrationHost";
import type { AnswerQuestionResponse, InboundQuestionView } from "@/lib/contracts/askBridge";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * The recipient's side of Ask Bridge — answering is the only way to find out
 * who asked (`askerRevealedAt`), so this sheet's copy leans into that as the
 * reason to bother, the same honesty §7.1 asks of the reel's mission copy:
 * it's a real mechanic being described, not invented urgency.
 */
export default function AnswerQuestionSheet({
  question,
  onClose,
  onAnswered,
  onDeclined,
  onCelebration,
}: {
  question: InboundQuestionView | null;
  onClose: () => void;
  onAnswered: (asker: { displayName: string | null }) => void;
  onDeclined: () => void;
  onCelebration?: (c: Celebration) => void;
}) {
  const { toast } = useToast();
  const t = useT();
  const [recorded, setRecorded] = useState<RecordedVoice | null>(null);
  const [busy, setBusy] = useState(false);

  async function send() {
    if (!question || !recorded || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/profile-questions/${question.id}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaId: recorded.mediaId }),
      });
      const json = (await res.json()) as AnswerQuestionResponse;
      if (!res.ok || !json.ok) {
        toast({ title: t("askBridge.answerSheet.sendFailedTitle", "Jawab nahi bheja ja saka"), description: json.message, tone: "error" });
        return;
      }
      toast({
        title: json.heldForReview
          ? t("askBridge.answerSheet.reviewTitle", "Jawab review me hai")
          : t("askBridge.answerSheet.sentTitle", "Jawab bhej diya"),
        description: json.heldForReview
          ? t("askBridge.answerSheet.reviewDescription", "Check hote hi ye unhe pahunch jayega.")
          : `${t("askBridge.answerSheet.identityRevealedPre", "Ab aapko pata hai ye ")}${json.asker?.displayName ?? t("askBridge.answerSheet.someone", "kisi")}${t("askBridge.answerSheet.identityRevealedPost", " tha.")}`,
        tone: json.heldForReview ? "info" : "success",
      });
      if (json.celebration) onCelebration?.(json.celebration);
      setRecorded(null);
      onAnswered({ displayName: json.asker?.displayName ?? null });
    } catch {
      toast({ title: t("askBridge.answerSheet.networkError", "Network error — dobara try karein"), tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function decline() {
    if (!question || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/profile-questions/${question.id}/decline`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: t("askBridge.answerSheet.declineFailedTitle", "Nahi ho paya"), description: json.message, tone: "error" });
        return;
      }
      onDeclined();
    } catch {
      toast({ title: t("askBridge.answerSheet.networkError", "Network error — dobara try karein"), tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={question !== null} onClose={onClose} title={t("askBridge.answerSheet.title", "Sawaal ka jawab dijiye")} variant="bottom">
      <div className="flex flex-col gap-3">
        {question && (
          <div className="rounded-md border border-gold-300/60 bg-gold-50 px-3 py-2.5 dark:bg-gold-900/20">
            <p className="text-[0.6875rem] font-medium uppercase tracking-wide text-gold-700">{question.teaser}</p>
            <p className="mt-1 text-[0.9375rem] leading-snug text-ink">&ldquo;{question.questionText}&rdquo;</p>
          </div>
        )}

        <VoiceRecorder
          onRecorded={setRecorded}
          onCleared={() => setRecorded(null)}
          hint={t("askBridge.answerSheet.recorderHint", "10 second — jawab ke saath aapki pehchaan bhi khul jaati hai")}
          disabled={busy}
        />

        <div className="mt-1 flex flex-col gap-2 sm:flex-row-reverse">
          <Button
            variant="primary"
            size="md"
            fullWidth
            disabled={!recorded || busy}
            onClick={send}
            icon={busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          >
            {t("askBridge.answerSheet.sendButton", "Send Answer")}
          </Button>
          <Button variant="ghost" size="md" fullWidth disabled={busy} onClick={decline}>
            {t("askBridge.answerSheet.skipButton", "Skip")}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
