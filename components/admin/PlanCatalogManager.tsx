"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EyeOff, Plus, Trash2 } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Pill from "@/components/ui/Pill";
import { Select, Switch } from "@/components/ui/Controls";
import { useToast } from "@/components/ui/Toast";
import AdminActionConfirmModal from "@/components/admin/AdminActionConfirmModal";
import { PLAN_FEATURE_KEYS, PLAN_FEATURE_LABELS, PLAN_FEATURE_TYPES, type PlanFeatureSet } from "@/lib/constants/plans";

export type CatalogPlanRow = {
  code: string;
  name: string;
  priceInPaise: number;
  durationLabel: string;
  rank: number;
  isActive: boolean;
  isPublic: boolean;
  isBuiltin: boolean;
  features: PlanFeatureSet;
  /** Live rows referencing this code — non-zero means it can only be deactivated. */
  usageCount: number;
};

type PendingDelete = CatalogPlanRow | null;

/**
 * The plan catalog editor — what D-11 deliberately did not have.
 *
 * Every capability in `PlanFeatureSet` is editable per plan, and new plans can
 * be created. See lib/constants/plans.ts's header for why that reversal
 * happened; the short version is that adding a cheaper tier used to require a
 * database migration and a deploy.
 *
 * Two safety rails the UI carries because the server also enforces them:
 *   • FREE's price is fixed at ₹0 (it is free by definition, not by config).
 *   • A plan anyone has ever been on can be deactivated but never deleted —
 *     `subscriptions` and `payments` reference the code by value.
 */
