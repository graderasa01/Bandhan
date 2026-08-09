"use client";

import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import Sheet from "@/components/ui/Sheet";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/components/i18n/LanguageProvider";
import VoiceRecorder, { type RecordedVoice } from "@/components/voice/VoiceRecorder";

/**
 * C7 — "maine ye kyun choose kiya". Attaches straight to today's `PollVote`,
 * not sent to anyone — see `sochBoardService.ts` for why this skips the
 * VoiceNote/Interest machinery entirely.
 */
export default function AnswerNoteSheet({
  open,
  pollId,
  onClose,
  onSaved,
}: {
  open: boolean;
  pollId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const { toast } = useToast();
  const [recorded, setRecorded] = useState<RecordedVoice | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!recorded || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/arena/${pollId}/answer-note`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaId: recorded.mediaId }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: t("vibe.saveFailed", "Save nahi hua"), description: json.message, tone: "error" });
        return;
      }
      toast({
        title: recorded.pendingReview ? t("vibe.underReview", "Review me hai") : t("vibe.added", "Jud gaya"),
        description: recorded.pendingReview
          ? t("vibe.willShowAfterCheck", "Check hote hi ye aapki Soch Board par dikhega.")
          : t("vibe.willShowOnBoard", "Ye aapki Soch Board par dikhega."),
        tone: recorded.pendingReview ? "info" : "success",
      });
      onSaved();
    } catch {
      toast({ title: t("vibe.networkError", "Network error — dobara try karein"), tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={t("vibe.whyThisTitle", "Bataiye — ye kyun chuna?")} variant="bottom">
      <div className="flex flex-col gap-3">
        <p className="text-[0.8125rem] text-muted">
          {t(
            "vibe.whyThisHelp",
            "Optional — 10 second me apni wajah bataiye. Ye aapki Soch Board par sabko dikhega (agar Soch Board on hai).",
          )}
        </p>
        <VoiceRecorder
          onRecorded={setRecorded}
          onCleared={() => setRecorded(null)}
          hint={t("vibe.tenSecondHint", "10 second — bas itna kaafi hai")}
          disabled={saving}
        />
        <Button
          variant="primary"
          size="md"
          fullWidth
          disabled={!recorded || saving}
          onClick={save}
          icon={saving ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        >
          Save to Soch Board
        </Button>
      </div>
    </Sheet>
  );
}
