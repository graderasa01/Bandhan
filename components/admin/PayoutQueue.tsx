"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Copy, Eye, FileText, Landmark, MapPin, Phone, Smartphone } from "lucide-react";
import Card from "@/components/ui/Card";
import Pill from "@/components/ui/Pill";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import ReasonSheet from "@/components/admin/_shared/ReasonSheet";

export type AdminKycDoc = {
  id: string;
  kind: string;
  status: string;
};

/** Contact + location + filed documents — everything an admin needs to answer
 *  "is this really this partner's account" and "who do I call if it bounces". */
export type PartnerIdentity = {
  mobileNumber: string;
  email: string | null;
  /** "City, State" — collected at partner registration, both required there. */
  location: string;
  documents: AdminKycDoc[];
};

export type AdminWithdrawalRow = PartnerIdentity & {
  kycLegalName: string | null;
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

export type AdminAccountRow = PartnerIdentity & {
  partnerId: string;
  partnerName: string;
  method: "UPI" | "BANK";
  accountHolderName: string;
  maskedTarget: string;
  ifsc: string | null;
  bankName: string | null;
  submittedAt: string;
  /** Channels this partner has never proved — "mobile", "email". Empty when all are verified. */
  contactUnverified: string[];
  /** Name on the PAN card, when the partner chose to file KYC. Null otherwise. */
  kycLegalName: string | null;
  /** Whether KYC was filed and cleared. Advisory only — it no longer blocks approval. */
  kycVerified: boolean;
};

type Revealed = { upiId?: string; accountNumber?: string; ifsc?: string; accountHolderName: string } | null;

/**
 * The admin half of a payout: verify an account once, then approve each
 * request and record the UTR after the money actually moves.
 *
 * The reveal is a deliberate one-click-with-a-log rather than showing the
 * account number on the page: an admin needs it at the moment of paying, and
 * every look is written to the audit trail.
 *
 * Marking paid is gated behind that reveal and an explicit tick. Money moves
 * by hand here — an admin opens their own banking app and types these digits
 * in — so the failure that matters is a mistyped account number, not a
 * mis-clicked button. Showing the digits big, one field per row with a copy
 * button, and making the admin state that they sent it is the whole safeguard.
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
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [pendingReject, setPendingReject] = useState<AdminWithdrawalRow | null>(null);

  async function copy(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    } catch {
      toast({ title: "Copy nahi hua", description: "Haath se select kar lijiye.", tone: "error" });
    }
  }

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

  /**
   * Two endpoints, one shape. A withdrawal reveals through its own id (the
   * route resolves the partner); an account still awaiting verification has no
   * withdrawal yet, so it reveals through the partner directly. Both write the
   * same audit row.
   */
  async function reveal(key: string, url: string) {
    setBusy(key);
    try {
      const res = await fetch(url, { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Details nahi mili", description: json.message, tone: "error" });
        return;
      }
      setRevealed((r) => ({ ...r, [key]: json.destination }));
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
                    <IdentityStrip identity={a} />
                    {/* KYC is optional now, so this is context, not a gate. When a
                        partner did file it, the legal name is still the best thing
                        to check the holder name against — so it stays visible. */}
                    {a.kycLegalName ? (
                      <p className="mt-1.5 text-[0.8125rem] text-muted">
                        PAN card par: <span className="font-medium text-ink">{a.kycLegalName}</span>
                        {!a.kycVerified && <span className="text-subtle"> (abhi verify nahi hua)</span>}
                      </p>
                    ) : (
                      <p className="mt-1.5 text-[0.8125rem] text-subtle">
                        KYC nahi bhara (optional) — naam khud check kar lijiye.
                      </p>
                    )}
                    <DocStrip documents={a.documents} />
                    {/* The full number, before approving. Being asked to confirm
                        ••••7890 is being asked to confirm digits you cannot see. */}
                    {revealed[a.partnerId] ? (
                      <dl className="mt-2.5 flex flex-col gap-1.5 rounded-lg border border-line bg-bg-subtle p-3">
                        <DetailRow
                          label={a.method === "UPI" ? "UPI ID" : "Account number"}
                          value={revealed[a.partnerId]!.upiId ?? revealed[a.partnerId]!.accountNumber ?? "—"}
                          copyKey={`acct-${a.partnerId}`}
                          copiedKey={copied}
                          onCopy={copy}
                          big
                        />
                        {revealed[a.partnerId]!.ifsc && (
                          <DetailRow label="IFSC" value={revealed[a.partnerId]!.ifsc!} />
                        )}
                      </dl>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="mt-2"
                        loading={busy === a.partnerId}
                        onClick={() => reveal(a.partnerId, `/api/admin/payout-accounts/${a.partnerId}`)}
                      >
                        <Eye className="size-4" aria-hidden />
                        Poora number dekhein
                      </Button>
                    )}
                    {a.contactUnverified.length > 0 && (
                      <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-warn/30 bg-warn-bg px-2.5 py-1 text-[0.6875rem] font-medium text-warn">
                        {a.contactUnverified.join(" aur ")} verify nahi hua — approve karne se pehle khud confirm
                        kariye
                      </p>
                    )}
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
              const target = shown?.upiId ?? shown?.accountNumber ?? null;
              const canMarkPaid =
                Boolean(shown) && Boolean(confirmed[w.id]) && (utr[w.id] ?? "").trim().length > 0;

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
                        <span className="font-mono">{w.maskedTarget ?? "—"}</span>
                        {w.bankName ? ` · ${w.bankName}` : ""}
                      </p>
                      <p className="mt-0.5 text-xs text-subtle">Request {w.requestedAt}</p>
                      <IdentityStrip identity={w} />
                      {w.kycLegalName && (
                        <p className="mt-1.5 text-[0.8125rem] text-muted">
                          PAN card par: <span className="font-medium text-ink">{w.kycLegalName}</span>
                        </p>
                      )}
                      <DocStrip documents={w.documents} />
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {w.status !== "PAID" && w.status !== "REJECTED" && !shown && (
                        <Button size="sm" variant="ghost" loading={busy === w.id} onClick={() => reveal(w.id, `/api/admin/payouts/${w.id}/destination`)}>
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
                      {(w.status === "REQUESTED" || w.status === "APPROVED") && (
                        <Button size="sm" variant="ghost" disabled={busy === w.id} onClick={() => setPendingReject(w)}>
                          Reject
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* ---- Pay-out sheet: the digits the admin actually types into
                       their bank, and the tick that says they did it. ---- */}
                  {w.status === "APPROVED" && (
                    <div className="mt-3 rounded-lg border border-line bg-bg-subtle p-3 sm:p-4">
                      {!shown ? (
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="text-[0.8125rem] text-muted">
                            Paisa bhejne ke liye poori details kholiye — har baar log hota hai.
                          </p>
                          <Button size="sm" variant="ghost" loading={busy === w.id} onClick={() => reveal(w.id, `/api/admin/payouts/${w.id}/destination`)}>
                            <Eye className="size-4" aria-hidden />
                            Show Account
                          </Button>
                        </div>
                      ) : (
                        <>
                          <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-subtle">
                            Yahan bhejna hai
                          </p>
                          <dl className="mt-2 flex flex-col gap-1.5">
                            <DetailRow
                              label={w.accountMethod === "UPI" ? "UPI ID" : "Account number"}
                              value={target ?? "—"}
                              copyKey={`${w.id}-target`}
                              copiedKey={copied}
                              onCopy={copy}
                              big
                            />
                            <DetailRow
                              label="Naam"
                              value={shown.accountHolderName}
                              copyKey={`${w.id}-name`}
                              copiedKey={copied}
                              onCopy={copy}
                            />
                            {shown.ifsc && (
                              <DetailRow
                                label="IFSC"
                                value={shown.ifsc}
                                copyKey={`${w.id}-ifsc`}
                                copiedKey={copied}
                                onCopy={copy}
                              />
                            )}
                            {w.bankName && <DetailRow label="Bank" value={w.bankName} />}
                            <DetailRow label="Amount" value={w.amount} big />
                          </dl>

                          <label className="mt-3 flex cursor-pointer items-start gap-2.5 border-t border-line pt-3">
                            <input
                              type="checkbox"
                              checked={Boolean(confirmed[w.id])}
                              onChange={(e) => setConfirmed((c) => ({ ...c, [w.id]: e.target.checked }))}
                              className="mt-0.5 size-4 shrink-0 accent-[var(--bt-accent)]"
                            />
                            <span className="text-[0.8125rem] text-ink">
                              Maine ye details check karke <strong>{w.amount}</strong> bhej diya hai.
                            </span>
                          </label>

                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <Input
                              inputSize="sm"
                              placeholder="UTR / reference number"
                              value={utr[w.id] ?? ""}
                              onChange={(e) => setUtr((u) => ({ ...u, [w.id]: e.target.value }))}
                              aria-label="UTR"
                              className="w-52"
                            />
                            <Button
                              size="sm"
                              variant="primary"
                              disabled={busy === w.id || !canMarkPaid}
                              onClick={() => transition(w, "markPaid")}
                            >
                              Mark Paid
                            </Button>
                            {!canMarkPaid && (
                              <p className="text-xs text-subtle">
                                {!confirmed[w.id]
                                  ? "Pehle upar wala tick lagaiye."
                                  : "UTR daaliye — partner ko yahi proof dikhega."}
                              </p>
                            )}
                          </div>
                        </>
                      )}

                      {!automatic && (
                        <p className="mt-2 text-xs text-subtle">
                          Transfer aap khud apne bank se karenge — ye app paisa nahi bhejta, sirf record rakhta hai.
                        </p>
                      )}
                    </div>
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

function DetailRow({
  label,
  value,
  copyKey,
  copiedKey,
  onCopy,
  big,
}: {
  label: string;
  value: string;
  copyKey?: string;
  copiedKey?: string | null;
  onCopy?: (value: string, key: string) => void;
  big?: boolean;
}) {
  const isCopied = copyKey != null && copiedKey === copyKey;
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="shrink-0 text-[0.75rem] text-muted">{label}</dt>
      <dd className="flex min-w-0 items-center gap-2">
        <span
          className={
            big
              ? "truncate font-mono text-base font-bold tracking-wide text-ink"
              : "truncate font-mono text-[0.8125rem] text-ink"
          }
        >
          {value}
        </span>
        {copyKey && onCopy && (
          <button
            type="button"
            onClick={() => onCopy(value, copyKey)}
            aria-label={`${label} copy karein`}
            className="grid size-7 shrink-0 place-items-center rounded-md border border-line text-muted transition-colors hover:border-gold-500 hover:text-ink"
          >
            {isCopied ? <Check className="size-3.5 text-trust" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
          </button>
        )}
      </dd>
    </div>
  );
}

const DOC_LABEL: Record<string, string> = {
  PAN_CARD: "PAN card",
  ID_PROOF: "ID proof",
  BANK_PROOF: "Bank proof",
};

/**
 * Who this partner is, in the row where money is about to leave.
 *
 * The mobile number is the point: a transfer that bounces, a name that doesn't
 * match, an account closed last month — every one of those ends in someone
 * having to phone the partner, and an admin should not have to open another
 * screen to find the number. It is shown in full, not masked: `visibility.ts`
 * hides a *lead's* contact from a partner, which is the opposite direction.
 */
function IdentityStrip({ identity }: { identity: PartnerIdentity }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.8125rem] text-muted">
      <a href={`tel:${identity.mobileNumber}`} className="inline-flex items-center gap-1.5 hover:text-ink">
        <Phone className="size-3.5" aria-hidden />
        <span className="font-mono">{identity.mobileNumber}</span>
      </a>
      {identity.email && (
        <a href={`mailto:${identity.email}`} className="truncate hover:text-ink">
          {identity.email}
        </a>
      )}
      {identity.location && (
        <span className="inline-flex items-center gap-1.5">
          <MapPin className="size-3.5" aria-hidden />
          {identity.location}
        </span>
      )}
    </div>
  );
}

/**
 * Links to whatever the partner filed. Opens in a new tab rather than
 * inlining an <img>: the document endpoint writes an audit row per request, so
 * rendering every scan on page load would log a "viewed" for documents nobody
 * looked at.
 */
function DocStrip({ documents }: { documents: AdminKycDoc[] }) {
  if (documents.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {documents.map((d) => (
        <a
          key={d.id}
          href={`/api/admin/kyc/document/${d.id}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[0.6875rem] font-medium text-muted transition-colors hover:border-gold-500 hover:text-ink"
        >
          <FileText className="size-3.5" aria-hidden />
          {DOC_LABEL[d.kind] ?? d.kind}
          {d.status === "REJECTED" && <span className="text-danger">· reject</span>}
        </a>
      ))}
    </div>
  );
}
