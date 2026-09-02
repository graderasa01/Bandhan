"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import Card from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import type { SafetyCaseRow } from "@/lib/services/safety/safetyCaseService";

/**
 * The safety queue, with the playbook open beside each case.
 *
 * ## Why the steps are on the case and not in a wiki
 *
 * A playbook nobody can see while working is a playbook nobody follows. These
 * are the same steps `playbooks.ts` defines, rendered next to the one case they
 * apply to, and ticking one writes to the case — so "did anyone check the other
 * person's record" is answerable a month later.
 *
 * ## What this screen deliberately does not show
 *
 * The member's own words, unless they chose to file them as a report. The
 * meeting checkpoint note and the closure reason are private by design, and
 * this console is the exact place that promise would be quietly broken. What
 * it shows instead is who to call.
 */

const STATUS_LABEL: Record<SafetyCaseRow["status"], string> = {
  OPEN: "Khula",
  IN_REVIEW: "Dekha ja raha hai",
  ACTION_TAKEN: "Action liya",
  CLOSED_NO_ACTION: "Band — koi action nahi",
};

export default function SafetyCaseConsole({
  initial,
  firstResponseHours,
}: {
  initial: SafetyCaseRow[];
  firstResponseHours: number;
}) {
  if (initial.length === 0) {
    return (
      <Card variant="soft" padding="lg" className="mt-6 text-center">
        <Check className="mx-auto size-10 text-trust" aria-hidden />
        <p className="mt-3 font-semibold text-ink">Koi khula case nahi hai.</p>
        <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-muted">
          Jab koi apna rishta &quot;kuch theek nahi laga&quot; keh kar band karega, mulaqat ke baad wahi jawab dega,
          ya kisi booking par shikayat karega — wo yahan aa jayega. {firstResponseHours} ghante me na uthaya gaya
          case sabse upar chala jaata hai.
        </p>
      </Card>
    );
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      {initial.map((row) => (
        <CaseCard key={row.id} row={row} />
      ))}
    </div>
  );
}

