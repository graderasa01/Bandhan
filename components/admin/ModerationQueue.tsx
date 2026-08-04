"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, HelpCircle, Mic } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import VoicePlayer from "@/components/voice/VoicePlayer";
import { useToast } from "@/components/ui/Toast";

export type PendingMediaItem = {
  mediaId: string;
  ownerName: string;
  transcript: string | null;
  seconds: number;
  moderationReason: string | null;
  hasRecipient: boolean;
  createdAt: string;
};

export type PendingQuestionItem = {
  questionId: string;
  askerName: string;
  questionText: string;
  moderationReason: string | null;
  createdAt: string;
};

export type ReportItem = {
  id: string;
  reporterName: string;
  reportedName: string;
  reason: string;
  details: string | null;
  targetType: string;
  reportedUserOpenCount: number;
  createdAt: string;
};

/**
 * Held clips and open reports on one screen.
 *
 * A clip lands here only when automatic screening could not clear it — no key,
 * no credit, provider down, or no transcript at all. That is the fail-closed
 * half of `contentModeration`: the safe default is "a human looks", and this
 * is where the human looks. Approving is also what delivers the note, so an
 * empty queue is not cosmetic — it means people are waiting.
 *
 * Admins can play the audio because `resolveMediaAccess` grants them playback
 * regardless of moderation state. That is the only reason that exception exists.
 */
export default function ModerationQueue({
  pendingMedia,
  pendingQuestions,
  reports,
}: {
  pendingMedia: PendingMediaItem[];
  pendingQuestions: PendingQuestionItem[];
  reports: ReportItem[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function act(payload: Record<string, unknown>, id: string) {
    setBusy(id);
    try {
      const res = await fetch("/api/admin/moderation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      toast({
        title: json.ok ? "Ho gaya" : "Fail hua",
        description: json.message,
        tone: json.ok ? "success" : "error",
      });
      if (json.ok) router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-lg font-semibold text-wine-700">
          Review ke liye ruki hui recordings ({pendingMedia.length})
        </h2>
        {pendingMedia.length === 0 ? (
          <p className="text-sm text-muted">Koi recording ruki hui nahi hai.</p>
        ) : (
          <ul className="space-y-3">
            {pendingMedia.map((m) => (
              <li key={m.mediaId}>
                <Card padding="md">
                  <div className="flex items-center gap-2">
                    <Mic className="size-4 shrink-0 text-muted" />
                    <span className="text-[0.9375rem] font-semibold text-ink">{m.ownerName}</span>
                    {!m.hasRecipient && (
                      <span className="rounded-full border border-line px-2 py-0.5 text-[0.6875rem] text-muted">
                        abhi kisi ko bheji nahi
                      </span>
                    )}
                  </div>

                  {m.moderationReason && (
                    <p className="mt-1.5 flex items-start gap-1.5 text-[0.75rem] text-warn">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                      {m.moderationReason}
                    </p>
                  )}

                  <VoicePlayer className="mt-3" src={`/api/media/${m.mediaId}`} seconds={m.seconds} />

                  <p className="mt-2 rounded-md border border-line bg-bg-subtle px-3 py-2 text-[0.8125rem] leading-snug text-ink">
                    {m.transcript || <span className="text-subtle">Transcript nahi mila — sunkar decide karein.</span>}
                  </p>

                  <div className="mt-3 flex gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={busy === m.mediaId}
                      onClick={() => act({ kind: "media", mediaId: m.mediaId, approve: true }, m.mediaId)}
                    >
                      Approve {m.hasRecipient && "& Send"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy === m.mediaId}
                      onClick={() =>
                        act(
                          { kind: "media", mediaId: m.mediaId, approve: false, reason: "Admin review" },
                          m.mediaId,
                        )
                      }
                    >
                      Reject
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-wine-700">
          Review ke liye ruke hue sawaal ({pendingQuestions.length})
        </h2>
        {pendingQuestions.length === 0 ? (
          <p className="text-sm text-muted">Koi sawaal ruka hua nahi hai.</p>
        ) : (
          <ul className="space-y-3">
            {pendingQuestions.map((q) => (
              <li key={q.questionId}>
                <Card padding="md">
                  <div className="flex items-center gap-2">
                    <HelpCircle className="size-4 shrink-0 text-muted" />
                    <span className="text-[0.9375rem] font-semibold text-ink">{q.askerName}</span>
                  </div>

                  {q.moderationReason && (
                    <p className="mt-1.5 flex items-start gap-1.5 text-[0.75rem] text-warn">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                      {q.moderationReason}
                    </p>
                  )}

                  <p className="mt-2 rounded-md border border-line bg-bg-subtle px-3 py-2 text-[0.8125rem] leading-snug text-ink">
                    {q.questionText}
                  </p>

                  <div className="mt-3 flex gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={busy === q.questionId}
                      onClick={() => act({ kind: "question", questionId: q.questionId, approve: true }, q.questionId)}
                    >
                      Approve & Send
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy === q.questionId}
                      onClick={() =>
                        act(
                          { kind: "question", questionId: q.questionId, approve: false, reason: "Admin review" },
                          q.questionId,
                        )
                      }
                    >
                      Reject
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-wine-700">Khuli reports ({reports.length})</h2>
        {reports.length === 0 ? (
          <p className="text-sm text-muted">Koi report pending nahi hai.</p>
        ) : (
          <ul className="space-y-3">
            {reports.map((r) => (
              <li key={r.id}>
                <Card padding="md">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[0.9375rem] font-semibold text-ink">{r.reportedName}</span>
                    {r.reportedUserOpenCount > 1 && (
                      <span className="rounded-full border border-danger/30 bg-danger-bg px-2 py-0.5 text-[0.6875rem] font-medium text-danger">
                        {r.reportedUserOpenCount} khuli reports
                      </span>
                    )}
                    <span className="text-[0.75rem] text-muted">· {r.reporterName} ne report ki</span>
                  </div>

                  <p className="mt-1.5 text-[0.875rem] text-ink">{r.reason}</p>
                  {r.details && <p className="mt-1 text-[0.8125rem] leading-snug text-muted">{r.details}</p>}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={busy === r.id}
                      onClick={() => act({ kind: "report", reportId: r.id, status: "ACTIONED" }, r.id)}
                    >
                      Take Action
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={busy === r.id}
                      onClick={() => act({ kind: "report", reportId: r.id, status: "REVIEWED" }, r.id)}
                    >
                      Reviewed
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy === r.id}
                      onClick={() => act({ kind: "report", reportId: r.id, status: "DISMISSED" }, r.id)}
                    >
                      Dismiss
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
