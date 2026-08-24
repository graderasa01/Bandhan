"use client";

import { useState } from "react";
import { Check, CircleDot, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { RISHTA_STAGE_LABEL, RISHTA_STAGE_ORDER, stageRank } from "@/lib/profile/rishtaStages";
import type { RishtaSummary } from "@/lib/services/rishta/journeyService";
import type { RishtaStage } from "@prisma/client";

/**
 * Where this rishta has reached, and the one tap that moves it.
 *
 * ## Why this is a strip and not a CRM
 *
 * The temptation with ten stages is a dropdown, and a dropdown is what kills
 * the feature: it asks the user to maintain a record, which nobody does twice.
 * So the first four stages maintain themselves — an interest, a match, a reply
 * are facts the app already has — and the strip only ever offers what comes
 * *next*, as one or two buttons, in the place the user already is.
 *
 * A user who never taps anything still has an accurate journey. That is the
 * test this design has to pass, and it is why `deriveStage` exists.
 *
 * ## What the buttons never do
 *
 * Move the other person. Rahul marking "ghar wale jud gaye" says nothing about
 * Priya's family and never appears on her screen — the journey row is per-user
 * (see the `RishtaJourney` model). Two people can be at different stages of the
 * same rishta, which is not a bug in the data; it is usually the truth.
 */
export default function RishtaStageStrip({ initial }: { initial: RishtaSummary }) {
  const { toast } = useToast();
  const [summary, setSummary] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState(false);
  const [reason, setReason] = useState("");

  async function move(stage: RishtaStage, closedReason?: string) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/rishta/${summary.otherUserId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stage", stage, reason: closedReason }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: "Nahi ho paya", description: json?.message ?? "Dobara try karein.", tone: "error" });
        return;
      }
      if (json.summary) setSummary(json.summary);
      setClosing(false);
      setReason("");
    } catch {
      toast({ title: "Network error — dobara try karein", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  const currentRank = stageRank(summary.stage);
  // The four derived stages only. Showing all ten would make a new rishta look
  // like a nine-step form it has failed to complete.
  const track = RISHTA_STAGE_ORDER.slice(0, Math.max(4, currentRank + 1)).filter((s) => s !== "CLOSED");

  return (
    <section className="mb-3 rounded-lg border border-line bg-surface px-3.5 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[0.8125rem] font-medium text-ink">
          {summary.stageLabel}
          {!summary.stageConfirmed && (
            // Said plainly. A derived stage presented as a settled fact would be
            // the app putting words in the user's mouth about their own rishta.
            <span className="ml-1.5 text-[0.6875rem] font-normal text-muted">(app ka andaaza)</span>
          )}
        </p>
        {summary.awaitingReplyFrom === "user" && (
          <span className="shrink-0 rounded-full bg-gold-400/15 px-2 py-0.5 text-[0.6875rem] font-medium text-gold-700 dark:text-gold-300">
            Jawab baaki
          </span>
        )}
      </div>

      {summary.stage !== "CLOSED" && (
        <ol className="mt-2 flex items-center gap-1" aria-label="Rishta stage">
          {track.map((s) => {
            const done = stageRank(s) <= currentRank;
            return (
              <li
                key={s}
                title={RISHTA_STAGE_LABEL[s]}
                className={`h-1 flex-1 rounded-full ${done ? "bg-gold-500" : "bg-line"}`}
              />
            );
          })}
        </ol>
      )}

      {summary.unresolvedTopics.length > 0 && (
        <p className="mt-2.5 text-[0.75rem] leading-relaxed text-muted">
          <CircleDot className="mr-1 inline size-3 align-[-1px]" />
          Abhi clear nahi: {summary.unresolvedTopics.map((t) => t.label).join(", ")}
        </p>
      )}

      {summary.closedReason && (
        <p className="mt-2 text-[0.75rem] text-muted">Wajah: “{summary.closedReason}”</p>
      )}

      {closing ? (
        <div className="mt-3">
          <label htmlFor="rishta-close-reason" className="text-[0.75rem] text-muted">
            Kya wajah rahi? (apne liye — kisi ko nahi dikhta)
          </label>
          <input
            id="rishta-close-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, 300))}
            placeholder="Jaise: timing match nahi hui"
            className="mt-1 min-h-10 w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-[0.875rem] outline-none focus:border-gold-500"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void move("CLOSED", reason.trim() || undefined)}
              className="rounded-md border border-line px-3 py-1.5 text-[0.75rem] text-ink hover:border-danger hover:text-danger disabled:opacity-55"
            >
              Close this rishta
            </button>
            <button
              type="button"
              onClick={() => setClosing(false)}
              className="rounded-md px-3 py-1.5 text-[0.75rem] text-muted hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        summary.nextStages.length > 0 && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {summary.nextStages.map((s) =>
              s.stage === "CLOSED" ? (
                <button
                  key={s.stage}
                  type="button"
                  disabled={busy}
                  onClick={() => setClosing(true)}
                  className="rounded-full px-2.5 py-1 text-[0.75rem] text-muted transition-colors hover:text-danger disabled:opacity-55"
                >
                  {s.label}
                </button>
              ) : (
                <button
                  key={s.stage}
                  type="button"
                  disabled={busy}
                  onClick={() => void move(s.stage)}
                  className="flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-[0.75rem] text-ink transition-colors hover:border-gold-400 disabled:opacity-55"
                >
                  <Check className="size-3" />
                  {s.label}
                </button>
              ),
            )}
            {busy && <Loader2 className="size-3.5 animate-spin text-muted" />}
          </div>
        )
      )}
    </section>
  );
}
