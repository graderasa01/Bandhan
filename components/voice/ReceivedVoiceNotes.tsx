"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Flag, Lock, Sparkles } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import VoicePlayer from "./VoicePlayer";
import ReportSheet from "@/components/safety/ReportSheet";
import CelebrationHost, { type Celebration } from "@/components/ui/CelebrationHost";
import type { ReceivedVoiceNoteView } from "@/lib/contracts/voice";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * Received voice notes — the FOMO surface, and the one screen where the
 * product's honesty is most visible.
 *
 * Two rules it must never break:
 *
 * 1. **A locked note carries no audio URL.** `playbackUrl` is null until the
 *    server says otherwise. The lock is not a CSS filter over a working
 *    `<audio src>` — there is nothing to un-hide in the DOM.
 * 2. **The teaser never identifies anyone.** City, age, job title: buckets
 *    thousands of people share. The name arrives with the unlock, not before.
 *
 * The upsell is the note itself. There is no countdown, no "3 log dekh rahe
 * hain", no invented scarcity — someone really did record ten seconds for this
 * person, and saying exactly that is stronger than anything we could make up.
 */
export default function ReceivedVoiceNotes({
  initial,
  canUnlockFree,
  unlockCredits,
}: {
  initial: ReceivedVoiceNoteView[];
  /** True when the plan already allows opening notes — no credit needed. */
  canUnlockFree: boolean;
  /** Earned VOICE_UNLOCK credits in hand. */
  unlockCredits: number;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useT();
  const [notes, setNotes] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const [reportTarget, setReportTarget] = useState<ReceivedVoiceNoteView | null>(null);
  const [credits, setCredits] = useState(unlockCredits);

  /**
   * Re-sync when the server sends fresh data.
   *
   * The optimistic update below can only fill in what the unlock response
   * returns — the playback URL. The sender's *name* and profile link are
   * deliberately absent from every payload until the server itself decides the
   * note is unlocked, so without this the card would sit there saying "Unhone"
   * after a successful unlock. `initial`'s identity only changes on a server
   * re-render, so this settles rather than loops.
   */
  useEffect(() => {
    setNotes(initial);
  }, [initial]);

  useEffect(() => {
    setCredits(unlockCredits);
  }, [unlockCredits]);

  if (notes.length === 0) return null;

  /**
   * Records that the clip was actually heard — the dashboard banner stops
   * announcing it after this. Fire-and-forget on purpose: it changes nothing
   * the user can see on this screen, so a failure must not produce an error
   * they'd have no way to act on.
   */
  function markPlayed(noteId: string) {
    void fetch(`/api/voice-notes/${noteId}/played`, { method: "POST" }).catch(() => {});
  }

  async function unlock(note: ReceivedVoiceNoteView) {
    setBusyId(note.id);
    try {
      const res = await fetch(`/api/voice-notes/${note.id}/unlock`, { method: "POST" });
      const json = await res.json();

      if (!res.ok || !json.ok) {
        toast({
          title: t("voice.receivedVoiceNotes.unlockFailedTitle", "Abhi khul nahi sakti"),
          description: json.message,
          tone: "warning",
          action: {
            label: t("voice.receivedVoiceNotes.viewPlans", "View Plans"),
            onClick: () => router.push("/user/subscription"),
          },
        });
        return;
      }

      if (json.usedCredit) setCredits((c) => Math.max(0, c - 1));
      setNotes((list) =>
        list.map((n) => (n.id === note.id ? { ...n, unlocked: true, playbackUrl: json.playbackUrl } : n)),
      );
      if (json.celebration) setCelebration(json.celebration);
      // Names and profile links come from the server, not from this response.
      router.refresh();
    } catch {
      toast({ title: t("voice.receivedVoiceNotes.networkError", "Network error — dobara try karein"), tone: "error" });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="mb-6">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-wine-700">
        {t("voice.receivedVoiceNotes.title", "Aayi hui voice notes")}
        <span className="rounded-full bg-wine-700 px-2 py-0.5 text-[0.6875rem] font-semibold text-white">
          {notes.filter((n) => !n.unlocked).length}
        </span>
      </h2>

      <ul className="space-y-3">
        {notes.map((note) => (
          <li key={note.id}>
            <Card
              padding="md"
              variant={note.unlocked ? "default" : "soft"}
              className={note.unlocked ? undefined : "border-gold-300/60 bg-gold-50/50 dark:border-gold-700/30 dark:bg-gold-900/10"}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  {/* QUESTION_ANSWER: identity was never secret from this
                      recipient (see voiceNoteService's notifyRecipient) — only
                      the clip itself is behind the usual unlock gate. */}
                  {note.context === "QUESTION_ANSWER" ? (
                    <p className="text-[0.9375rem] font-semibold text-ink">{note.senderName ?? note.teaser}</p>
                  ) : (
                    <p className="text-[0.9375rem] font-semibold text-ink">
                      {note.unlocked ? (note.senderName ?? t("voice.receivedVoiceNotes.unhoneFallback", "Unhone")) : note.teaser}
                      {!note.unlocked && (
                        <span className="font-normal text-muted">{t("voice.receivedVoiceNotes.sentSuffix", " ne bheji hai")}</span>
                      )}
                    </p>
                  )}
                  {!note.unlocked && note.context !== "QUESTION_ANSWER" && (
                    <p className="mt-0.5 flex items-center gap-1.5 text-[0.75rem] text-muted">
                      <Lock className="size-3 shrink-0 text-gold-600" />
                      {t("voice.receivedVoiceNotes.identityHidden", "Naam aur profile kholne ke baad dikhegi")}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setReportTarget(note)}
                  aria-label={t("voice.receivedVoiceNotes.reportAriaLabel", "Report")}
                  className="grid size-9 shrink-0 place-items-center rounded-full text-subtle transition-colors hover:bg-bg-subtle hover:text-danger"
                >
                  <Flag className="size-4" />
                </button>
              </div>

              <VoicePlayer
                className="mt-3"
                src={note.playbackUrl}
                seconds={note.seconds}
                locked={!note.unlocked}
                onFirstPlay={() => markPlayed(note.id)}
              />

              {!note.unlocked && (
                <div className="mt-3 flex flex-col gap-2">
                  <Button
                    variant="primary"
                    size="md"
                    fullWidth
                    disabled={busyId === note.id}
                    onClick={() => unlock(note)}
                  >
                    {canUnlockFree
                      ? t("voice.receivedVoiceNotes.listen", "Listen")
                      : credits > 0
                        ? `${t("voice.receivedVoiceNotes.unlockWithCreditsPrefix", "Unlock — ")}${credits}${t("voice.receivedVoiceNotes.unlockWithCreditsSuffix", " available")}`
                        : t("voice.receivedVoiceNotes.unlock", "Unlock")}
                  </Button>
                  {!canUnlockFree && credits === 0 && (
                    <p className="flex items-center justify-center gap-1.5 text-center text-[0.75rem] text-muted">
                      <Sparkles className="size-3.5 shrink-0 text-gold-700" />
                      {t("voice.receivedVoiceNotes.upgradeHint", "Plan upgrade karein, ya reel me ek voice note bhej kar unlock jeetein")}
                    </p>
                  )}
                </div>
              )}

              {(note.unlocked || note.context === "QUESTION_ANSWER") && note.senderProfileId && (
                <Link
                  href={`/user/profile/${note.senderProfileId}`}
                  className="mt-3 inline-block text-[0.8125rem] font-medium text-gold-700 underline underline-offset-2"
                >
                  {t("voice.receivedVoiceNotes.viewFullProfile", "View Full Profile")}
                </Link>
              )}
            </Card>
          </li>
        ))}
      </ul>

      <ReportSheet
        open={reportTarget !== null}
        onClose={() => setReportTarget(null)}
        targetLabel={
          reportTarget?.unlocked
            ? (reportTarget.senderName ?? t("voice.receivedVoiceNotes.reportTargetFallback", "Ye voice note"))
            : t("voice.receivedVoiceNotes.reportTargetFallback", "Ye voice note")
        }
        targetUserId={reportTarget?.senderUserId ?? undefined}
        targetProfileId={reportTarget?.senderProfileId ?? undefined}
        targetType="VOICE_NOTE"
        targetId={reportTarget?.id}
      />

      <CelebrationHost celebration={celebration} onDone={() => setCelebration(null)} />
    </section>
  );
}