export default function PlanCatalogManager({ plans }: { plans: CatalogPlanRow[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [openCode, setOpenCode] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null);

  const [showNew, setShowNew] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newDuration, setNewDuration] = useState("per month");
  const [cloneFrom, setCloneFrom] = useState(plans[0]?.code ?? "FREE");

  async function patchPlan(code: string, body: Record<string, unknown>, successTitle: string) {
    setBusy(code);
    try {
      const res = await fetch(`/api/admin/plans/${code}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Save fail hua", description: json.message, tone: "error" });
        return;
      }
      toast({ title: successTitle, tone: "success" });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function createPlan() {
    setBusy("__new__");
    try {
      const res = await fetch("/api/admin/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: newCode.trim().toUpperCase(),
          name: newName.trim(),
          priceRupees: Number(newPrice),
          durationLabel: newDuration.trim(),
          cloneFrom,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Plan nahi bana", description: json.message, tone: "error" });
        return;
      }
      toast({
        title: `${newName.trim()} plan ban gaya`,
        description: `${cloneFrom} ke features se shuru — ab jo chahein badal lijiye.`,
        tone: "success",
      });
      setShowNew(false);
      setNewCode("");
      setNewName("");
      setNewPrice("");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setBusy(pendingDelete.code);
    try {
      const res = await fetch(`/api/admin/plans/${pendingDelete.code}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Delete nahi hua", description: json.message, tone: "error" });
        return;
      }
      toast({ title: `${pendingDelete.name} delete ho gaya`, tone: "success" });
      setPendingDelete(null);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const newCodeValid = /^[A-Z][A-Z0-9_]{1,23}$/.test(newCode.trim().toUpperCase());
  const newValid = newCodeValid && newName.trim().length >= 2 && Number(newPrice) >= 0 && newPrice.trim() !== "";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[0.8125rem] text-muted">
          Har plan me kya milta hai — sab yahan se badal sakte hain. Naya plan bhi bana sakte hain (sasta ya mehenga,
          jitne chahe).
        </p>
        <Button size="sm" variant="secondary" onClick={() => setShowNew((v) => !v)}>
          <Plus className="size-4" aria-hidden />
          New Plan
        </Button>
      </div>

      {showNew && (
        <Card variant="soft" padding="md">
          <h3 className="text-sm font-semibold text-ink">Naya plan</h3>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Input
              inputSize="sm"
              label="Code"
              placeholder="MINI"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value.toUpperCase())}
            />
            <Input inputSize="sm" label="Naam" placeholder="Mini" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <Input
              inputSize="sm"
              label="Price (₹)"
              type="number"
              min={0}
              value={newPrice}
              onChange={(e) => setNewPrice(e.target.value)}
            />
            <Input
              inputSize="sm"
              label="Duration label"
              value={newDuration}
              onChange={(e) => setNewDuration(e.target.value)}
            />
            <div>
              <label className="text-xs font-semibold text-ink">Features kis plan se copy karein</label>
              <Select
                selectSize="sm"
                className="mt-1"
                value={cloneFrom}
                onChange={(e) => setCloneFrom(e.target.value)}
                options={plans.map((p) => ({ value: p.code, label: p.name }))}
              />
            </div>
          </div>
          <p className="mt-2 text-xs text-subtle">
            Code baad me badla nahi ja sakta — subscription aur payment rows isi se jude rehte hain. Sirf BADE akshar,
            ank aur underscore.
          </p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="primary" disabled={!newValid || busy !== null} onClick={createPlan}>
              Create Plan
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowNew(false)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      {plans.map((plan) => {
        const open = openCode === plan.code;
        return (
          <Card key={plan.code} variant="default" padding="md">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-ink">{plan.name}</h3>
                  <Pill tone="neutral" size="sm">
                    {plan.code}
                  </Pill>
                  {!plan.isActive && (
                    <Pill tone="danger" size="sm">
                      Band hai
                    </Pill>
                  )}
                  {!plan.isPublic && (
                    <Pill tone="gold" size="sm">
                      <EyeOff className="size-3" aria-hidden />
                      Chhupa hua
                    </Pill>
                  )}
                  {!plan.isBuiltin && (
                    <Pill tone="trust" size="sm">
                      Aapka banaya
                    </Pill>
                  )}
                </div>
                <p className="mt-1 text-[0.8125rem] text-muted">
                  ₹{(plan.priceInPaise / 100).toLocaleString("en-IN")} · {plan.durationLabel} · ladder #{plan.rank} ·{" "}
                  {plan.usageCount} log
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Switch
                  label="Chalu"
                  checked={plan.isActive}
                  disabled={busy === plan.code}
                  onChange={(e) =>
                    patchPlan(
                      plan.code,
                      { isActive: e.target.checked },
                      `${plan.name} ${e.target.checked ? "chalu" : "band"} ho gaya`,
                    )
                  }
                />
                <Switch
                  label="Public"
                  checked={plan.isPublic}
                  disabled={busy === plan.code}
                  onChange={(e) =>
                    patchPlan(
                      plan.code,
                      { isPublic: e.target.checked },
                      `${plan.name} ab ${e.target.checked ? "pricing page par dikhega" : "chhupa rahega"}`,
                    )
                  }
                />
                <Button size="sm" variant="ghost" onClick={() => setOpenCode(open ? null : plan.code)}>
                  {open ? "Band karein" : "Features"}
                </Button>
                {!plan.isBuiltin && plan.usageCount === 0 && (
                  <Button size="sm" variant="ghost" disabled={busy === plan.code} onClick={() => setPendingDelete(plan)}>
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                )}
              </div>
            </div>

            {open && (
              <div className="mt-4 grid grid-cols-1 gap-2 border-t border-line pt-4 sm:grid-cols-2">
                {PLAN_FEATURE_KEYS.map((key) => (
                  <FeatureControl
                    key={key}
                    featureKey={key}
                    value={plan.features[key]}
                    busy={busy === plan.code}
                    onSave={(next) =>
                      patchPlan(
                        plan.code,
                        { features: { [key]: next } },
                        `${plan.name}: ${PLAN_FEATURE_LABELS[key]} update ho gaya`,
                      )
                    }
                  />
                ))}
              </div>
            )}
          </Card>
        );
      })}

      <AdminActionConfirmModal
        isOpen={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        title={pendingDelete ? `${pendingDelete.name} delete karein?` : ""}
        description="Sirf wahi plan delete ho sakta hai jispar kabhi koi nahi tha. Warna deactivate kar dijiye."
        details={pendingDelete ? [{ label: "Code", value: pendingDelete.code }] : []}
        confirmLabel="Yes, Delete"
      />
    </div>
  );
}

/**
 * One capability, rendered by its declared type.
 *
 * Booleans save on toggle; numbers need an explicit Save so a half-typed "1"
 * on the way to "15" never reaches the server. `null` on a nullableNumber key
 * means unlimited — never zero — so it gets its own checkbox rather than
 * asking an admin to type the word.
 */
function FeatureControl({
  featureKey,
  value,
  busy,
  onSave,
}: {
  featureKey: keyof PlanFeatureSet;
  value: PlanFeatureSet[keyof PlanFeatureSet];
  busy: boolean;
  onSave: (next: boolean | number | null) => void;
}) {
  const type = PLAN_FEATURE_TYPES[featureKey];
  const [draft, setDraft] = useState(value === null ? "" : String(value));
  const unlimited = value === null;

  if (type === "boolean") {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md bg-bg-subtle px-3 py-2">
        <span className="text-[0.8125rem] text-ink">{PLAN_FEATURE_LABELS[featureKey]}</span>
        <Switch
          label=""
          checked={Boolean(value)}
          disabled={busy}
          onChange={(e) => onSave(e.target.checked)}
        />
      </div>
    );
  }

  const num = Number(draft);
  const valid = draft.trim() !== "" && Number.isInteger(num) && num >= 0;
  const dirty = valid && num !== value;

  return (
    <div className="rounded-md bg-bg-subtle px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[0.8125rem] text-ink">{PLAN_FEATURE_LABELS[featureKey]}</span>
        {type === "nullableNumber" && (
          <label className="flex items-center gap-1 text-xs text-muted">
            <input
              type="checkbox"
              checked={unlimited}
              disabled={busy}
              onChange={(e) => onSave(e.target.checked ? null : Number(draft) || 1)}
              className="size-3.5 accent-gold-600"
            />
            Unlimited
          </label>
        )}
      </div>
      {!unlimited && (
        <div className="mt-1.5 flex items-center gap-2">
          <Input
            inputSize="sm"
            type="number"
            min={0}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="max-w-24"
            aria-label={PLAN_FEATURE_LABELS[featureKey]}
          />
          <Button size="sm" variant="secondary" disabled={!dirty || busy} onClick={() => onSave(num)}>
            Save
          </Button>
        </div>
      )}
    </div>
  );
}
