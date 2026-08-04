"use client";

import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import Sheet from "@/components/ui/Sheet";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import VoiceRecorder, { type RecordedVoice } from "@/components/voice/VoiceRecorder";
import type { SameVoteLead } from "@/lib/services/vibe/pollService";

/**
 * C4's voice CTA — deliberately voice-only, no text/AI-suggestion mode like
 * the reel's IcebreakerSheet has. There's no swipe here to hang a "just send
 * Interest" fallback off of; a same-vote lead is a cold intro, so recording
 * something real is the entire point of surfacing them at all.
 */
export default function SameVoteLeadVoiceSheet({
  lead,
  onClose,
  onSent,
}: {
  lead: SameVoteLead | null;
  onClose: () => void;
  onSent: () => void;
}) {
  const { toast } = useToast();
  const [recorded, setRecorded] = useState<RecordedVoice | null>(null);
  const [sending, setSending] = useState(false);

  async function send() {
    if (!lead || !recorded || sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/voice-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: lead.profileId, mediaId: recorded.mediaId, context: "POLL_ICEBREAKER" }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Voice note nahi bheji ja saki", description: json.message, tone: "error" });
        return;
      }
      toast({
        title: json.heldForReview ? "Recording review me hai" : `${lead.displayName} ko voice note bhej di`,
        description: json.heldForReview ? "Check hote hi ye unhe pahunch jayegi." : undefined,
        tone: json.heldForReview ? "info" : "success",
      });
      onSent();
    } catch {
      toast({ title: "Network error — dobara try karein", tone: "error" });
    } finally {
      setSending(false);
    }
  }

  return (
    <Sheet
      open={lead !== null}
      onClose={onClose}
      title={lead ? `${lead.displayName} ko voice note bhejein` : ""}
      variant="bottom"
    >
      <div className="flex flex-col gap-3">
        <p className="text-[0.8125rem] text-muted">
          10 second ki ek baat — ye ek Interest ki tarah gin jaayegi, aapke monthly quota se.
        </p>
        <VoiceRecorder
          onRecorded={setRecorded}
          onCleared={() => setRecorded(null)}
          hint="10 second — bas itna kaafi hai"
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