function CaseCard({ row }: { row: SafetyCaseRow }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<string[]>(row.stepsDone);
  const [note, setNote] = useState(row.resolutionNote ?? "");

  async function send(body: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/safety-cases/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        toast({ title: "Nahi ho paya", description: json?.message ?? "Dobara try karein.", tone: "error" });
        return;
      }
      toast({ title: "Save ho gaya", tone: "success" });
      router.refresh();
    } catch {
      toast({ title: "Network error", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  function toggleStep(id: string) {
    const next = steps.includes(id) ? steps.filter((s) => s !== id) : [...steps, id];
    setSteps(next);
    void send({ stepsDone: next });
  }

  return (
    <Card variant="default" padding="lg">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-ink">{row.playbook.label}</h2>
            {row.escalated && (
              <span className="inline-flex items-center gap-1 rounded-full border border-wine-300 bg-wine-50 px-2 py-0.5 text-[0.6875rem] font-medium text-wine-700 dark:border-wine-900/40 dark:bg-wine-900/20 dark:text-wine-300">
                <AlertTriangle className="size-3" aria-hidden />
                Der ho chuki hai
              </span>
            )}
            <span className="rounded-full border border-line bg-bg-subtle px-2 py-0.5 text-[0.6875rem] text-muted">
              {STATUS_LABEL[row.status]}
            </span>
          </div>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">{row.playbook.what}</p>
        </div>
        <p className="shrink-0 text-right text-[0.6875rem] text-muted">
          {row.ageHours < 24 ? `${row.ageHours} ghante pehle` : `${Math.floor(row.ageHours / 24)} din pehle`}
          {row.claimedBy && <span className="mt-0.5 block">uthaya ja chuka hai</span>}
        </p>
      </div>

      {/* Who */}
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 rounded-md border border-line/70 bg-surface-2 px-3 py-2.5 text-[0.8125rem]">
        <span className="text-muted">
          Inhone kaha:{" "}
          <Link href={`/admin/users?q=${encodeURIComponent(row.raisedBy.name)}`} className="font-medium text-ink underline-offset-2 hover:underline">
            {row.raisedBy.name}
          </Link>
        </span>
        {row.about && (
          <span className="text-muted">
            Kiske baare me:{" "}
            <Link href={`/admin/users?q=${encodeURIComponent(row.about.name)}`} className="font-medium text-ink underline-offset-2 hover:underline">
              {row.about.name}
            </Link>
          </span>
        )}
        {row.partner && (
          <span className="text-muted">
            Partner:{" "}
            <Link href={`/admin/partners/${row.partner.id}`} className="font-medium text-ink underline-offset-2 hover:underline">
              {row.partner.name}
            </Link>
          </span>
        )}
      </div>

      {/* Their words, only where they exist */}
      {row.report && (
        <div className="mt-2 rounded-md border border-line/70 bg-surface-2 px-3 py-2.5">
          <p className="text-[0.6875rem] font-medium uppercase tracking-wide text-muted">Inhone report me likha</p>
          <p className="mt-1 text-[0.8125rem] leading-relaxed text-ink">{row.report.reason}</p>
          {row.report.details && <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted">{row.report.details}</p>}
        </div>
      )}
      {row.disputeReason && (
        <div className="mt-2 rounded-md border border-line/70 bg-surface-2 px-3 py-2.5">
          <p className="text-[0.6875rem] font-medium uppercase tracking-wide text-muted">Buyer ki shikayat</p>
          <p className="mt-1 text-[0.8125rem] leading-relaxed text-ink">{row.disputeReason}</p>
        </div>
      )}
      {!row.report && !row.disputeReason && (
        <p className="mt-2 text-[0.75rem] leading-relaxed text-muted">
          Inhone abhi kuch likha nahi hai — aur jo apne liye likha tha wo hum padh nahi sakte. Pehla kadam yahi hai:
          poochiye.
        </p>
      )}

      {/* Playbook */}
      <ol className="mt-4 flex flex-col gap-1.5">
        {row.playbook.steps.map((step, i) => {
          const done = steps.includes(step.id);
          return (
            <li key={step.id}>
              <button
                type="button"
                disabled={busy}
                onClick={() => toggleStep(step.id)}
                className={`flex w-full items-start gap-2.5 rounded-md border px-3 py-2 text-left transition-colors disabled:opacity-60 ${
                  done ? "border-trust/30 bg-trust-bg" : "border-line/70 bg-surface hover:border-gold-500"
                }`}
              >
                <span
                  className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded border ${
                    done ? "border-trust bg-trust text-white" : "border-line-strong"
                  }`}
                  aria-hidden
                >
                  {done && <Check className="size-3" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-[0.8125rem] font-medium text-ink">
                    {i + 1}. {step.title}
                  </span>
                  <span className="mt-0.5 block text-[0.75rem] leading-relaxed text-muted">{step.detail}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <p className="mt-3 rounded-md border border-wine-200 bg-wine-50 px-3 py-2 text-[0.75rem] leading-relaxed text-wine-700 dark:border-wine-900/40 dark:bg-wine-900/20 dark:text-wine-300">
        <strong>Kabhi nahi:</strong> {row.playbook.never}
      </p>

      {/* Close */}
      <div className="mt-4 border-t border-line/60 pt-3">
        <label className="text-[0.75rem] font-medium text-ink" htmlFor={`note-${row.id}`}>
          Kya kiya, aur kyun
        </label>
        <textarea
          id={`note-${row.id}`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={2000}
          className="mt-1 w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm outline-none focus:border-gold-500"
          placeholder="Ek line kaafi hai — lekin honi chahiye."
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => send({ status: "ACTION_TAKEN", resolutionNote: note })}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-line px-3 text-xs font-medium text-ink hover:border-gold-500 disabled:opacity-55"
          >
            {busy && <Loader2 className="size-3.5 animate-spin" />}
            Action liya — band kijiye
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => send({ status: "CLOSED_NO_ACTION", resolutionNote: note })}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-line px-3 text-xs font-medium text-muted hover:border-gold-500 disabled:opacity-55"
          >
            Koi action nahi — band kijiye
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => send({ resolutionNote: note })}
            className="inline-flex min-h-9 items-center rounded-md px-3 text-xs font-medium text-muted hover:text-ink disabled:opacity-55"
          >
            Sirf note save kijiye
          </button>
        </div>
      </div>
    </Card>
  );
}
