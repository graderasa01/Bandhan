"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, CircleDot, Heart, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import {
  CLOSING_OUTCOMES,
  POSITIVE_OUTCOMES,
  RISHTA_OUTCOME_LABEL,
  RISHTA_STAGE_LABEL,
  RISHTA_STAGE_ORDER,
  stageRank,
} from "@/lib/profile/rishtaStages";
import type { RishtaSummary } from "@/lib/services/rishta/journeyService";
import type { RishtaOutcome, RishtaStage } from "@prisma/client";

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
 * ## Why closing is two buttons and not one
 *
 * Every ending used to be "Baat khatam" with a free-text box, and that made the
 * app structurally unable to know it had ever worked. A wedding and a silence
 * produced the same row. Worse, the only visible way to end a rishta was
 * phrased as a failure, so a person whose engagement had just been fixed had no
 * honest control to tap — and the one row this whole product exists to create
 * was the one row it never collected.
 *
 * So "Mark as settled" sits *beside* "Close this rishta", offers sagai and
 * shaadi, and writes the same CLOSED stage with a positive `outcome`. The free
 * text stays: the structured value is what gets counted, the user's own words
 * are what they will want to read in two years.
 *
 * ## What the buttons never do
 *
 * Move the other person. Rahul marking "ghar wale jud gaye" says nothing about
 * Priya's family and never appears on her screen — the journey row is per-user
 * (see the `RishtaJourney` model). Two people can be at different stages of the
 * same rishta, which is not a bug in the data; it is usually the truth.
 */

/** Which closing flow is open. `null` is the normal, closed state. */
type ClosingMode = null | "settled" | "ended";

export default function RishtaStageStrip({ initial }: { initial: RishtaSummary }) {
  const router = useRouter();
  const { toast } = useToast();
  const [summary, setSummary] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState<ClosingMode>(null);
  const [outcome, setOutcome] = useState<RishtaOutcome | null>(null);
  const [reason, setReason] = useState("");

  function reset() {
    setClosing(null);
    setOutcome(null);
    setReason("");
  }

  async function move(stage: RishtaStage, extra?: { reason?: string; outcome?: RishtaOutcome }) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/rishta/${summary.otherUserId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "stage",
          stage,
          reason: extra?.reason,
          outcome: extra?.outcome,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: "Nahi ho paya", description: json?.message ?? "Dobara try karein.", tone: "error" });
        return;
      }
      if (json.summary) setSummary(json.summary);
      reset();
      // The strip owns the stage; it does not own what the page around it says
      // about the stage. In the Room, the "agla kadam" card is a server
      // component computed from this very journey — without this refresh it
      // keeps telling the user to reply to somebody whose rishta they just
      // marked as an engagement. Harmless in the chat thread, which has no such
      // card, and necessary here.
      router.refresh();
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
  const options = closing === "settled" ? POSITIVE_OUTCOMES : CLOSING_OUTCOMES;

  return (
    <section className="mb-3 rounded-lg border border-line bg-surface px-3.5 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[0.8125rem] font-medium text-ink">
          {/* A closed rishta is called by how it ended, never by "baat khatam" —
              a person who just recorded their own wedding must not read that. */}
          {summary.outcomeLabel ?? summary.stageLabel}
          {!summary.stageConfirmed && summary.stage !== "CLOSED" && (
            // Said plainly. A derived stage presented as a settled fact would be
            // the app putting words in the user's mouth about their own rishta.
            <span className="ml-1.5 text-[0.6875rem] font-normal text-muted">(app ka andaaza)</span>
          )}
        </p>
        {summary.awaitingReplyFrom === "user" && summary.stage !== "CLOSED" && (
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

      {summary.unresolvedTopics.length > 0 && summary.stage !== "CLOSED" && (
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
          <p className="text-[0.75rem] font-medium text-ink">
            {closing === "settled" ? "Khushkhabri! Kya hua?" : "Kaise khatam hua?"}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {options.map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => setOutcome(o)}
                aria-pressed={outcome === o}
                className={`rounded-full border px-2.5 py-1 text-[0.75rem] transition-colors ${
                  outcome === o
                    ? "border-gold-500 bg-gold-50 text-gold-800 dark:bg-gold-900/30 dark:text-gold-200"
                    : "border-line text-ink hover:border-gold-400"
                }`}
              >
                {RISHTA_OUTCOME_LABEL[o]}
              </button>
            ))}
          </div>

          {/* The one outcome that is not just a record. Nothing is auto-reported
              — a person who felt unsafe decides that themselves — but the route
              to doing it must not be something they have to go hunting for. */}
          {outcome === "SAFETY_CONCERN" && (
            <p className="mt-2 text-[0.75rem] leading-relaxed text-muted">
              Agar kisi ne aapke saath kuch galat kiya hai to wo yahan darj karne se aage nahi jaata.{" "}
              <Link href="/safety" className="font-medium text-ink underline underline-offset-2">
                Safety page
              </Link>{" "}
              se report kijiye — usse hum kuch kar sakte hain.
            </p>
          )}

          <label htmlFor="rishta-close-reason" className="mt-3 block text-[0.75rem] text-muted">
            Apne liye kuch likhna ho? (kisi ko nahi dikhta)
          </label>
          <input
            id="rishta-close-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, 300))}
            placeholder={closing === "settled" ? "Jaise: 12 tareekh ko sagai hai" : "Jaise: timing match nahi hui"}
            className="mt-1 min-h-10 w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-[0.875rem] outline-none focus:border-gold-500"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={busy || !outcome}
              onClick={() =>
                void move("CLOSED", { reason: reason.trim() || undefined, outcome: outcome ?? undefined })
              }
              className={`rounded-md border px-3 py-1.5 text-[0.75rem] disabled:opacity-55 ${
                closing === "settled"
                  ? "border-line text-ink hover:border-gold-500"
                  : "border-line text-ink hover:border-danger hover:text-danger"
              }`}
            >
              {closing === "settled" ? "Save" : "Close this rishta"}
            </button>
            <button
              type="button"
              onClick={reset}
              className="rounded-md px-3 py-1.5 text-[0.75rem] text-muted hover:text-ink"
            >
              Cancel
            </button>
            {busy && <Loader2 className="mt-1 size-3.5 animate-spin text-muted" />}
          </div>
          {!outcome && (
            <p className="mt-1.5 text-[0.6875rem] text-muted">Ek wajah chun lijiye — bina uske ye adhoora reh jaata hai.</p>
          )}
        </div>
      ) : (
        summary.nextStages.length > 0 && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {summary.nextStages.map((s) =>
              s.stage === "CLOSED" ? (
                // One `nextStages` entry, two controls. The service offers
                // "CLOSED" as a single move; what ending it *was* is a question
                // only the UI is in a position to ask.
                <span key={s.stage} className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setClosing("settled")}
                    className="flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-[0.75rem] text-ink transition-colors hover:border-gold-500 disabled:opacity-55"
                  >
                    <Heart className="size-3" />
                    Mark as settled
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setClosing("ended")}
                    className="rounded-full px-2.5 py-1 text-[0.75rem] text-muted transition-colors hover:text-danger disabled:opacity-55"
                  >
                    Close this rishta
                  </button>
                </span>
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
