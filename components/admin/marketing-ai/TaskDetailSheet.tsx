"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Circle, CircleDot, Loader2, RefreshCw, XCircle } from "lucide-react";
import Sheet from "@/components/ui/Sheet";
import Button from "@/components/ui/Button";
import Pill from "@/components/ui/Pill";
import Textarea from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";
import { SkeletonText } from "@/components/ui/Skeleton";
import {
  APPROVAL_ACTION_LABEL,
  APPROVAL_PHASE,
  CHANNEL_LABEL,
  OBJECTIVE_LABEL,
  TASK_STATUS_META,
  type ApprovalRow,
  type EvidenceSourceSummary,
  type GuardrailFlag,
  type MarketingPlan,
  type TaskDetail,
} from "@/lib/contracts/marketingAi";
import {
  ACTIVATION_WARNING,
  ACTIVE_DEPLOYMENT_STATUSES,
  META_ACTIVATION_WARNING,
  META_CREATE_EXECUTION_EFFECT,
  PLATFORM_LABEL,
  approvalButtonLabel,
  deploymentActionLabel,
  type DeploymentActionKey,
  type DeploymentRow,
} from "@/lib/contracts/marketingExecution";
import { CreativeMediaSection, DeliveryFacts, MetaFactsPanel } from "./MetaExecutionPanels";
import { paiseToRupeeDisplay } from "@/lib/utils/money";
import { cn } from "@/lib/utils";

/**
 * One task, everything: the plan the model wrote, the evidence it wrote it
 * from, what the guardrails changed, the approval cards, and — since MKT-2 —
 * one deployment card per platform (doc 13 §14): readiness, the safe
 * progress steps, provider ids after read-back, the one error and its fix,
 * and only the actions the state allows. Platform truth is per card; Google
 * and Meta never share a badge.
 */
