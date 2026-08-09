"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mic, ShieldCheck } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import VoicePlayer from "@/components/voice/VoicePlayer";
import VoiceRecorder, { type RecordedVoice } from "@/components/voice/VoiceRecorder";
import { useToast } from "@/components/ui/Toast";
import CelebrationHost, { type Celebration } from "@/components/ui/CelebrationHost";
import { BLESSING_PROMPTS } from "@/lib/family/blessingPrompts";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n/LanguageProvider";

export interface OwnBlessingStatus {
  mediaId: string;
  seconds: number;
  pendingReview: boolean;
}

/**
 * The family portal's one PARENT-only action beyond viewing (§4 of the
 * architecture plan — shortlist and notes are the other two, both open to
 * siblings as well; this one is not, see familyConstants.ts).
 *
 * Re-recording replaces the existing clip (the API route deletes the old
 * VoiceNote/MediaAsset pair) — there is deliberately no "keep both" option;
 * a profile has one blessing, the most recent one, same as the model's own
 * `findFirst … orderBy createdAt desc` read.
 */
export default function BlessingRecorder({ initial }: { initial: OwnBlessingStatus | null }) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useT();
  const [status, setStatus] = useState(initial);
  const [recording, setRecording] = useState(false);
  const [recorded, setRecorded] = useState<RecordedVoice | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const [selectedPrompt, setSelectedPrompt] = useState(BLESSING_PROMPTS[0]);

  async function publish() {
    if (!recorded || publishing) return;
    setPublishing(true);
    try {
      const res = await fetch("/api/family-portal/blessing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaId: recorded.mediaId }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: t("family.blessingRecorder.publishFailTitle", "Publish nahi ho paya"), description: json.message, tone: "error" });
        return;
      }
      toast({
        title: json.published
          ? t("family.blessingRecorder.publishedTitle", "Aashirwad publish ho gaya")
          : t("family.blessingRecorder.pendingReviewTitle", "Review me hai"),
        description: json.published
          ? t("family.blessingRecorder.publishedDesc", "Ab ye profile par sabko dikhega.")
          : t("family.blessingRecorder.pendingReviewDesc", "Check hote hi ye profile par dikhega."),
        tone: json.published ? "success" : "info",
      });
      if (json.celebration) setCelebration(json.celebration);
      setStatus({ mediaId: recorded.mediaId, seconds: Math.round(recorded.durationMs / 1000), pendingReview: !json.published });
      setRecorded(null);
      setRecording(false);
      router.refresh();
    } catch {
      toast({ title: t("family.blessingRecorder.networkError", "Network error — dobara try karein"), tone: "error" });
    } finally {
      setPublishing(false);
    }
  }

  return (
    <Card padding="md" className="border-trust/30 bg-trust/5">
      <div className="flex items-center gap-2">
        <ShieldCheck className="size-4 shrink-0 text-trust" />
        <p className="text-[0.9375rem] font-semibold text-ink">{t("family.blessingRecorder.title", "Aashirwad Record Karein")}</p>
      </div>
      <p className="mt-1 text-[0.8125rem] leading-snug text-muted">
        {t(
          "family.blessingRecorder.subtitle",
          "10 second ki apni aawaz me — ye unki profile par sabko dikhega, ek verified parent ki nishani ke saath.",
        )}
      </p>

      {status && !recording && (
        <div className="mt-3">
          <VoicePlayer src={`/api/media/${status.mediaId}`} seconds={status.seconds} />
          {status.pendingReview && (
            <p className="mt-1.5 text-[0.75rem] text-warn">
              {t("family.blessingRecorder.pendingReviewInline", "Review me hai — check hote hi profile par dikhega.")}
            </p>
          )}
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => setRecording(true)}>
            {t("family.blessingRecorder.recordAgain", "Record Again")}
          </Button>
        </div>
      )}

      {(!status || recording) && (
        <div className="mt-3 flex flex-col gap-2">
          <div className="flex flex-wrap gap-1.5">
            {BLESSING_PROMPTS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setSelectedPrompt(p)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[0.75rem] font-medium transition-colors",
                  selectedPrompt.key === p.key
                    ? "border-trust bg-trust/10 text-trust"
                    : "border-line text-muted hover:border-trust/40",
                )}
              >
                {p.question}
              </button>
            ))}
          </div>
          <VoiceRecorder
            uploadUrl="/api/family-portal/blessing"
            onRecorded={setRecorded}
            onCleared={() => setRecorded(null)}
            hint={selectedPrompt.question}
            disabled={publishing}
          />
          <Button
            variant="primary"
            size="md"
            fullWidth
            disabled={!recorded || publishing}
            onClick={publish}
            icon={publishing ? <Loader2 className="size-4 animate-spin" /> : <Mic className="size-4" />}
          >
            {t("family.blessingRecorder.publish", "Publish")}
          </Button>
          {status && (
            <Button variant="ghost" size="sm" disabled={publishing} onClick={() => setRecording(false)}>
              {t("family.blessingRecorder.cancel", "Cancel")}
            </Button>
          )}
        </div>
      )}

      <CelebrationHost celebration={celebration} onDone={() => setCelebration(null)} />
    </Card>
  );
}
