"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, Check, Eye, FileText } from "lucide-react";
import Card from "@/components/ui/Card";
import Pill from "@/components/ui/Pill";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import ReasonSheet from "@/components/admin/_shared/ReasonSheet";

export type AdminKycDocument = {
  id: string;
  kind: "PAN_CARD" | "ID_PROOF" | "BANK_PROOF";
  status: "PENDING" | "VERIFIED" | "REJECTED";
  uploadedAt: string;
};

export type AdminKycQueueRow = {
  partnerId: string;
  partnerName: string;
  /** What the partner typed on their payout account — the string to compare. */
  accountHolderName: string | null;
  legalName: string | null;
  panMasked: string | null;
  status: "NOT_STARTED" | "PENDING" | "VERIFIED" | "REJECTED";
  submittedAt: string | null;
  documents: AdminKycDocument[];
};

const DOC_LABEL: Record<AdminKycDocument["kind"], string> = {
  PAN_CARD: "PAN card",
  ID_PROOF: "ID proof",
  BANK_PROOF: "Bank proof",
};

/**
 * Names differ in ways that do not matter — case, extra spaces, a middle name
 * written as an initial. This normalises the noise away so the badge fires on
 * real mismatches instead of on "Ramesh  Kumar" versus "ramesh kumar".
 *
 * It is a hint, never a decision. The admin is looking at the card; this only
 * decides whether to point at the two strings.
 */
function namesLookSame(a: string | null, b: string | null): boolean | null {
  if (!a || !b) return null;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
  const x = norm(a);
  const y = norm(b);
  if (x === y) return true;
  // One name being a subset of the other covers the initial-versus-full-middle
  // -name case, which is the single most common honest difference.
  const xs = new Set(x.split(" "));
  const ys = new Set(y.split(" "));
  const shared = [...xs].filter((w) => ys.has(w)).length;
  return shared >= Math.min(xs.size, ys.size);
}

/**
 * The identity queue — the check that makes account verification mean
 * something.
 *
 * An admin's job on this screen is one comparison: does the name on the
 * uploaded card match the name typed on the payout account. Everything here
 * exists to make that comparison quick — the two strings sit next to each
 * other, a badge flags when they do not look alike, and the document opens in
 * one click.
 *
 * Opening a document is logged. So is revealing a PAN. Neither is shown
 * inline: an admin screen that renders somebody's PAN card by default leaks it
 * to whoever walks past the desk.
 */
export default function KycQueue({ rows }: { rows: AdminKycQueueRow[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [pan, setPan] = useState<Record<string, string>>({});
  const [rejecting, setRejecting] = useState<AdminKycQueueRow | null>(null);
  const [note, setNote] = useState("");

  async function review(partnerId: string, approve: boolean, reason?: string) {
    setBusy(partnerId);
    try {
      const res = await fetch(`/api/admin/kyc/${partnerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approve, note: reason ?? null }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Nahi ho paya", description: json.message, tone: "error" });
        return;
      }
      toast({ title: approve ? "KYC verify ho gaya" : "KYC wapas bhej diya", tone: "success" });
      setRejecting(null);
      setNote("");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function revealPan(partnerId: string) {
    setBusy(partnerId);
    try {
      const res = await fetch(`/api/admin/kyc/${partnerId}/pan`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "PAN nahi mila", description: json.message, tone: "error" });
        return;
      }
      setPan((p) => ({ ...p, [partnerId]: json.pan }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-ink">KYC check ({rows.length})</h2>

      {rows.length === 0 ? (
        <Card variant="soft" padding="lg" className="text-center">
          <p className="text-sm text-muted">Koi KYC pending nahi hai.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((r) => {
            const match = namesLookSame(r.legalName, r.accountHolderName);
            const hasPanCard = r.documents.some((d) => d.kind === "PAN_CARD");
            return (
              <Card key={r.partnerId} variant="default" padding="md">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/admin/partners/${r.partnerId}`}
                        className="font-semibold text-ink hover:underline"
                      >
                        {r.partnerName}
                      </Link>
                      <Pill tone={r.status === "REJECTED" ? "danger" : "gold"} size="sm">
                        {r.status === "REJECTED" ? "Wapas bheja" : "Check karna hai"}
                      </Pill>
                    </div>

                    {/* The one comparison this screen exists for. */}
                    <dl className="mt-2 grid gap-x-3 gap-y-1 text-[0.8125rem] sm:grid-cols-[auto_1fr]">
                      <dt className="text-subtle">PAN card par</dt>
                      <dd className="font-medium text-ink">{r.legalName ?? "—"}</dd>
                      <dt className="text-subtle">Account par</dt>
                      <dd className="font-medium text-ink">{r.accountHolderName ?? "— (abhi bhara nahi)"}</dd>
                      <dt className="text-subtle">PAN</dt>
                      <dd className="font-mono text-ink">{pan[r.partnerId] ?? r.panMasked ?? "—"}</dd>
                    </dl>

                    {match === false && (
                      <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-warn/30 bg-warn-bg px-2.5 py-1 text-[0.6875rem] font-medium text-warn">
                        <AlertTriangle className="size-3" aria-hidden />
                        Naam alag lag rahe hain — card khud dekh kar hi approve kariye
                      </p>
                    )}

                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {r.documents.map((d) => (
                        <a
                          key={d.id}
                          href={`/api/admin/kyc/document/${d.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[0.6875rem] font-medium text-muted transition-colors hover:border-trust/40 hover:text-trust"
                        >
                          <FileText className="size-3" aria-hidden />
                          {DOC_LABEL[d.kind]}
                        </a>
                      ))}
                      {!hasPanCard && (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-danger/25 bg-danger-bg px-2.5 py-1 text-[0.6875rem] font-medium text-danger">
                          PAN card upload nahi hua
                        </span>
                      )}
                      {r.panMasked && !pan[r.partnerId] && (
                        <button
                          type="button"
                          disabled={busy === r.partnerId}
                          onClick={() => revealPan(r.partnerId)}
                          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[0.6875rem] font-medium text-muted transition-colors hover:border-trust/40 hover:text-trust disabled:opacity-50"
                        >
                          <Eye className="size-3" aria-hidden />
                          Poora PAN
                        </button>
                      )}
                    </div>

                    {r.submittedAt && <p className="mt-1.5 text-xs text-subtle">Bheja {r.submittedAt}</p>}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="success"
                      loading={busy === r.partnerId}
                      onClick={() => review(r.partnerId, true)}
                    >
                      <Check className="size-4" aria-hidden />
                      <span className="ml-1">Verify</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy === r.partnerId}
                      onClick={() => {
                        setRejecting(r);
                        setNote("");
                      }}
                    >
                      Wapas bhejein
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <ReasonSheet
        open={rejecting !== null}
        onClose={() => setRejecting(null)}
        title="KYC wapas bhejein"
        description={
          rejecting
            ? `${rejecting.partnerName} ko yehi line dikhegi — isliye saaf likhiye ki kya theek karna hai.`
            : ""
        }
        value={note}
        onChange={setNote}
        placeholder="Jaise: PAN card ki photo dhundhli hai, number padha nahi ja raha."
        maxLength={300}
        helperText="Partner ko notification jaayega aur wo dobara upload kar payega."
        confirmLabel="Wapas bhejein"
        confirmDisabled={note.trim().length < 3}
        busy={busy !== null}
        onConfirm={() => rejecting && review(rejecting.partnerId, false, note.trim())}
      />
    </section>
  );
}
