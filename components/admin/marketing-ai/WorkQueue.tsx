"use client";

import { useState } from "react";
import { ClipboardCheck, Loader2, MessageCircleQuestion, RefreshCw } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Pill from "@/components/ui/Pill";
import Textarea from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";
import { paiseToRupeeDisplay } from "@/lib/utils/money";
import { CHANNEL_LABEL, TASK_STATUSES, TASK_STATUS_META, type MarketingChannel, type TaskRow, type TaskStatusKey } from "@/lib/contracts/marketingAi";
import { DEPLOYMENT_STATUS_META, PLATFORM_LABEL } from "@/lib/contracts/marketingExecution";
import { cn } from "@/lib/utils";

const OPEN_STATUSES: TaskStatusKey[] = ["NEEDS_APPROVAL", "WORKING", "SCHEDULED_LIVE", "RESULT_READY", "BLOCKED"];
const CLOSED_STATUSES: TaskStatusKey[] = ["REJECTED", "FAILED"];

function channelLabel(c: string): string {
  return (CHANNEL_LABEL as Record<string, string>)[c as MarketingChannel] ?? c;
}

/**
 * Zone B (§2). Grouped by the five queue states in the document's order,
 * then the two terminal ones. Every row answers the doc's list — what the
 * AI is doing, for which goal, on which channels, with how much money,
 * what will be created, how much evidence — and offers the one action the
 * row's state allows.
 */
export default function WorkQueue({ tasks, onOpen, onChanged }: { tasks: TaskRow[]; onOpen: (id: string) => void; onChanged: () => void }) {
  const [showClosed, setShowClosed] = useState(false);
  const open = tasks.filter((t) => OPEN_STATUSES.includes(t.status));
  const closed = tasks.filter((t) => CLOSED_STATUSES.includes(t.status));

  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink">Work queue</h2>
        <p className="text-xs text-muted">{open.length} open · {closed.length} closed</p>
      </div>

      {open.length === 0 && (
        <Card variant="soft" padding="lg">
          <p className="text-center text-sm text-muted">Abhi koi task nahi. Upar goal likhiye — Growth Saathi data padh kar package banayega.</p>
        </Card>
      )}

      {TASK_STATUSES.filter((s) => OPEN_STATUSES.includes(s)).map((status) => {
        const rows = open.filter((t) => t.status === status);
        if (!rows.length) return null;
        return (
          <div key={status} className="space-y-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Pill tone={TASK_STATUS_META[status].tone} size="sm">
                {TASK_STATUS_META[status].label}
              </Pill>
              <span className="text-xs font-normal text-muted">{rows.length}</span>
            </h3>
            {rows.map((t) => (
              <TaskCard key={t.id} task={t} onOpen={onOpen} onChanged={onChanged} />
            ))}
          </div>
        );
      })}

      {closed.length > 0 && (
        <div className="space-y-2">
          <button type="button" onClick={() => setShowClosed((s) => !s)} className="min-h-9 text-sm font-medium text-muted hover:text-ink">
            {showClosed ? "Closed chhupayein" : `Closed dikhayein (${closed.length})`}
          </button>
          {showClosed && closed.map((t) => <TaskCard key={t.id} task={t} onOpen={onOpen} onChanged={onChanged} />)}
        </div>
      )}
    </section>
  );
}

