"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, Landmark, Smartphone } from "lucide-react";
import Card from "@/components/ui/Card";
import Pill from "@/components/ui/Pill";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import ReasonSheet from "@/components/admin/_shared/ReasonSheet";

export type AdminWithdrawalRow = {
  id: string;
  partnerId: string;
  partnerName: string;
  amount: string;
  status: string;
  requestedAt: string;
  accountMethod: "UPI" | "BANK" | null;
  accountHolderName: string | null;
  maskedTarget: string | null;
  ifsc: string | null;
  bankName: string | null;
  accountVerified: boolean;
};

export type AdminAccountRow = {
  partnerId: string;
  partnerName: string;
  method: "UPI" | "BANK";
  accountHolderName: string;
  maskedTarget: string;
  ifsc: string | null;
  bankName: string | null;
  submittedAt: string;
};

type Revealed = { upiId?: string; accountNumber?: string; ifsc?: string; accountHolderName: string } | null;

/**
 * The admin half of a payout: verify an account once, then approve each
 * request and record the UTR after the money actually moves.
 *
 * The reveal is a deliberate one-click-with-a-log rather than showing the
 * account number on the page: an admin needs it at the moment of paying, and
 * every look is written to the audit trail.
 */
export default function PayoutQueue({
  pendingAccounts,
  withdrawals,
  automatic,
}: {
  pendingAccounts: AdminAccountRow[];
  withdrawals: AdminWithdrawalRow[];
  /** True once a payout API is configured — until then an admin pays by hand and types the UTR. */
  automatic: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<string, Revealed>>({});
  const [utr, setUtr] = useState<Record<string, string>>({});
  const [rejectNote, setRejectNote] = useState("");
  const [pendingReject, setPendingReject] = useState<AdminWithdrawalRow | null>(null);

  async function verifyAccount(partnerId: string, approve: boolean, note?: string) {
    setBusy(partnerId);
    try {
      const res = await fetch(`/api/admin/payout-accounts/${partnerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approve, note: note ?? null }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Nahi ho paya", description: json.message, tone: "error" });
        return;
      }
      toast({ title: approve ? "Account verify ho gaya" : "Account reject kar diya", tone: "success" });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function reveal(w: AdminWithdrawalRow) {
    setBusy(w.id);
    try {
      const res = await fetch(`/api/admin/payouts/${w.id}/destination`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Details nahi mili", description: json.message, tone: "error" });
        return;
      }
      setRevealed((r) => ({ ...r, [w.id]: json.destination }));
    } finally {
      setBusy(null);
    }
  }

  async function transition(w: AdminWithdrawalRow, action: "approve" | "markPaid" | "reject", note?: string) {
    setBusy(w.id);
    try {
      const res = await fetch(`/api/admin/payouts/${w.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, utr: utr[w.id] ?? null, reason: note ?? null }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Nahi ho paya", description: json.message, tone: "error" });
        return;
      }
      toast({
        title:
          action === "markPaid" ? "Paid mark ho gaya" : action === "approve" ? "Approve ho gaya" : "Reject ho gaya",
        tone: "success",
      });
      setPendingReject(null);
      setRejectNote("");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="mb-3 text-lg font-semibold text-ink">Verify hone wale accounts ({pendingAccounts.length})</h2>
        {pendingAccounts.length === 0 ? (
          <Card variant="soft" padding="lg" className="text-center">
            <p className="text-sm text-muted">Koi account verification pending nahi hai.</p>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {pendingAccounts.map((a) => (
              <Card key={a.partnerId} variant="default" padding="md">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/admin/partners/${a.partnerId}`} className="font-semibold text-ink hover:underline">
                      {a.partnerName}
                    </Link>
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
                      {a.method === "UPI" ? (
                        <Smartphone className="size-4" aria-hidden />
                      ) : (
                        <Landmark className="size-4" aria-hidden />
                      )}
                      {a.accountHolderName} · <span className="font-mono">{a.maskedTarget}</span>
                      {a.ifsc ? ` · ${a.ifsc}` : ""}
                      {a.bankName ? ` · ${a.bankName}` : ""}
                    </p>
                    <p className="mt-0.5 text-xs text-subtle">Bhara {a.submittedAt}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="success"
                      loading={busy === a.partnerId}
                      onClick={() => verifyAccount(a.partnerId, true)}
                    >
                      Verify
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy === a.partnerId}
                      onClick={() => {
                        const note = window.prompt("Reject karne ka reason?");
                        if (note?.trim()) verifyAccount(a.partnerId, false, note.trim());
                      }}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-ink">Withdrawal requests</h2>
        {withdrawals.length === 0 ? (
          <Card variant="soft" padding="lg" className="text-center">
            <p className="text-sm text-muted">Koi withdrawal request nahi hai.</p>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {withdrawals.map((w) => {
              const shown = revealed[w.id];
              return (
                <Card key={w.id} variant="default" padding="md">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/admin/partners/${w.partnerId}`}
                          className="font-semibold text-ink hover:underline"
                        >
                          {w.partnerName}
                        </Link>
                        <Pill tone={w.status === "PAID" ? "trust" : w.status === "REJECTED" ? "danger" : "gold"} size="sm">
                          {w.status}
                        </Pill>
                        {!w.accountVerified && (
                          <Pill tone="danger" size="sm">
                            Account verify nahi hai
                          </Pill>
                        )}
                      </div>
                      <p className="mt-1 text-lg font-bold text-wine-700">{w.amount}</p>
                      <p className="text-[0.8125rem] text-muted">
                        {w.accountHolderName ?? "—"} ·{" "}
                        <span className="font-mono">{shown ? (shown.upiId ?? shown.accountNumber) : w.maskedTarget}</span>
                        {shown?.ifsc ? ` · ${shown.ifsc}` : w.ifsc ? ` · ${w.ifsc}` : ""}
                      </p>
                      <p className="mt-0.5 text-xs text-subtle">Request {w.requestedAt}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {w.status !== "PAID" && w.status !== "REJECTED" && !shown && (
                        <Button size="sm" variant="ghost" loading={busy === w.id} onClick={() => reveal(w)}>
                          <Eye className="size-4" aria-hidden />
                          Show Account
                        </Button>
                      )}
                      {w.status === "REQUESTED" && (
                        <Button
                          size="sm"
                          variant="success"
                          disabled={busy === w.id || !w.accountVerified}
                          onClick={() => transition(w, "approve")}
                        >
                          Approve
                        </Button>
                      )}
                      {w.status === "APPROVED" && (
                        <>
                          <Input
                            inputSize="sm"
                            placeholder="UTR / reference"
                            value={utr[w.id] ?? ""}
                            onChange={(e) => setUtr((u) => ({ ...u, [w.id]: e.target.value }))}
                            aria-label="UTR"
                            className="w-40"
                          />
                          <Button
                            size="sm"
                            variant="primary"
                            disabled={busy === w.id || !(utr[w.id] ?? "").trim()}
                            onClick={() => transition(w, "markPaid")}
                          >
                            Mark Paid
                          </Button>
                        </>
                      )}
                      {(w.status === "REQUESTED" || w.status === "APPROVED") && (
                        <Button size="sm" variant="ghost" disabled={busy === w.id} onClick={() => setPendingReject(w)}>
                          Reject
                        </Button>
                      )}
                    </div>
                  </div>

                  {w.status === "APPROVED" && !automatic && (
                    <p className="mt-2 text-xs text-subtle">
                      Apne bank se transfer kar ke UTR yahan daaliye — tabhi partner ko &ldquo;mil gaya&rdquo; dikhega.
                    </p>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <ReasonSheet
        open={pendingReject !== null}
        onClose={() => {
          setPendingReject(null);
          setRejectNote("");
        }}
        title={pendingReject ? `${pendingReject.partnerName} ki ${pendingReject.amount} withdrawal reject karein?` : ""}
        description="Commission wapas partner ke available balance me chala jaayega — wo dobara request kar sakte hain."
        value={rejectNote}
        onChange={setRejectNote}
        placeholder="Reason likhiye — partner ko yahi dikhega…"
        maxLength={300}
        confirmLabel="Reject"
        confirmDisabled={rejectNote.trim().length < 5}
        busy={busy !== null}
        onConfirm={() => pendingReject && transition(pendingReject, "reject", rejectNote.trim())}
      />
    </div>
  );
}
