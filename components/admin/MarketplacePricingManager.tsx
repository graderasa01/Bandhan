"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import Card from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";

/**
 * Every marketplace number an admin can move, on one screen.
 *
 * ## Why the numbers are typed in rupees and percent
 *
 * Everything is stored in paise and basis points, and nobody should have to
 * know that to change a price. The conversion happens at this boundary, once —
 * the same call `PlanPricingManager` already makes for commission rates.
 *
 * ## Why zero is allowed and labelled
 *
 * "Free" is a strategy, not a mistake: free for a pilot city, free while a
 * complaint is open, a verification thrown in to get people trying it. The
 * fields accept 0 and the screen says what 0 will mean, so nobody has to guess
 * whether it will break something.
 */
export interface MarketplacePricingState {
  platformFeeBps: number;
  acceptSlaHours: number;
  refundWindowDays: number;
  minWithdrawalPaise: number;
  bands: { kind: string; label: string; minPricePaise: number; maxPricePaise: number }[];
  verificationFees: { kind: string; label: string; feePaise: number }[];
}

const rupees = (paise: number) => Math.round(paise / 100);

export default function MarketplacePricingManager({ initial }: { initial: MarketplacePricingState }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const [fee, setFee] = useState(String(initial.platformFeeBps / 100));
  const [sla, setSla] = useState(String(initial.acceptSlaHours));
  const [refund, setRefund] = useState(String(initial.refundWindowDays));
  const [minW, setMinW] = useState(String(rupees(initial.minWithdrawalPaise)));

  const [bands, setBands] = useState(
    initial.bands.map((b) => ({ ...b, min: String(rupees(b.minPricePaise)), max: String(rupees(b.maxPricePaise)) })),
  );
  const [fees, setFees] = useState(
    initial.verificationFees.map((f) => ({ ...f, value: String(rupees(f.feePaise)) })),
  );

  async function send(key: string, body: Record<string, unknown>) {
    if (busy) return;
    setBusy(key);
    try {
      const res = await fetch("/api/admin/pricing/marketplace", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: "Nahi ho paya", description: json?.message ?? "Dobara try karein.", tone: "error" });
        return;
      }
      toast({ title: "Save ho gaya", tone: "success" });
      router.refresh();
    } catch {
      toast({ title: "Network error", tone: "error" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card variant="default" padding="lg" className="mt-6">
      <h2 className="text-base font-semibold text-wine-700">Marketplace aur verification ke daam</h2>
      <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted">
        Ye sab yahin se badalta hai — code chhune ki zaroorat nahi. Har badlaav audit log me jaata hai.
      </p>

      {/* ---- Platform-wide ---- */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field
          label="Platform ka hissa (%)"
          hint="Partner service booking me se. 0 rakhenge to partner ko poora milega."
          value={fee}
          onChange={setFee}
          busy={busy === "fee"}
          onSave={() => send("fee", { action: "money", platformFeeBps: Math.round(Number(fee) * 100) })}
        />
        <Field
          label="Accept ka time (ghante)"
          hint="Itne me partner ne accept nahi kiya to buyer ko poora refund."
          value={sla}
          onChange={setSla}
          busy={busy === "sla"}
          onSave={() => send("sla", { action: "money", acceptSlaHours: Number(sla) })}
        />
        <Field
          label="Refund window (din)"
          hint="Delivery ke baad itne din tak buyer shikayat kar sakta hai. 0 = turant partner ko."
          value={refund}
          onChange={setRefund}
          busy={busy === "refund"}
          onSave={() => send("refund", { action: "money", refundWindowDays: Number(refund) })}
        />
        <Field
          label="Minimum withdrawal (₹)"
          hint="Isse kam balance partner withdraw nahi kar sakta."
          value={minW}
          onChange={setMinW}
          busy={busy === "minw"}
          onSave={() => send("minw", { action: "money", minWithdrawalPaise: Math.round(Number(minW) * 100) })}
        />
      </div>

      {/* ---- Bands ---- */}
      <h3 className="mt-6 text-sm font-semibold text-ink">Service ke daam ki hadd</h3>
      <p className="mt-1 text-[0.75rem] leading-relaxed text-muted">
        Partner apni service isi range me rakh sakta hai. Sabse kam 0 kar denge to wo apni service free bhi rakh
        sakta hai.
      </p>
      <ul className="mt-2 flex flex-col gap-2">
        {bands.map((b, i) => (
          <li key={b.kind} className="flex flex-wrap items-end gap-2 rounded-md border border-line/70 bg-surface-2 px-3 py-2">
            <span className="min-w-40 flex-1 text-[0.8125rem] text-ink">{b.label}</span>
            <NumberBox
              label="kam se kam ₹"
              value={b.min}
              onChange={(v) => setBands(bands.map((x, j) => (i === j ? { ...x, min: v } : x)))}
            />
            <NumberBox
              label="zyada se zyada ₹"
              value={b.max}
              onChange={(v) => setBands(bands.map((x, j) => (i === j ? { ...x, max: v } : x)))}
            />
            <SaveButton
              busy={busy === `band-${b.kind}`}
              onClick={() =>
                send(`band-${b.kind}`, {
                  action: "band",
                  kind: b.kind,
                  minPricePaise: Math.round(Number(b.min) * 100),
                  maxPricePaise: Math.round(Number(b.max) * 100),
                })
              }
            />
          </li>
        ))}
      </ul>

      {/* ---- Verification fees ---- */}
      <h3 className="mt-6 text-sm font-semibold text-ink">Verification ke daam</h3>
      <p className="mt-1 text-[0.75rem] leading-relaxed text-muted">
        Ek member doosre se ye check maang sakta hai. 0 rakhenge to wo check free ho jayega.
      </p>
      <ul className="mt-2 flex flex-col gap-2">
        {fees.map((f, i) => (
          <li key={f.kind} className="flex flex-wrap items-end gap-2 rounded-md border border-line/70 bg-surface-2 px-3 py-2">
            <span className="min-w-40 flex-1 text-[0.8125rem] text-ink">{f.label}</span>
            <NumberBox
              label="₹"
              value={f.value}
              onChange={(v) => setFees(fees.map((x, j) => (i === j ? { ...x, value: v } : x)))}
            />
            <SaveButton
              busy={busy === `fee-${f.kind}`}
              onClick={() =>
                send(`fee-${f.kind}`, {
                  action: "verification-fee",
                  kind: f.kind,
                  feePaise: Math.round(Number(f.value) * 100),
                })
              }
            />
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Field({
  label,
  hint,
  value,
  onChange,
  onSave,
  busy,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  busy: boolean;
}) {
  return (
    <div className="rounded-md border border-line/70 bg-surface-2 px-3 py-2.5">
      <label className="text-[0.75rem] font-medium text-ink">{label}</label>
      <div className="mt-1 flex items-center gap-2">
        <input
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-10 w-28 rounded-md border border-line-strong bg-surface px-3 py-2 text-sm outline-none focus:border-gold-500"
        />
        <SaveButton busy={busy} onClick={onSave} />
      </div>
      <p className="mt-1 text-[0.6875rem] leading-relaxed text-muted">{hint}</p>
    </div>
  );
}

function NumberBox({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="text-[0.6875rem] text-muted">
      {label}
      <input
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-0.5 block min-h-9 w-24 rounded-md border border-line-strong bg-surface px-2 py-1.5 text-sm outline-none focus:border-gold-500"
      />
    </label>
  );
}

function SaveButton({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-line px-3 text-xs font-medium text-ink hover:border-gold-500 disabled:opacity-55"
    >
      {busy && <Loader2 className="size-3.5 animate-spin" />}
      Save
    </button>
  );
}
