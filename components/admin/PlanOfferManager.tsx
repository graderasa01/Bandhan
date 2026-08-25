"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Pause, Play, Plus, Trash2 } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Pill from "@/components/ui/Pill";
import { Select } from "@/components/ui/Controls";
import { useToast } from "@/components/ui/Toast";
import AdminActionConfirmModal from "@/components/admin/AdminActionConfirmModal";

export type OfferPlanOption = { code: string; name: string; priceInPaise: number };

export type OfferRow = {
  id: string;
  planCode: string;
  kind: "PERCENT" | "FLAT" | "FREE";
  value: number;
  label: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  isLive: boolean;
  priceAfterPaise: number;
};

const KIND_LABEL: Record<OfferRow["kind"], string> = {
  PERCENT: "% off",
  FLAT: "₹ off",
  FREE: "Bilkul free",
};

function rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

function formatWindow(startsAt: string, endsAt: string): string {
  const fmt = (s: string) =>
    new Date(s).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  return `${fmt(startsAt)} → ${fmt(endsAt)}`;
}

/** `datetime-local` wants a local-time string with no zone, trimmed to minutes. */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Limited-time offers on a plan.
 *
 * The catalog editor above already changes a plan's price permanently. This is
 * the other question an admin actually has — "run Premium at half price for
 * Diwali, then put it back" — and doing that by editing the price twice means
 * remembering to do the second edit, with the real price lost in between.
 *
 * Three deliberate limits, all enforced on the server too:
 *   • An offer's terms are never edited once created. Stop it and make a new
 *     one — a live offer is a promise somebody may already have seen.
 *   • Every offer needs a label. It shows next to the struck-through price, and
 *     an unexplained discount reads as a bug.
 *   • FREE plan takes no offers. It is ₹0 by definition.
 */
