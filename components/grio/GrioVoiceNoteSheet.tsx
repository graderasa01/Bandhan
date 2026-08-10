"use client";

import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import Sheet from "@/components/ui/Sheet";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/components/i18n/LanguageProvider";
import VoiceRecorder, { type RecordedVoice } from "@/components/voice/VoiceRecorder";

/**
 * Recording a voice note without leaving the conversation.
 *
 * A near-copy of `components/vibe/SameVoteLeadVoiceSheet` — deliberately a copy
 * rather than a shared component, because the two differ in the only thing that
 * matters here: where the target comes from. That one closes over a lead the
 * page already had; this one receives whatever the user picked a moment ago in
 * Grio, and must work identically whether that came from an open profile or
 * from `GrioPersonPicker`.
 *
 * The recorder is why `sendVoiceNote` had to be a `sheet` and not a `do`:
 * `/api/media/voice` takes multipart audio, which no action marker can carry.
 * `VoiceRecorder` uploads on its own and hands back a `mediaId`; sending is this
 * component's job, exactly as it is for the other four recorders in the app.
 *
 * The cost line is stated before the mic, not after the send. `sendVoiceNote`
 * calls `sendInterest` internally — a voice note spends a monthly interest — and
 * that is the single most surprising fact in this whole flow.
 */
export default function GrioVoiceNoteSheet({
  target,
  onClose,
  onSent,
}: {
  target: { profileId: string; name: string } | null;
  onClose: () => void;
  onSent: () => void;
}) {
  const t = useT();
  const { toast } = useToast();
  const [recorded, setRecorded] = useState<RecordedVoice | null>(null);
  const [sending, setSending] = useState(false);

  async function send() {
    if (!target || !recorded || sending) return;
    setSending(true);
    try {
      // No `context` — the route defaults to REEL_INTEREST, which is also what
      // dedupes this against a note sent from the reel. One voice note per
      // person is the rule regardless of which screen recorded it.
      const res = await fetch("/api/voice-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: target.profileId, mediaId: recorded.mediaId }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({
          title: t("grio.voiceNoteFailed", "Voice note nahi bheji ja saki"),
          description: json.message ?? t("grio.tryAgain", "Dobara try karein."),
          tone: "error",
        });
        return;
      }
      toast({
        title: json.heldForReview
          ? t("grio.recordingUnderReview", "Recording review me hai")
          : t("grio.voiceNoteSent", "{name} ko voice note bhej di").replace("{name}", target.name),
        description: json.heldForReview
          ? t("grio.willReachAfterCheck", "Check hote hi ye unhe pahunch jayegi.")
          : undefined,
        tone: json.heldForReview ? "info" : "success",
      });
      setRecorded(null);
      onSent();
    } catch {
      toast({ title: t("grio.networkError", "Network error — dobara try karein"), tone: "error" });
    } finally {
      setSending(false);
    }
  }

  return (
    <Sheet
      open={target !== null}
      onClose={() => (sending ? undefined : onClose())}
      variant="bottom"
      title={
        target
          ? t("grio.sendVoiceNoteTo", "{name} ko voice note bhejein").replace("{name}", target.name)
          : ""
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-[0.8125rem] text-muted">
          {t(
            "grio.voiceCountsAsInterest",
            "10 second ki ek baat — iske saath ek Interest bhi chala jayega, aapke monthly quota se.",
          )}
        </p>
        <VoiceRecorder
          onRecorded={setRecorded}
          onCleared={() => setRecorded(null)}
          hint={t("grio.tenSecondHint", "10 second — bas itna kaafi hai")}
          disabled={sending}
        />
        <Button
          variant="primary"
          size="md"
          fullWidth
          disabled={!recorded || sending}
          onClick={send}
          icon={sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        >
          Send Voice Note
        </Button>
      </div>
    </Sheet>
  );
}
