"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Clock } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { paiseToRupeeDisplay } from "@/lib/utils/money";

export type CommissionItem = {
  id: string;
  partnerName: string;
  userName: string;
  amountPaise: number;
  status: "PENDING" | "APPROVED" | "PAID" | "REVERSED";
  createdAt: string;
  refundWindowPassed: boolean;
};

/**
 * D-14's queue: PENDING → APPROVED → PAID.
 *
 * PENDING rows inside the 7-day refund window are shown but not yet
 * approvable — the window itself is the guard against paying a partner for a
 * subscription that gets refunded a day later, so the button being disabled
 * *is* the enforcement, not just a hint.
 */
export default function CommissionQueue({ items }: { items: CommissionItem[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function act(commissionId: string, action: "approve" | "markPaid") {
    setBusy(commissionId);
    try {
      const res = await fetch("/api/admin/commissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commissionId, action }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Failed", description: json.message, tone: "error" });
        return;
      }
      toast({ title: action === "approve" ? "Approved" : "Marked Paid", tone: "success" });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted">Koi commission is status me nahi hai.</p>;
  }

  return (
    <ul className="space-y-3">
      {items.map((c) => (
        <li key={c.id}>
          <Card padding="md">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[0.9375rem] font-semibold text-ink">{c.partnerName}</p>
                <p className="text-[0.8125rem] text-muted">{c.userName} ke subscription se</p>
                <p className="mt-1 text-lg font-bold text-wine-700">{paiseToRupeeDisplay(c.amountPaise)}</p>
              </div>

              <div className="flex flex-col items-end gap-2">
                {c.status === "PENDING" &&
                  (c.refundWindowPassed ? (
                    <Button variant="primary" size="sm" disabled={busy === c.id} onClick={() => act(c.id, "approve")}>
                      Approve
                    </Button>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-warn/30 bg-warn-bg px-2.5 py-1 text-[0.6875rem] font-medium text-warn">
                      <Clock className="size-3 shrink-0" />
                      Refund window abhi chal raha hai
                    </span>
                  ))}
                {c.status === "APPROVED" && (
                  <Button variant="primary" size="sm" disabled={busy === c.id} onClick={() => act(c.id, "markPaid")}>
                    Mark Paid
                  </Button>
                )}
                {c.status === "REVERSED" && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-danger/30 bg-danger-bg px-2.5 py-1 text-[0.6875rem] font-medium text-danger">
                    <AlertCircle className="size-3 shrink-0" />
                    Reversed — refund hua
                  </span>
                )}
              </div>
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}