export default function PlanOfferManager({
  plans,
  offers,
}: {
  plans: OfferPlanOption[];
  offers: OfferRow[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<OfferRow | null>(null);
  const [showNew, setShowNew] = useState(false);

  // FREE is filtered out rather than shown-and-rejected: an option that always
  // errors is a worse explanation than its absence.
  const options = useMemo(() => plans.filter((p) => p.code !== "FREE"), [plans]);

  const [planCode, setPlanCode] = useState(options[0]?.code ?? "");
  const [kind, setKind] = useState<OfferRow["kind"]>("PERCENT");
  const [value, setValue] = useState("50");
  const [label, setLabel] = useState("");
  const [startsAt, setStartsAt] = useState(() => toLocalInput(new Date()));
  const [endsAt, setEndsAt] = useState(() => toLocalInput(new Date(Date.now() + 7 * 24 * 3600_000)));

  const selectedPlan = options.find((p) => p.code === planCode) ?? null;

  // The same arithmetic the server will do, shown before saving — the one
  // number an admin is actually deciding is what the user ends up paying.
  const preview = useMemo(() => {
    if (!selectedPlan) return null;
    const list = selectedPlan.priceInPaise;
    const n = Number(value);
    if (kind === "FREE") return 0;
    if (!Number.isFinite(n) || n <= 0) return null;
    const off = kind === "PERCENT" ? Math.round((list * n) / 100) : Math.round(n * 100);
    return Math.max(0, Math.min(list, list - off));
  }, [selectedPlan, kind, value]);

  const valid =
    Boolean(planCode) &&
    label.trim().length > 0 &&
    new Date(endsAt) > new Date(startsAt) &&
    (kind === "FREE" || (Number(value) > 0 && (kind !== "PERCENT" || Number(value) <= 100)));

  async function createOffer() {
    setBusy("__new__");
    try {
      const res = await fetch("/api/admin/plan-offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planCode,
          kind,
          value: kind === "FREE" ? undefined : Number(value),
          label: label.trim(),
          // `datetime-local` has no zone; `new Date(...)` reads it as local
          // time and `toISOString()` sends the admin's actual instant.
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(endsAt).toISOString(),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Offer nahi bana", description: json.message, tone: "error" });
        return;
      }
      toast({ title: `${label.trim()} chalu ho gaya`, tone: "success" });
      setShowNew(false);
      setLabel("");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function toggleOffer(offer: OfferRow) {
    setBusy(offer.id);
    try {
      const res = await fetch(`/api/admin/plan-offers/${offer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !offer.isActive }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Change nahi hua", description: json.message, tone: "error" });
        return;
      }
      toast({ title: offer.isActive ? "Offer band ho gaya" : "Offer wapas chalu", tone: "success" });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setBusy(pendingDelete.id);
    try {
      const res = await fetch(`/api/admin/plan-offers/${pendingDelete.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Delete nahi hua", description: json.message, tone: "error" });
        return;
      }
      toast({ title: "Offer hat gaya", tone: "success" });
      setPendingDelete(null);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[0.8125rem] text-muted">
          Kisi bhi plan par limited-time discount ya bilkul free — user ko purana daam kata hua dikhta hai, offer ka
          naam aur khatam hone ki tareekh ke saath.
        </p>
        <Button variant="secondary" onClick={() => setShowNew((v) => !v)}>
          <Plus className="size-4" />
          Naya offer
        </Button>
      </div>

      {showNew && (
        <Card variant="soft" padding="md">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-ink">Plan</label>
              <Select
                selectSize="sm"
                className="mt-1"
                value={planCode}
                onChange={(e) => setPlanCode(e.target.value)}
                options={options.map((p) => ({ value: p.code, label: `${p.name} — ${rupees(p.priceInPaise)}` }))}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-ink">Offer ka type</label>
              <Select
                selectSize="sm"
                className="mt-1"
                value={kind}
                onChange={(e) => setKind(e.target.value as OfferRow["kind"])}
                options={[
                  { value: "PERCENT", label: "Percent off" },
                  { value: "FLAT", label: "Rupees off" },
                  { value: "FREE", label: "Bilkul free" },
                ]}
              />
            </div>

            {kind !== "FREE" && (
              <Input
                inputSize="sm"
                label={kind === "PERCENT" ? "Kitne percent off" : "Kitne rupees off"}
                type="number"
                min={1}
                max={kind === "PERCENT" ? 100 : undefined}
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            )}

            <Input
              inputSize="sm"
              label="Offer ka naam (user ko dikhega)"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Diwali offer"
            />

            <Input
              inputSize="sm"
              label="Kab se"
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
            <Input
              inputSize="sm"
              label="Kab tak"
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
            />
          </div>

          {selectedPlan && preview !== null && (
            <p className="mt-3 text-[0.8125rem] text-ink">
              User ko dikhega:{" "}
              <span className="text-muted line-through">{rupees(selectedPlan.priceInPaise)}</span>{" "}
              <strong className="text-trust">{preview === 0 ? "₹0 — bilkul free" : rupees(preview)}</strong>
            </p>
          )}

          <div className="mt-3 flex gap-2">
            <Button onClick={createOffer} disabled={!valid || busy === "__new__"}>
              Offer chalu karein
            </Button>
            <Button variant="secondary" onClick={() => setShowNew(false)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      {offers.length === 0 ? (
        <Card variant="soft" padding="md">
          <p className="text-[0.8125rem] text-muted">Abhi koi offer nahi hai.</p>
        </Card>
      ) : (
        offers.map((o) => (
          <Card key={o.id} variant="default" padding="md">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2">
                  <strong className="text-[0.9375rem] text-ink">{o.label}</strong>
                  <Pill tone={o.isLive ? "trust" : "neutral"} size="sm">
                    {o.isLive ? "Abhi live" : o.isActive ? "Aage ke liye" : "Band"}
                  </Pill>
                </p>
                <p className="mt-1 text-[0.8125rem] text-muted">
                  {o.planCode} · {KIND_LABEL[o.kind]}
                  {o.kind === "PERCENT" ? ` ${o.value}%` : o.kind === "FLAT" ? ` ${rupees(o.value)}` : ""} ·{" "}
                  <strong className="text-ink">
                    {o.priceAfterPaise === 0 ? "₹0" : rupees(o.priceAfterPaise)}
                  </strong>
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-[0.75rem] text-subtle">
                  <CalendarClock className="size-3.5" />
                  {formatWindow(o.startsAt, o.endsAt)}
                </p>
              </div>

              <div className="flex shrink-0 gap-2">
                <Button variant="secondary" onClick={() => toggleOffer(o)} disabled={busy === o.id}>
                  {o.isActive ? <Pause className="size-4" /> : <Play className="size-4" />}
                  {o.isActive ? "Band karein" : "Chalu karein"}
                </Button>
                <Button variant="danger" onClick={() => setPendingDelete(o)} disabled={busy === o.id}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          </Card>
        ))
      )}

      <AdminActionConfirmModal
        isOpen={pendingDelete !== null}
        title="Offer delete karein?"
        description={
          pendingDelete
            ? `"${pendingDelete.label}" hat jayega. Jo log ye offer le chuke hain unka plan waise hi chalta rahega.`
            : undefined
        }
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  );
}
