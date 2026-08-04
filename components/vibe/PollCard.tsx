"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mic, Users } from "lucide-react";
import Card from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import SameVoteLeadVoiceSheet from "./SameVoteLeadVoiceSheet";
import AnswerNoteSheet from "./AnswerNoteSheet";
import type { PollView, SameVoteLead } from "@/lib/services/vibe/pollService";

/**
 * "Aaj ka poll" — one tap-choice vote a day, results reveal only after
 * answering (no anchoring the tap on the running numbers). Locked in on
 * first cast; `poll.votedOptionIndex` coming back non-null on a later visit
 * is what disables re-voting, not local state.
 */
export default function PollCard({ poll }: { poll: PollView }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<number | null>(null);
  const [voiceTarget, setVoiceTarget] = useState<SameVoteLead | null>(null);
  const [answerNoteOpen, setAnswerNoteOpen] = useState(false);

  async function vote(optionIndex: number) {
    setBusy(optionIndex);
    try {
      const res = await fetch(`/api/arena/${poll.id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optionIndex }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Vote nahi hua", description: json.message ?? "Please try again.", tone: "error" });
        return;
      }
      router.refresh();
    } catch {
      toast({ title: "Network error", description: "Please try again.", tone: "error" });
    } finally {
      setBusy(null);
    }
  }

  const voted = poll.votedOptionIndex !== null;
  const votedResult = poll.results?.find((r) => r.optionIndex === poll.votedOptionIndex);

  return (
    <Card variant="soft" padding="md" className="mb-4">
      {/* The day's theme, stated plainly. The rotation is only a retention
          mechanic if users can notice it — an unlabelled themed week reads as
          a random question bank. */}
      <p className="text-[0.75rem] font-medium uppercase tracking-wide text-wine-700">
        Mindset Arena · {poll.themeTagline}
      </p>
      <p className="mt-0.5 text-[0.9375rem] font-medium text-ink">{poll.question}</p>
      {!voted && (
        <p className="mt-1 text-[0.75rem] text-subtle">
          {poll.sochBoardVisible
            ? "Ye jawab aapki Soch Board par sabko dikhega."
            : "Aapki Soch Board abhi off hai — ye jawab kisi ko nahi dikhega."}
        </p>
      )}

      <div className="mt-3 space-y-2">
        {poll.options.map((opt, i) => {
          const result = poll.results?.find((r) => r.optionIndex === i);
          return (
            <button
              key={opt}
              type="button"
              disabled={voted || busy !== null}
              onClick={() => vote(i)}
              className="relative block w-full overflow-hidden rounded-md border border-line-strong px-3.5 py-2.5 text-left text-[0.8125rem] font-medium text-ink transition-colors disabled:cursor-default enabled:hover:border-gold-400 enabled:hover:bg-gold-50 dark:enabled:hover:bg-gold-900/20"
            >
              {voted && result && (
                <span
                  className="absolute inset-y-0 left-0 bg-gold-100 dark:bg-gold-900/30"
                  style={{ width: `${result.percent}%` }}
                  aria-hidden
                />
              )}
              <span className="relative flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  {busy === i && <Loader2 className="size-3.5 animate-spin" />}
                  {opt}
                  {i === poll.votedOptionIndex && (
                    <span className="rounded-full bg-gold-500 px-1.5 py-0.5 text-[0.625rem] font-semibold text-primary-fg">
                      Aapka jawab
                    </span>
                  )}
                </span>
                {voted && result && <span className="shrink-0 text-[0.75rem] text-subtle">{result.percent}%</span>}
              </span>
            </button>
          );
        })}
      </div>

      {voted && (
        <p className="mt-3 flex items-center gap-1.5 text-[0.75rem] text-subtle">
          <Users className="size-3.5 shrink-0" />
          {poll.totalVotes} logon ne jawab diya
          {votedResult && votedResult.count > 1 && ` — ${votedResult.count - 1} ne aapki tarah hi socha`}
        </p>
      )}

      {voted && !poll.hasAnswerNote && (
        <button
          type="button"
          onClick={() => setAnswerNoteOpen(true)}
          className="mt-2 inline-flex min-h-8 items-center gap-1.5 rounded-full border border-line-strong px-3 text-[0.75rem] font-medium text-muted transition-colors hover:border-gold-400 hover:text-ink"
        >
          <Mic className="size-3.5" />
          Bataiye — ye kyun chuna? (optional)
        </button>
      )}

      {voted && poll.sameVoteLeads.length > 0 && (
        <div className="mt-3 space-y-2 border-t border-line pt-3">
          <p className="text-[0.75rem] font-medium text-ink">Inhone bhi yahi socha</p>
          {poll.sameVoteLeads.map((lead) => (
            <div
              key={lead.profileId}
              className="flex items-center justify-between gap-2 rounded-md border border-line px-3 py-2"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                {/* Blind Vibe Zone — a real server-blurred file below the
                    threshold, the actual photo once enough shared votes exist.
                    Never a CSS filter (§7.4). */}
                {lead.blindVibe.revealed ? (
                  // eslint-disable-next-line @next/next/no-img-element -- gated URL, not build-known
                  <img
                    src={lead.blindVibe.photoUrl}
                    alt=""
                    className="size-9 shrink-0 rounded-full border border-gold-400 object-cover"
                  />
                ) : lead.blindVibe.blurredMediaId ? (
                  // eslint-disable-next-line @next/next/no-img-element -- gated URL, not build-known
                  <img
                    src={`/api/media/${lead.blindVibe.blurredMediaId}`}
                    alt=""
                    className="size-9 shrink-0 rounded-full border border-line object-cover"
                  />
                ) : (
                  <span className="grid size-9 shrink-0 place-items-center rounded-full border border-line bg-bg-subtle text-[0.625rem] text-subtle">
                    ?
                  </span>
                )}
                <div className="min-w-0">
                  <p className="truncate text-[0.8125rem] font-medium text-ink">
                    {lead.displayName}
                    {lead.age ? `, ${lead.age}` : ""}
                  </p>
                  {lead.city && <p className="text-[0.75rem] text-subtle">{lead.city}</p>}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setVoiceTarget(lead)}
                className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border border-gold-400 bg-gold-50 px-3 text-[0.75rem] font-medium text-gold-800 transition-colors hover:bg-gold-100 dark:border-gold-600/40 dark:bg-gold-900/30 dark:text-gold-200"
              >
                <Mic className="size-3.5" />
                Voice Note
              </button>
            </div>
          ))}
        </div>
      )}

      <SameVoteLeadVoiceSheet
        lead={voiceTarget}
        onClose={() => setVoiceTarget(null)}
        onSent={() => {
          setVoiceTarget(null);
          router.refresh();
        }}
      />

      <AnswerNoteSheet
        open={answerNoteOpen}
        pollId={poll.id}
        onClose={() => setAnswerNoteOpen(false)}
        onSaved={() => {
          setAnswerNoteOpen(false);
          router.refresh();
        }}
      />
    </Card>
  );
}
