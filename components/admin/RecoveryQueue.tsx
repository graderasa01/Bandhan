"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownRight, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

/**
 * Debts the platform is carrying, and the one thing an admin can do about them.
 *
 * There is no "create" button. A recovery is always the consequence of a refund
 * that landed after the money left, so every row can be traced to a booking —
 * which is what makes "why do I owe this" an answerable question rather than an
 * argument with support.
 */
export interface AdminRecoveryRow {
  id: string;
  partnerName: string;
  outstandingPaise: number;
  amountPaise: number;
  reason: string;
  createdAt: string;
}

function rupees(paise: number): string {
  return `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;
}

export default function RecoveryQueue({ rows }: { rows: AdminRecoveryRow[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  if (rows.length === 0) return null;

  async function waive(id: string) {
    if (busy || reason.trim().length < 3) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/recoveries/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "waive", reason: reason.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: "Nahi ho paya", description: json?.message ?? "Dobara try karein.", tone: "error" });
        return;
      }
      setActiveId(null);
      setReason("");
      router.refresh();
    } catch {
      toast({ title: "Network error", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  const total = rows.reduce((n, r) => n + r.outstandingPaise, 0);

  return (
    <section className="mb-6">
      <h2 className="text-xl font-bold text-wine-700">Recoveries</h2>
      <p className="mt-1 text-sm text-muted">
        {rupees(total)} refund ke baad partners se wapas aana baaki hai. Ye apne aap unki agli earning se katega
        — waive tabhi kariye jab wapas nahi lena.
      </p>

      <ul className="mt-3 flex flex-col gap-2">
        {rows.map((r) => (
          <li key={r.id} className="rounded-lg border border-line bg-surface p-3">
            <div className="flex flex-wrap items-center gap-2">
              <ArrowDownRight className="size-4 shrink-0 text-warn" aria-hidden />
              <span className="text-sm font-semibold text-ink">{r.partnerName}</span>
              <span className="text-sm text-warn">{rupees(r.outstandingPaise)}</span>
              {r.outstandingPaise !== r.amountPaise && (
                <span className="text-xs text-muted">({rupees(r.amountPaise)} me se bacha hua)</span>
              )}
              <span className="ml-auto text-xs text-muted">
                {new Date(r.createdAt).toLocaleDateString("en-IN")}
              </span>
            </div>
            <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted">{r.reason}</p>

            {activeId === r.id ? (
              <div className="mt-2 flex flex-col gap-2">
                <input
                  autoFocus
                  value={reason}
                  onChange={(e) => setReason(e.target.value.slice(0, 500))}
                  placeholder="Waive karne ka reason — audit log me jayega"
                  className="min-h-10 rounded-md border border-line-strong bg-surface px-3 py-2 text-sm outline-none focus:border-gold-500"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={busy || reason.trim().length < 3}
                    onClick={() => void waive(r.id)}
                    className="rounded-md border border-line px-3 py-2 text-xs font-medium text-ink hover:border-gold-500 disabled:opacity-55"
                  >
                    Waive kariye
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveId(null)}
                    className="px-2 py-2 text-xs text-muted hover:text-ink"
                  >
                    Cancel
                  </button>
                  {busy && <Loader2 className="size-3.5 animate-spin text-muted" />}
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setActiveId(r.id);
                  setReason("");
                }}
                className="mt-2 text-xs text-muted underline underline-offset-2 hover:text-ink"
              >
                Waive
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
