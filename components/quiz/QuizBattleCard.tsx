"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Loader2, Swords } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import QuizBattleSheet from "./QuizBattleSheet";
import type { QuizBattleView } from "@/lib/services/quiz/quizBattleService";

const POLL_MS = 4000;

/**
 * Lives inside the message thread, same shape as `ContactShareCard` — a
 * consent-and-state card scoped to one match, not a separate page. Unlike
 * that card, this one polls itself (same interval `MessageThread` already
 * uses for messages): a partner's quiz progress is exactly the kind of thing
 * worth a live update while both sides are actively in the thread together.
 */
export default function QuizBattleCard({ matchId, otherName }: { matchId: string; otherName: string }) {
  const { toast } = useToast();
  const [battle, setBattle] = useState<QuizBattleView | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  /** Results default collapsed — the 5-line breakdown otherwise buries the actual chat below it every time the thread opens. */
  const [resultsOpen, setResultsOpen] = useState(false);

  async function refresh() {
    try {
      const res = await fetch(`/api/matches/${matchId}/quiz`);
      const json = await res.json();
      if (json.ok) setBattle(json.battle);
    } catch {
      // silent — next tick retries, same as the thread's message polling
    }
  }

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, POLL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  async function propose() {
    setBusy(true);
    try {
      const res = await fetch(`/api/matches/${matchId}/quiz`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Battle shuru nahi ho payi", description: json.message, tone: "error" });
        return;
      }
      await refresh();
    } catch {
      toast({ title: "Network error — dobara try karein", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function respond(accept: boolean) {
    if (!battle) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/matches/${matchId}/quiz/${battle.id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accept }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Nahi ho paya", description: json.message, tone: "error" });
        return;
      }
      await refresh();
    } catch {
      toast({ title: "Network error — dobara try karein", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  if (battle === undefined) return null; // first load — nothing to show yet, no flicker

  return (
    <Card variant="soft" padding="md" className="mb-3">
      <div className="flex items-start gap-3">
        <span className="mt-px grid size-8 shrink-0 place-items-center rounded-full bg-wine-100 text-wine-700 dark:bg-wine-900/50 dark:text-wine-300">
          <Swords className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          {!battle || battle.status === "DECLINED" ? (
            <>
              <p className="text-[0.875rem] font-semibold text-ink">Quiz Battle khelein?</p>
              <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-muted">
                5 halke-phulke sawaal, dono ke jawab compare honge — dekhein kitna milta hai.
              </p>
              <Button size="sm" variant="secondary" className="mt-2" loading={busy} onClick={propose}>
                Start Battle
              </Button>
            </>
          ) : battle.status === "PENDING" ? (
            battle.isInitiator ? (
              <p className="text-[0.8125rem] text-muted">
                Invite bhej di hai — {otherName} ke jawab ka intezaar hai.
              </p>
            ) : (
              <>
                <p className="text-[0.875rem] font-semibold text-ink">{otherName} ne Quiz Battle ke liye bulaya hai</p>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="secondary" loading={busy} onClick={() => respond(true)}>
                    Khelein
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => respond(false)}>
                    Not Now
                  </Button>
                </div>
              </>
            )
          ) : battle.status === "ACTIVE" ? (
            <>
              <p className="text-[0.875rem] font-semibold text-ink">Quiz Battle chal rahi hai</p>
              <p className="mt-0.5 text-[0.8125rem] text-muted">
                Aapke {battle.myAnsweredCount}/{battle.questions.length} · {otherName} ke{" "}
                {battle.theirAnsweredCount}/{battle.questions.length}
              </p>
              {battle.myAnsweredCount < battle.questions.length ? (
                <Button size="sm" variant="secondary" className="mt-2" onClick={() => setSheetOpen(true)}>
                  Answer
                </Button>
              ) : (
                <p className="mt-1.5 flex items-center gap-1.5 text-[0.75rem] text-muted">
                  <Loader2 className="size-3 animate-spin" />
                  {otherName} ke jawab ka intezaar
                </p>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setResultsOpen((v) => !v)}
                aria-expanded={resultsOpen}
                className="flex w-full items-center justify-between gap-2 text-left"
              >
                <p className="text-[0.875rem] font-semibold text-ink">
                  {battle.matchCount}/{battle.questions.length} jawab same nikle!
                </p>
                {resultsOpen ? (
                  <ChevronUp className="size-4 shrink-0 text-muted" />
                ) : (
                  <ChevronDown className="size-4 shrink-0 text-muted" />
                )}
              </button>
              {resultsOpen && (
                <ul className="mt-2 space-y-1.5">
                  {battle.questions.map((q) => {
                    const matched = q.myAnswer !== null && q.myAnswer === q.theirAnswer;
                    return (
                      <li key={q.key} className="text-[0.75rem] text-muted">
                        <span className={matched ? "text-trust" : "text-subtle"}>{matched ? "✓" : "·"}</span>{" "}
                        {q.question} — Aap: {q.myAnswer !== null ? q.options[q.myAnswer] : "—"}, {otherName}:{" "}
                        {q.theirAnswer !== null ? q.options[q.theirAnswer] : "—"}
                      </li>
                    );
                  })}
                </ul>
              )}
              <Button size="sm" variant="ghost" className="mt-2" loading={busy} onClick={propose}>
                New Battle
              </Button>
            </>
          )}
        </div>
      </div>

      <QuizBattleSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        matchId={matchId}
        battleId={battle?.id ?? null}
        questions={battle?.questions ?? []}
        onAnswered={refresh}
      />
    </Card>
  );
}