function TaskCard({ task, onOpen, onChanged }: { task: TaskRow; onOpen: (id: string) => void; onChanged: () => void }) {
  const { toast } = useToast();
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const meta = TASK_STATUS_META[task.status];
  const isWorking = task.status === "WORKING";
  // A block can be Growth Saathi's one question (answer box) or a platform
  // deployment needing config/review (open the sheet) — never both.
  const shownDeployments = task.deployments.filter((d) => d.status !== "CANCELLED");
  const deploymentBlocked = shownDeployments.some((d) => !d.notExecutableYet && ["BLOCKED_CONFIG", "BLOCKED_CREATIVE", "FAILED_RETRYABLE", "FAILED_FINAL", "UNKNOWN_OUTCOME", "PARTIAL"].includes(d.status));
  const needsAnswer = task.status === "BLOCKED" && !!task.blockingReason && !deploymentBlocked;

  async function send(kind: "answer" | "revise", text: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/marketing-ai/tasks/${task.id}/continue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, text }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Bhej nahi paaye", description: json.message, tone: "error" });
        return;
      }
      setAnswer("");
      toast({ title: "Growth Saathi dobara kaam par", tone: "success" });
      onChanged();
    } catch {
      toast({ title: "Network error — dobara try karein", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card padding="md" className={cn(isWorking && "border-wine-200/70")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">{task.request}</p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
            {isWorking && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
            {task.status === "BLOCKED" && <MessageCircleQuestion className="size-3.5" aria-hidden />}
            {task.status === "FAILED" ? task.blockingReason : task.summary ?? task.currentStep ?? meta.label}
          </p>
          {task.status !== "FAILED" && task.currentStep && task.summary && <p className="mt-0.5 text-xs text-subtle">{task.currentStep}</p>}
          {shownDeployments.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {shownDeployments.map((d) => (
                <Pill key={d.id} tone={d.notExecutableYet ? "neutral" : DEPLOYMENT_STATUS_META[d.status].tone} size="sm">
                  {PLATFORM_LABEL[d.platform]}: {d.notExecutableYet ? "next phase (MKT-2B)" : DEPLOYMENT_STATUS_META[d.status].label}
                </Pill>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {task.status === "NEEDS_APPROVAL" && (
            <Button size="sm" variant="accent" onClick={() => onOpen(task.id)} icon={<ClipboardCheck className="size-4" />}>
              Review & Approve
            </Button>
          )}
          {task.status === "BLOCKED" && deploymentBlocked && (
            <Button size="sm" variant="secondary" onClick={() => onOpen(task.id)}>
              Fix Deployment
            </Button>
          )}
          {task.status === "FAILED" && (
            <Button size="sm" variant="secondary" loading={busy} onClick={() => send("revise", "Pichhla run fail hua tha — dobara try karo.")} icon={<RefreshCw className="size-4" />}>
              Retry
            </Button>
          )}
          {!isWorking && (
            <Button size="sm" variant="ghost" onClick={() => onOpen(task.id)}>
              Open
            </Button>
          )}
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3 lg:grid-cols-6">
        <Meta label="Goal" value={task.goal ? `${task.goal.name}${task.goal.geography ? ` · ${task.goal.geography}` : ""}` : "—"} />
        <Meta label="Channels" value={task.channels.length ? task.channels.map(channelLabel).join(", ") : "—"} />
        <Meta
          label="Budget"
          value={
            task.budgetDailyPaise || task.budgetTotalPaise
              ? `${task.budgetDailyPaise ? `${paiseToRupeeDisplay(task.budgetDailyPaise)}/day` : ""}${task.budgetDailyPaise && task.budgetTotalPaise ? " · " : ""}${task.budgetTotalPaise ? `${paiseToRupeeDisplay(task.budgetTotalPaise)} total` : ""}`
              : "—"
          }
        />
        <Meta label="Will create" value={task.draftCount || task.creativeCount ? `${task.draftCount} campaign draft, ${task.creativeCount} creative` : "—"} />
        <Meta label="Evidence" value={task.evidenceCount ? `${task.evidenceCount} sourced claims` : "—"} />
        <Meta label="Model" value={task.lastRun?.modelId ?? "—"} />
      </dl>

      {needsAnswer && (
        <div className="mt-3 rounded-md border border-line bg-bg-subtle p-3">
          <p className="text-sm text-ink">
            <span className="font-semibold">Growth Saathi:</span> {task.blockingReason}
          </p>
          <Textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={2} maxLength={2000} placeholder="Jawab likhiye…" className="mt-2" />
          <div className="mt-2 flex justify-end">
            <Button size="sm" variant="primary" loading={busy} disabled={!answer.trim()} onClick={() => send("answer", answer.trim())}>
              Send Answer
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.6875rem] uppercase tracking-wide text-subtle">{label}</dt>
      <dd className="truncate text-ink" title={value}>
        {value}
      </dd>
    </div>
  );
}