export default function TaskDetailSheet({ taskId, onClose, onChanged }: { taskId: string | null; onClose: () => void; onChanged: () => void }) {
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  async function load(id: string, quiet = false) {
    if (!quiet) setLoading(true);
    try {
      const res = await fetch(`/api/admin/marketing-ai/tasks/${id}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.message ?? "Load nahi hua");
      setTask(json.task as TaskDetail);
    } catch (err) {
      toast({ title: "Task load nahi hua", description: err instanceof Error ? err.message : undefined, tone: "error" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!taskId) {
      setTask(null);
      return;
    }
    load(taskId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  // Keep the drawer live while its task is running or a deployment is
  // executing; an idle sheet does not poll (doc 13 §14).
  const executing = !!task?.deploymentRows.some((d) => ACTIVE_DEPLOYMENT_STATUSES.has(d.status));
  useEffect(() => {
    if (!taskId || (task?.status !== "WORKING" && !executing)) return;
    const id = setInterval(() => load(taskId, true), 4000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, task?.status, executing]);

  const plan = task?.plan ?? null;
  const deploymentBlocked = !!task?.deploymentRows.some((d) => ["BLOCKED_CONFIG", "BLOCKED_CREATIVE", "FAILED_RETRYABLE", "FAILED_FINAL", "UNKNOWN_OUTCOME", "PARTIAL"].includes(d.status) && d.safeError?.code !== "NOT_EXECUTABLE_YET");

  return (
    <Sheet open={!!taskId} onClose={onClose} variant="side" title="Task" description={task?.request} className="sm:max-w-3xl">
      {loading && !task && <SkeletonText lines={6} />}
      {task && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={TASK_STATUS_META[task.status].tone} size="sm">
              {TASK_STATUS_META[task.status].label}
            </Pill>
            {task.status === "WORKING" && (
              <span className="inline-flex items-center gap-1 text-xs text-muted">
                <Loader2 className="size-3.5 animate-spin" aria-hidden /> {task.currentStep}
              </span>
            )}
            {task.goal && (
              <span className="text-xs text-muted">
                {OBJECTIVE_LABEL[task.goal.objective]} · {task.goal.primaryConversion}
                {task.goal.geography ? ` · ${task.goal.geography}` : ""}
                {task.goal.target !== null ? ` · target ${task.goal.target}` : " · target nahi diya"}
              </span>
            )}
          </div>

          {task.status === "FAILED" && task.blockingReason && (
            <p className="rounded-md border border-danger/25 bg-danger-bg p-3 text-sm text-danger">{task.blockingReason}</p>
          )}
          {task.status === "BLOCKED" && task.blockingReason && !deploymentBlocked && (
            <p className="rounded-md border border-warn/30 bg-warn-bg p-3 text-sm text-ink">
              <span className="font-semibold">Growth Saathi: </span>
              {task.blockingReason} — jawab queue card par likhiye.
            </p>
          )}
          {task.status === "BLOCKED" && deploymentBlocked && (
            <p className="rounded-md border border-warn/30 bg-warn-bg p-3 text-sm text-ink">
              <span className="font-semibold">Deployment ruka hai: </span>
              platform par kuch nahi bana — neeche Deployment card par wajah aur agla kadam hai.
            </p>
          )}

          {task.approvals
            .filter((a) => a.status === "PENDING")
            .map((a) => (
              <ApprovalCard key={a.id} approval={a} flags={task.guardrailFlags} onDecided={() => { load(task.id, true); onChanged(); }} />
            ))}

          {task.deploymentRows.length > 0 && <DeploymentSection rows={task.deploymentRows} onChanged={() => { load(task.id, true); onChanged(); }} />}

          {task.creatives.some((c) => c.kind === "IMAGE") && (task.deploymentRows.some((d) => d.platform === "META") || !!plan?.meta) && (
            <CreativeMediaSection taskId={task.id} creatives={task.creatives} onChanged={() => { load(task.id, true); onChanged(); }} />
          )}

          {plan && <PlanView plan={plan} flags={task.guardrailFlags} />}

          {task.runs[0] && <RunView run={task.runs[0]} />}

          {task.evidence && (
            <Section title="Data jo AI ne padha (evidence snapshot)" defaultOpen={false}>
              <pre className="max-h-96 overflow-auto rounded-md bg-bg-subtle p-3 text-[0.6875rem] leading-relaxed text-muted">{JSON.stringify(task.evidence, null, 2)}</pre>
            </Section>
          )}

          <ThreadView task={task} onSent={() => { load(task.id, true); onChanged(); }} />

          {task.approvals.filter((a) => a.status !== "PENDING").length > 0 && (
            <Section title="Approval history" defaultOpen={false}>
              <ul className="space-y-1 text-xs text-muted">
                {task.approvals
                  .filter((a) => a.status !== "PENDING")
                  .map((a) => (
                    <li key={a.id}>
                      {APPROVAL_ACTION_LABEL[a.action]} — {a.status}
                      {a.decidedAt ? ` · ${new Date(a.decidedAt).toLocaleString("en-IN")}` : ""}
                      {a.decisionReason ? ` · "${a.decisionReason}"` : ""}
                    </li>
                  ))}
              </ul>
            </Section>
          )}
        </div>
      )}
    </Sheet>
  );
}

// ============================================================
// Approval card (§10)
// ============================================================

function ApprovalCard({ approval, flags, onDecided }: { approval: ApprovalRow; flags: GuardrailFlag[]; onDecided: () => void }) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState<"APPROVE" | "REJECT" | null>(null);
  const p = approval.preview;
  const isWrite = approval.action === "CREATE_PAUSED_CAMPAIGNS" || approval.action === "ACTIVATE_CAMPAIGNS";
  const isActivate = approval.action === "ACTIVATE_CAMPAIGNS";
  const label = approvalButtonLabel(approval.action, approval.platform);

  async function decide(decision: "APPROVE" | "REJECT") {
    setBusy(decision);
    try {
      const res = await fetch(`/api/admin/marketing-ai/approvals/${approval.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, reason: reason.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: decision === "APPROVE" ? "Approve nahi hua" : "Reject nahi hua", description: json.message, tone: "error" });
        return;
      }
      if (decision === "REJECT") toast({ title: isWrite ? "Card rejected — platform par kuch nahi badla" : "Package rejected", tone: "success" });
      else if (json.status === "QUEUED") toast({ title: isActivate ? "Activation queued" : "Paused create queued", description: "Worker provider par kaam karega — progress neeche Deployment card par.", tone: "success" });
      else toast({ title: "Package approved", tone: "success" });
      onDecided();
    } catch {
      toast({ title: "Network error — dobara try karein", tone: "error" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={cn("rounded-lg border p-4", isActivate ? "border-danger/40 bg-danger-bg/40" : "border-gold-300/60 bg-gold-50/60 dark:bg-gold-900/20")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">
          {APPROVAL_ACTION_LABEL[approval.action]}
          {approval.platform ? <span className="font-normal text-muted"> · {PLATFORM_LABEL[approval.platform]}</span> : null}
        </h3>
        <span className="text-xs text-muted">expires {new Date(approval.expiresAt).toLocaleDateString("en-IN")}</span>
      </div>
      {isActivate && (
        <p className="mt-2 flex items-start gap-1.5 rounded-md border border-danger/30 bg-surface p-2 text-xs font-semibold text-danger">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {approval.platform === "META" ? META_ACTIVATION_WARNING : ACTIVATION_WARNING}
        </p>
      )}
      {isWrite && !isActivate && (
        <p className="mt-2 text-xs text-trust">
          {approval.platform === "META" ? `${META_CREATE_EXECUTION_EFFECT} Activation ka alag card aayega.` : "Creation se koi spend shuru nahi hota — campaign PAUSED banega; activation ka alag card aayega."}
        </p>
      )}
      {isWrite && !approval.executable && <p className="mt-2 text-xs text-danger">Ye platform is release me execute nahi hota — card sirf preview hai.</p>}
      <dl className="mt-3 grid gap-x-4 gap-y-2 text-xs sm:grid-cols-2">
        <Row k="Account" v={p.account} />
        <Row k="Channel" v={p.channel} />
        <Row k="Audience" v={p.audience} />
        <Row k="Destination" v={p.destination} />
        <Row k="Start / end" v={p.startEnd} />
        <Row k="Conversion event" v={p.conversionEvent} />
        <Row k="Daily budget" v={p.dailyBudget} />
        <Row k="Total budget" v={p.totalBudget} />
      </dl>
      {p.contentPreview.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-ink">
          {p.contentPreview.map((line, i) => (
            <li key={i} className="rounded-sm bg-surface px-2 py-1">{line}</li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-ink">
        <span className="font-semibold">Ab kya hoga: </span>
        {p.whatHappensNow}
      </p>
      <p className="mt-1 text-xs text-muted">
        <span className="font-semibold">Rollback: </span>
        {p.rollback}
      </p>
      {flags.length > 0 && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-warn">
          <AlertTriangle className="size-3.5" aria-hidden /> Guardrails ne {flags.length} cheez badli/hataayi — neeche list hai.
        </p>
      )}
      <p className="mt-2 font-mono text-[0.625rem] text-subtle">payload sha256 {approval.payloadHash.slice(0, 16)}…</p>

      {rejecting ? (
        <div className="mt-3">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500} placeholder="Kyun reject — Growth Saathi agle run me isse seekhta hai" />
          <div className="mt-2 flex flex-wrap justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setRejecting(false)}>
              Cancel
            </Button>
            <Button size="sm" variant="danger" loading={busy === "REJECT"} disabled={!reason.trim()} onClick={() => decide("REJECT")}>
              {isWrite ? "Reject Card" : "Reject Package"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => setRejecting(true)}>
            Reject
          </Button>
          <Button size="sm" variant={isActivate ? "danger" : "accent"} loading={busy === "APPROVE"} disabled={!approval.executable || busy !== null} onClick={() => decide("APPROVE")} icon={<CheckCircle2 className="size-4" />}>
            {label}
          </Button>
        </div>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.6875rem] uppercase tracking-wide text-subtle">{k}</dt>
      <dd className="text-ink">{v}</dd>
    </div>
  );
}

// ============================================================
// Deployments (doc 13 §14) — one card per platform, nothing shared
// ============================================================

function DeploymentSection({ rows, onChanged }: { rows: DeploymentRow[]; onChanged: () => void }) {
  return (
    <Section title="Deployment — platform par kya hua" defaultOpen>
      <div className="space-y-3">
        {rows.map((d) => (
          <DeploymentCard key={d.id} d={d} onChanged={onChanged} />
        ))}
      </div>
    </Section>
  );
}

const ACTION_PATH: Record<DeploymentActionKey, string> = { SYNC: "sync", RETRY: "retry", RECHECK: "recheck", REQUEST_ACTIVATION: "request-activation" };

function DeploymentCard({ d, onChanged }: { d: DeploymentRow; onChanged: () => void }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<DeploymentActionKey | null>(null);
  const active = ACTIVE_DEPLOYMENT_STATUSES.has(d.status);
  const isMeta = d.platform === "META";

  async function act(action: DeploymentActionKey) {
    const label = deploymentActionLabel(action, d.platform);
    setBusy(action);
    try {
      const res = await fetch(`/api/admin/marketing-ai/deployments/${d.id}/${ACTION_PATH[action]}`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || json.ok === false) {
        toast({ title: `${label} nahi hua`, description: json.message, tone: "error" });
      } else {
        toast({ title: label, description: json.message, tone: json.error ? "warning" : "success" });
      }
      onChanged();
    } catch {
      toast({ title: "Network error — dobara try karein", tone: "error" });
    } finally {
      setBusy(null);
    }
  }

  const objects = d.externalCounts
    ? isMeta
      ? `${d.externalCounts.adGroups} ad sets · ${d.externalCounts.keywords} creatives · ${d.externalCounts.ads} ads`
      : `${d.externalCounts.adGroups} ad groups · ${d.externalCounts.keywords} keywords · ${d.externalCounts.ads} ads`
    : "—";

  return (
    <div className="rounded-md border border-line bg-bg-subtle/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-ink">{PLATFORM_LABEL[d.platform]}</span>
          <Pill tone={d.tone} size="sm">
            {d.statusLabel}
          </Pill>
          {active && <Loader2 className="size-3.5 animate-spin text-muted" aria-label="working" />}
          {d.safeError?.code === "NOT_EXECUTABLE_YET" && <span className="text-xs text-muted">is release me executor band hai</span>}
        </div>
        <span className="font-mono text-[0.625rem] text-subtle">{d.executionMarker}</span>
      </div>

      <ol className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[0.6875rem]">
        {d.steps.map((s) => (
          <li key={s.key} className={cn("inline-flex items-center gap-1", s.state === "done" ? "text-trust" : s.state === "active" ? "text-wine-600" : s.state === "error" ? "text-danger" : "text-subtle")}>
            {s.state === "done" ? <CheckCircle2 className="size-3" aria-hidden /> : s.state === "error" ? <XCircle className="size-3" aria-hidden /> : s.state === "active" ? <CircleDot className="size-3" aria-hidden /> : <Circle className="size-3" aria-hidden />}
            {s.label}
          </li>
        ))}
      </ol>

      <dl className="mt-2 grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2 lg:grid-cols-3">
        <Row k="Account" v={d.accountDisplay ?? "connection nahi"} />
        <Row k="Approved budget" v={d.dailyBudgetPaise ? `${paiseToRupeeDisplay(d.dailyBudgetPaise)}/day${d.currency ? ` ${d.currency}` : ""}` : "—"} />
        <Row k="External campaign" v={d.externalCampaignId ? `${d.externalCampaignId}${d.externalStatus ? ` · ${d.externalStatus}` : ""}` : "abhi nahi bana"} />
        <Row k="Window" v={d.startAt && d.endAt ? `${d.startAt} → ${d.endAt}` : "creation par settle hoga"} />
        <Row k="Provider objects" v={objects} />
        <Row k="Last verified" v={d.lastSyncedAt ? new Date(d.lastSyncedAt).toLocaleString("en-IN") : "—"} />
      </dl>

      {isMeta && d.meta && <MetaFactsPanel facts={d.meta} />}

      {d.status === "PAUSED_READY" || d.status === "ACTIVATION_PENDING" ? (
        <p className="mt-2 text-xs text-trust">{isMeta ? "Campaign, ad sets aur ads Meta par PAUSED verified hain — koi spend nahi ho raha." : "Campaign provider par PAUSED verified hai — koi spend nahi ho raha."}</p>
      ) : null}
      {d.status === "LIVE" && (
        <p className="mt-2 text-xs font-semibold text-trust">
          Activated — spend ho sakta hai{d.activatedAt ? ` (${new Date(d.activatedAt).toLocaleString("en-IN")})` : ""}. {isMeta ? "Meta read-back ne campaign, ad sets aur ads configured ACTIVE dikhaye" : "Google read-back ne campaign ENABLED dikhaya"} — asli delivery neeche alag likhi hai.
        </p>
      )}
      {d.status === "BLOCKED_CREATIVE" && isMeta && <p className="mt-2 text-xs text-ink">Neeche “Meta ad images” me har static brief par image attach + approve karein, phir “Re-check Meta readiness”.</p>}
      {(d.delivery || d.status === "LIVE") && <DeliveryFacts platform={d.platform} delivery={d.delivery} />}
      {d.drift && (
        <p className="mt-2 rounded-md border border-warn/30 bg-warn-bg p-2 text-xs text-ink">
          <span className="font-semibold">Needs review: </span>
          {d.drift}
        </p>
      )}
      {d.safeError && (
        <p className="mt-2 rounded-md border border-danger/25 bg-danger-bg p-2 text-xs text-ink">
          <span className="font-mono text-[0.625rem] text-danger">{d.safeError.code}</span> — {d.safeError.message}
          {d.safeError.fix ? (
            <>
              {" "}
              <span className="font-semibold">Kya karein:</span> {d.safeError.fix}
            </>
          ) : null}
          {d.safeError.reconnect ? <span className="ml-1 font-semibold text-danger">(naya token chahiye)</span> : null}
        </p>
      )}

      {d.availableActions.length > 0 && (
        <div className="mt-2 flex flex-wrap justify-end gap-2">
          {d.availableActions.map((a) => (
            <Button key={a} size="sm" variant={a === "REQUEST_ACTIVATION" ? "accent" : "secondary"} loading={busy === a} disabled={busy !== null || active} onClick={() => act(a)} icon={a === "SYNC" ? <RefreshCw className="size-4" /> : undefined}>
              {deploymentActionLabel(a, d.platform)}
            </Button>
          ))}
        </div>
      )}

      {d.events.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-[0.6875rem] text-muted">Execution trail ({d.events.length})</summary>
          <ul className="mt-1 space-y-0.5 font-mono text-[0.625rem] text-muted">
            {d.events.map((e, i) => (
              <li key={i} className={cn(e.level === "error" && "text-danger", e.level === "ok" && "text-trust")}>
                {new Date(e.at).toLocaleTimeString("en-IN")} · {e.step} · {e.message}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

// ============================================================
// Plan view
// ============================================================

function PlanView({ plan, flags }: { plan: MarketingPlan; flags: GuardrailFlag[] }) {
  return (
    <div className="space-y-3">
      <Section title="Diagnosis & evidence" defaultOpen>
        <p className="text-sm leading-relaxed text-ink">{plan.diagnosis}</p>
        {plan.evidence.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[0.6875rem] uppercase tracking-wide text-subtle">
                <tr>
                  <th className="pb-1 pr-3">Claim</th>
                  <th className="pb-1 pr-3">Value</th>
                  <th className="pb-1 pr-3">Source</th>
                  <th className="pb-1 pr-3">Window</th>
                  <th className="pb-1">Geo</th>
                </tr>
              </thead>
              <tbody className="align-top text-ink">
                {plan.evidence.map((e, i) => (
                  <tr key={i} className="border-t border-line">
                    <td className="py-1.5 pr-3">{e.claim}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{e.value}</td>
                    <td className="py-1.5 pr-3 font-mono text-[0.6875rem] text-muted">{e.source}</td>
                    <td className="py-1.5 pr-3 text-muted">{e.window}</td>
                    <td className="py-1.5 text-muted">{e.geography}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {plan.missingData.length > 0 && <List title="Missing data" items={plan.missingData} tone="warn" />}
        {plan.assumptions.length > 0 && <List title="Assumptions / estimates" items={plan.assumptions} />}
      </Section>

      <Section title="Recommended plan" defaultOpen>
        <Row2 k="Goal" v={plan.recommendedPlan.goalSummary} />
        <Row2 k="Audience" v={plan.recommendedPlan.targetAudience} />
        <Row2 k="Offer" v={plan.recommendedPlan.offer} />
        <Row2
          k="Budget"
          v={`₹${plan.recommendedPlan.budget.dailyRupees}/day · ₹${plan.recommendedPlan.budget.totalRupees} total · ${plan.recommendedPlan.budget.windowDays} din${plan.goal.dailyBudgetRupees !== null ? ` (cap ₹${plan.goal.dailyBudgetRupees}/day)` : " (koi cap nahi)"}`}
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {plan.recommendedPlan.channelChoices.map((c) => (
            <Pill key={c.channel} tone="wine" size="sm" className="max-w-full">
              {CHANNEL_LABEL[c.channel]} {c.budgetSharePct}% — {c.reason}
            </Pill>
          ))}
        </div>
        <List title="Testing plan" items={plan.recommendedPlan.testingPlan} />
        <List title="Success conditions" items={plan.recommendedPlan.successConditions} />
        <List title="Failure conditions" items={plan.recommendedPlan.failureConditions} />
        <Row2 k="Success metric" v={plan.successMetric} />
        <List title="Stop conditions" items={plan.stopConditions} />
        <Row2 k="Next review" v={plan.nextReviewAt} />
        <Row2 k="Stop-loss" v={plan.goal.stopLossRule} />
      </Section>

      {plan.googleSearch && (
        <Section title={`Google Search package — ${plan.googleSearch.campaignName}`}>
          <Row2 k="Targeting" v={`${plan.googleSearch.locations.join(", ")} · ${plan.googleSearch.language} · ${plan.googleSearch.network}`} />
          <Row2 k="Bidding" v={`${plan.googleSearch.biddingStrategy}${plan.googleSearch.targetCpaRupees ? ` · target CPA ₹${plan.googleSearch.targetCpaRupees}` : ""} · ₹${plan.googleSearch.dailyBudgetRupees}/day`} />
          <Row2 k="Landing" v={`${plan.googleSearch.landingPath} · utm_source=${plan.googleSearch.utm.source} utm_medium=${plan.googleSearch.utm.medium} utm_campaign=${plan.googleSearch.utm.campaign}`} />
          <Row2 k="Conversion action" v={plan.googleSearch.conversionAction} />
          {plan.googleSearch.adGroups.map((ag, i) => (
            <div key={i} className="mt-3 rounded-md border border-line p-3">
              <p className="text-sm font-semibold text-ink">
                {ag.name} <span className="font-normal text-muted">— {ag.theme}</span>
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                {ag.keywords.map((k, j) => (
                  <span key={j} className="rounded-sm bg-bg-subtle px-1.5 py-0.5 font-mono text-[0.6875rem] text-ink">
                    {k.matchType === "EXACT" ? `[${k.text}]` : k.matchType === "PHRASE" ? `"${k.text}"` : k.text}
                  </span>
                ))}
              </div>
              <Copy title="Headlines" items={ag.headlines} max={30} />
              <Copy title="Descriptions" items={ag.descriptions} max={90} />
            </div>
          ))}
          <List title="Negative keywords" items={plan.googleSearch.negativeKeywords} inline />
          {plan.googleSearch.sitelinks.length > 0 && <List title="Sitelinks" items={plan.googleSearch.sitelinks.map((s) => `${s.text} → ${s.path}`)} inline />}
          <List title="Callouts" items={plan.googleSearch.callouts} inline />
          <Row2 k="Kyun" v={plan.googleSearch.rationale} />
        </Section>
      )}

      {plan.meta && (
        <Section title={`Meta package — ${plan.meta.campaignName}`}>
          <Row2 k="Objective" v={`${plan.meta.objective} · ₹${plan.meta.dailyBudgetRupees}/day · ${plan.meta.schedule.startDate} → ${plan.meta.schedule.endDate}`} />
          <Row2
            k="Audience"
            v={`${plan.meta.audience.description} · ${plan.meta.audience.ageMin}-${plan.meta.audience.ageMax} · ${plan.meta.audience.genders.join("/")} · ${plan.meta.audience.locations.join(", ")}`}
          />
          {plan.meta.audience.interests.length > 0 && <List title="Interests" items={plan.meta.audience.interests} inline />}
          {plan.meta.audience.exclusions.length > 0 && <List title="Exclusions" items={plan.meta.audience.exclusions} inline />}
          <Row2 k="Frequency cap / stop-loss" v={`${plan.meta.frequencyCap} · ${plan.meta.stopLoss}`} />
          <Row2 k="Landing" v={`${plan.meta.landingPath} · utm_campaign=${plan.meta.utm.campaign}`} />
          {plan.meta.adSets.map((s, i) => (
            <p key={i} className="mt-2 text-xs text-ink">
              <span className="font-semibold">{s.name}</span> — ₹{s.dailyBudgetRupees}/day · {s.placements.join(", ")} · creatives {s.creativeIds.join(", ")} · {s.audienceNote}
            </p>
          ))}
          {plan.meta.ads.map((ad) => (
            <div key={ad.id} className="mt-3 rounded-md border border-line p-3 text-xs">
              <p className="font-semibold text-ink">
                {ad.name} <span className="font-normal text-muted">({ad.format} · {ad.cta} · {ad.creativeId})</span>
              </p>
              <p className="mt-1 text-ink">{ad.primaryText}</p>
              <p className="mt-1 text-ink">
                <span className="font-semibold">{ad.headline}</span> — {ad.description}
              </p>
            </div>
          ))}
          <Row2 k="Kyun" v={plan.meta.rationale} />
        </Section>
      )}

      {plan.creative && (
        <Section title="Creative package — hooks, Reels, Stories, statics">
          <div className="space-y-1">
            {plan.creative.hooks.map((h) => (
              <p key={h.id} className="text-sm text-ink">
                <span className="font-mono text-[0.6875rem] text-muted">{h.id} · {h.angle}</span> — {h.text}
              </p>
            ))}
          </div>
          <List title="Visual directions" items={plan.creative.visualDirections} />
          {plan.creative.videos.map((v) => (
            <details key={v.id} className="mt-3 rounded-md border border-line p-3">
              <summary className="cursor-pointer text-sm font-semibold text-ink">
                {v.format} · {v.title} <span className="font-normal text-muted">({v.concept}, {v.durationSec}s, hook {v.hookId})</span>
              </summary>
              <div className="mt-2 space-y-2 text-xs text-ink">
                <Row2 k="Hook" v={v.hook} />
                <Row2 k="Script" v={v.script} />
                <List title="Storyboard" items={v.storyboard} ordered />
                <List title="On-screen text" items={v.onScreenText} />
                <Row2 k="Voiceover" v={v.voiceover} />
                <Row2 k="Subtitles" v={v.subtitleText} />
                <Row2 k="Music / cover" v={`${v.musicMood} · cover: ${v.coverText}`} />
                <Row2 k="Caption" v={v.caption} />
                <Row2 k="CTA / UTM" v={`${v.cta} · utm_content=${v.utmContent}`} />
                <List title="Compliance notes" items={v.complianceNotes} />
              </div>
            </details>
          ))}
          {plan.creative.statics.map((s) => (
            <div key={s.id} className="mt-3 rounded-md border border-line p-3 text-xs text-ink">
              <p className="font-semibold">
                {s.id} · {s.headline}
              </p>
              <p className="mt-1">{s.subline}</p>
              <p className="mt-1 text-muted">Visual: {s.visualDirection} · CTA: {s.cta}</p>
            </div>
          ))}
          <List title="Brand safety checklist" items={plan.creative.brandSafetyChecklist} />
        </Section>
      )}

      {plan.landing && (
        <Section title={`Landing package — ${plan.landing.path}${plan.landing.useExistingPage ? "" : " (naya page proposal)"}`}>
          <Row2 k="Hero" v={plan.landing.heroHeadline} />
          <Row2 k="Sub copy" v={plan.landing.subCopy} />
          <Row2 k="Primary CTA" v={plan.landing.primaryCta} />
          <List title="Trust proof" items={plan.landing.trustProof} />
          <Row2 k="Verification explainer" v={plan.landing.verificationExplainer} />
          <Row2 k="Grio voice CTA" v={plan.landing.grioVoiceCta ? "Haan" : "Nahi"} />
          <List title="Analytics events" items={plan.landing.analyticsEvents} inline />
          <List title="Changes needed" items={plan.landing.changesNeeded} />
        </Section>
      )}

      {plan.topics.length > 0 && (
        <Section title={`Topics — ${plan.topics.filter((t) => !t.rejected).length} selected, ${plan.topics.filter((t) => t.rejected).length} rejected`} defaultOpen={false}>
          {plan.topics.map((t, i) => (
            <div key={i} className={cn("mt-2 rounded-md border border-line p-3 text-xs", t.rejected && "opacity-60")}>
              <p className="text-sm font-semibold text-ink">
                {t.topic} {t.rejected && <Pill tone="neutral" size="sm">rejected</Pill>}
              </p>
              <p className="mt-1 text-ink">{t.whyThisTopic}</p>
              <p className="mt-1 text-muted">
                {t.source} · {t.geography} · {t.window} · {t.audience} · {t.conversionGoal}
              </p>
              <p className="mt-1 text-muted">Angle: {t.bandhantakAngle}</p>
              <p className="mt-1 font-mono text-[0.6875rem] text-muted">
                demand {t.scores.demandEvidence} · relevance {t.scores.relevance} · fit {t.scores.audienceFit} · truth {t.scores.productTruth} · creative {t.scores.creativePotential} · safety {t.scores.safety}
              </p>
              {t.rejectionReason && <p className="mt-1 text-danger">{t.rejectionReason}</p>}
            </div>
          ))}
        </Section>
      )}

      {(plan.approvalsNeeded.length > 0 || plan.requestedToolCalls.length > 0) && (
        <Section title="Aage kya approve karna hoga (agle phases)" defaultOpen={false}>
          <ul className="space-y-1 text-xs text-ink">
            {plan.approvalsNeeded.map((a, i) => (
              <li key={i}>
                <span className="font-semibold">{APPROVAL_ACTION_LABEL[a.action]}</span> <Pill tone="neutral" size="sm">{APPROVAL_PHASE[a.action]}</Pill> — {a.what}
                {a.budgetRupees !== null ? ` · ₹${a.budgetRupees}` : ""}
              </li>
            ))}
          </ul>
          {plan.requestedToolCalls.length > 0 && (
            <p className="mt-2 text-xs text-muted">Tools maange: {plan.requestedToolCalls.map((t) => t.tool).join(", ")} — external write tools approval ke bina kabhi nahi chalte.</p>
          )}
        </Section>
      )}

      {flags.length > 0 && (
        <Section title={`Guardrails — ${flags.length} change/flag`} defaultOpen={false}>
          <ul className="space-y-1 text-xs">
            {flags.map((f, i) => (
              <li key={i} className="flex gap-2">
                <Pill tone={f.kind === "PACKAGE_INCOMPLETE" ? "danger" : "gold"} size="sm" className="shrink-0">
                  {f.kind}
                </Pill>
                <span className="text-ink">
                  <span className="font-mono text-[0.6875rem] text-muted">{f.path}</span> — {f.detail}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

// ============================================================
// Run / sources / thread
// ============================================================

const SOURCE_TONE: Record<EvidenceSourceSummary["status"], "trust" | "gold" | "neutral" | "danger"> = {
  ok: "trust",
  stale: "gold",
  empty: "neutral",
  not_connected: "neutral",
  needs_attention: "danger",
  error: "danger",
};

function RunView({ run }: { run: TaskDetail["runs"][number] }) {
  return (
    <Section title="Data sources & tools" defaultOpen={false}>
      <p className="text-xs text-muted">
        {run.provider ? `${run.provider.toLowerCase()} · ${run.modelId}` : "—"}
        {run.inputTokens !== null ? ` · ${run.inputTokens} in / ${run.outputTokens} out tokens` : ""}
        {run.finishedAt ? ` · ${Math.round((new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 1000)}s` : ""}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {run.sources.map((s) => (
          <span key={s.source} title={s.note ?? s.window}>
            <Pill tone={SOURCE_TONE[s.status]} size="sm" className="max-w-full">
              {s.source} · {s.status}
            </Pill>
          </span>
        ))}
      </div>
      <ul className="mt-2 space-y-0.5 font-mono text-[0.6875rem] text-muted">
        {run.toolsCalled.map((t, i) => (
          <li key={i} className="flex items-center gap-1.5">
            {t.ok ? <CheckCircle2 className="size-3 text-trust" aria-hidden /> : <XCircle className="size-3 text-danger" aria-hidden />}
            {t.tool} <span className="text-subtle">{t.tier}</span> {t.ms}ms{t.rows !== null ? ` · ${t.rows} rows` : ""}
            {t.error ? ` · ${t.error}` : ""}
          </li>
        ))}
      </ul>
    </Section>
  );
}

function ThreadView({ task, onSent }: { task: TaskDetail; onSent: () => void }) {
  const { toast } = useToast();
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function revise() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/marketing-ai/tasks/${task.id}/continue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: task.status === "BLOCKED" ? "answer" : "revise", text: notes.trim() }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Bhej nahi paaye", description: json.message, tone: "error" });
        return;
      }
      setNotes("");
      toast({ title: "Growth Saathi dobara kaam par", tone: "success" });
      onSent();
    } catch {
      toast({ title: "Network error — dobara try karein", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Conversation" defaultOpen={false}>
      <ul className="space-y-2 text-xs">
        {task.thread.map((t, i) => (
          <li key={i} className={cn("rounded-md p-2", t.role === "admin" ? "bg-bg-subtle text-ink" : "border border-line text-ink")}>
            <span className="font-semibold">{t.role === "admin" ? "Aap" : "Growth Saathi"}:</span> {t.text}
            <span className="ml-2 text-subtle">{new Date(t.at).toLocaleString("en-IN")}</span>
          </li>
        ))}
      </ul>
      {task.status !== "WORKING" && (
        <div className="mt-3">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder={task.status === "BLOCKED" ? "Growth Saathi ke sawaal ka jawab…" : "Kya badalna hai? (naya run banega, pending approval expire hoga)"}
          />
          <div className="mt-2 flex justify-end">
            <Button size="sm" variant="secondary" loading={busy} disabled={!notes.trim()} onClick={revise}>
              {task.status === "BLOCKED" ? "Send Answer" : "Revise Package"}
            </Button>
          </div>
        </div>
      )}
    </Section>
  );
}

// ============================================================
// Small presentational helpers
// ============================================================

function Section({ title, children, defaultOpen = true }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="rounded-lg border border-line bg-surface p-3">
      <summary className="cursor-pointer text-sm font-semibold text-ink">{title}</summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}

function Row2({ k, v }: { k: string; v: string }) {
  return (
    <p className="mt-1.5 text-xs text-ink">
      <span className="font-semibold">{k}: </span>
      {v}
    </p>
  );
}

function List({ title, items, tone, inline, ordered }: { title: string; items: string[]; tone?: "warn"; inline?: boolean; ordered?: boolean }) {
  if (!items.length) return null;
  if (inline) {
    return (
      <p className="mt-1.5 text-xs text-ink">
        <span className="font-semibold">{title}: </span>
        {items.join(" · ")}
      </p>
    );
  }
  const Tag = ordered ? "ol" : "ul";
  return (
    <div className="mt-1.5">
      <p className={cn("text-xs font-semibold", tone === "warn" ? "text-warn" : "text-ink")}>{title}</p>
      <Tag className={cn("ml-4 text-xs text-ink", ordered ? "list-decimal" : "list-disc")}>
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </Tag>
    </div>
  );
}

function Copy({ title, items, max }: { title: string; items: string[]; max: number }) {
  return (
    <div className="mt-2">
      <p className="text-xs font-semibold text-ink">{title}</p>
      <ul className="mt-1 space-y-0.5 text-xs text-ink">
        {items.map((h, i) => (
          <li key={i} className="flex items-baseline justify-between gap-2">
            <span>{h}</span>
            <span className={cn("shrink-0 font-mono text-[0.625rem]", h.length > max ? "text-danger" : "text-subtle")}>
              {h.length}/{max}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
