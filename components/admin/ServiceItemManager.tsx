"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import type { ServiceItemKind } from "@prisma/client";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Pill from "@/components/ui/Pill";
import { Select } from "@/components/ui/Controls";
import { useToast } from "@/components/ui/Toast";
import { PLAN_FEATURE_KEYS, PLAN_FEATURE_LABELS, PLAN_FEATURE_TYPES } from "@/lib/constants/plans";
import { SERVICE_ITEM_KIND_LABELS } from "@/lib/constants/serviceItems";

/**
 * The à-la-carte catalog editor.
 *
 * Two things it deliberately does not let an admin do, both because the server
 * refuses them anyway and a form that offers a rejected action is a form that
 * teaches people to distrust the screen:
 *
 *   • Set a price of ₹0. A free item cannot be sold (see `availabilityOf`);
 *     giving a capability away has its own home in /admin/features.
 *   • Change the kind of an item that has taken money — the fulfilment that
 *     already happened was decided by the old kind.
 *
 * The capability list comes from `PLAN_FEATURE_KEYS`, so an item can only ever
 * sell something a gate in the app actually reads.
 */
export interface AdminItemView {
  code: string;
  name: string;
  description: string;
  priceInPaise: number;
  kind: ServiceItemKind;
  config: Record<string, unknown>;
  isActive: boolean;
  isPublic: boolean;
  displayOrder: number;
  isBuiltin: boolean;
  configValid: boolean;
  purchaseCount: number;
}

interface Draft {
  code: string;
  name: string;
  description: string;
  priceRupees: string;
  kind: ServiceItemKind;
  capabilityKey: string;
  capabilityValue: string;
  days: string;
  reach: string;
  maxDays: string;
  deliverable: string;
  isActive: boolean;
  isPublic: boolean;
  displayOrder: string;
}

const KIND_OPTIONS = (Object.keys(SERVICE_ITEM_KIND_LABELS) as ServiceItemKind[]).map((k) => ({
  value: k,
  label: SERVICE_ITEM_KIND_LABELS[k],
}));

const CAPABILITY_OPTIONS = PLAN_FEATURE_KEYS.map((k) => ({ value: k, label: PLAN_FEATURE_LABELS[k] }));

function draftFrom(item: AdminItemView): Draft {
  const c = item.config ?? {};
  return {
    code: item.code,
    name: item.name,
    description: item.description,
    priceRupees: String(item.priceInPaise / 100),
    kind: item.kind,
    capabilityKey: typeof c.capabilityKey === "string" ? c.capabilityKey : "advancedDiscovery",
    capabilityValue: c.value === null ? "" : String(c.value ?? "true"),
    days: String(c.days ?? 7),
    reach: String(c.reach ?? 50),
    maxDays: String(c.maxDays ?? 3),
    deliverable: typeof c.deliverable === "string" ? c.deliverable : "",
    isActive: item.isActive,
    isPublic: item.isPublic,
    displayOrder: String(item.displayOrder),
  };
}

const BLANK: Draft = {
  code: "",
  name: "",
  description: "",
  priceRupees: "99",
  kind: "ENTITLEMENT_WINDOW",
  capabilityKey: "advancedDiscovery",
  capabilityValue: "true",
  days: "7",
  reach: "50",
  maxDays: "3",
  deliverable: "",
  isActive: true,
  isPublic: true,
  displayOrder: "0",
};

function buildConfig(d: Draft): Record<string, unknown> {
  if (d.kind === "ENTITLEMENT_WINDOW") {
    const type = PLAN_FEATURE_TYPES[d.capabilityKey as keyof typeof PLAN_FEATURE_TYPES];
    const value = type === "boolean" ? true : d.capabilityValue.trim() === "" ? null : Number(d.capabilityValue);
    return { capabilityKey: d.capabilityKey, value, days: Number(d.days) };
  }
  if (d.kind === "SPOTLIGHT_CAMPAIGN") {
    return { reach: Number(d.reach), maxDays: Number(d.maxDays) };
  }
  return { deliverable: d.deliverable.trim() };
}

/** `Select` renders only the control, so its label is a sibling — same as PlanOfferManager. */
function LabeledSelect({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <span className="text-[0.75rem] font-medium text-muted">{label}</span>
      <div className="mt-1">{children}</div>
    </div>
  );
}

export default function ServiceItemManager({ items }: { items: AdminItemView[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  function openEdit(item: AdminItemView) {
    setEditing(item.code);
    setDraft(draftFrom(item));
  }

  function openNew() {
    setEditing("__new__");
    setDraft({ ...BLANK });
  }

  function close() {
    setEditing(null);
    setDraft(null);
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: draft.code,
          name: draft.name,
          description: draft.description,
          priceRupees: Number(draft.priceRupees),
          kind: draft.kind,
          config: buildConfig(draft),
          isActive: draft.isActive,
          isPublic: draft.isPublic,
          displayOrder: Number(draft.displayOrder),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Save nahi hua", description: json.message, tone: "error" });
        return;
      }
      toast({ title: "Saved", description: `${draft.code} update ho gaya.`, tone: "success" });
      close();
      router.refresh();
    } catch {
      toast({ title: "Network error", description: "Please try again.", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function remove(code: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/items/${encodeURIComponent(code)}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Delete nahi hua", description: json.message, tone: "error" });
        return;
      }
      toast({ title: "Deleted", description: `${code} hata diya gaya.`, tone: "success" });
      router.refresh();
    } catch {
      toast({ title: "Network error", description: "Please try again.", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {items.map((item) => (
        <Card key={item.code} variant="default" padding="md">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-[0.9375rem] font-semibold text-ink">{item.name}</h3>
                <Pill size="sm">{item.code}</Pill>
                <Pill size="sm">{SERVICE_ITEM_KIND_LABELS[item.kind]}</Pill>
                {!item.isActive && (
                  <Pill size="sm" tone="danger">
                    Band
                  </Pill>
                )}
                {!item.isPublic && <Pill size="sm">Private</Pill>}
                {item.isBuiltin && (
                  <Pill size="sm" tone="trust">
                    Built-in
                  </Pill>
                )}
              </div>
              <p className="mt-1 text-[0.8125rem] text-muted">{item.description}</p>
              <p className="mt-1 text-[0.75rem] text-subtle">
                {item.purchaseCount} payment{item.purchaseCount === 1 ? "" : "s"} · order {item.displayOrder}
              </p>
              {!item.configValid && (
                <p className="mt-2 flex items-center gap-1.5 text-[0.75rem] font-medium text-danger">
                  <AlertTriangle className="size-3.5" aria-hidden />
                  Config galat hai — ye item bik nahi raha.
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-lg font-bold text-wine-700">
                ₹{(item.priceInPaise / 100).toLocaleString("en-IN")}
              </span>
              <Button variant="secondary" size="sm" onClick={() => openEdit(item)} disabled={busy}>
                Edit
              </Button>
              {!item.isBuiltin && item.purchaseCount === 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => remove(item.code)}
                  disabled={busy}
                  ariaLabel={`Delete ${item.code}`}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
          </div>

          {editing === item.code && draft && (
            <ItemForm
              draft={draft}
              setDraft={setDraft}
              kindLocked={item.purchaseCount > 0}
              codeLocked
              busy={busy}
              onSave={save}
              onCancel={close}
            />
          )}
        </Card>
      ))}

      {editing === "__new__" && draft ? (
        <Card variant="soft" padding="md">
          <h3 className="text-[0.9375rem] font-semibold text-ink">Naya item</h3>
          <ItemForm
            draft={draft}
            setDraft={setDraft}
            kindLocked={false}
            codeLocked={false}
            busy={busy}
            onSave={save}
            onCancel={close}
          />
        </Card>
      ) : (
        <Button variant="secondary" size="sm" onClick={openNew} icon={<Plus className="size-4" />}>
          Add item
        </Button>
      )}
    </div>
  );
}

function ItemForm({
  draft,
  setDraft,
  kindLocked,
  codeLocked,
  busy,
  onSave,
  onCancel,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  kindLocked: boolean;
  codeLocked: boolean;
  busy: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const capabilityType = PLAN_FEATURE_TYPES[draft.capabilityKey as keyof typeof PLAN_FEATURE_TYPES];

  return (
    <div className="mt-4 space-y-3 border-t border-line pt-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="Code"
          value={draft.code}
          disabled={codeLocked}
          onChange={(e) => set({ code: e.target.value.toUpperCase() })}
          helperText={codeLocked ? "Code kabhi nahi badalta." : "BADE letters, numbers, underscore."}
        />
        <Input label="Naam" value={draft.name} onChange={(e) => set({ name: e.target.value })} />
      </div>

      <Input
        label="Description (user ko yahi dikhta hai)"
        value={draft.description}
        maxLength={300}
        onChange={(e) => set({ description: e.target.value })}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Input
          label="Daam (₹)"
          type="number"
          min={1}
          value={draft.priceRupees}
          onChange={(e) => set({ priceRupees: e.target.value })}
        />
        <LabeledSelect label="Kind">
          <Select
            selectSize="sm"
            value={draft.kind}
            disabled={kindLocked}
            onChange={(e) => set({ kind: e.target.value as ServiceItemKind })}
            options={KIND_OPTIONS}
          />
        </LabeledSelect>
        <Input
          label="Display order"
          type="number"
          min={0}
          value={draft.displayOrder}
          onChange={(e) => set({ displayOrder: e.target.value })}
        />
      </div>

      {draft.kind === "ENTITLEMENT_WINDOW" && (
        <div className="grid gap-3 sm:grid-cols-3">
          <LabeledSelect label="Capability">
            <Select
              selectSize="sm"
              value={draft.capabilityKey}
              onChange={(e) => set({ capabilityKey: e.target.value })}
              options={CAPABILITY_OPTIONS}
            />
          </LabeledSelect>
          {capabilityType === "boolean" ? (
            <Input label="Value" value="on" disabled helperText="Boolean capability hamesha on hi bikti hai." />
          ) : (
            <Input
              label={capabilityType === "nullableNumber" ? "Value (khaali = unlimited)" : "Value"}
              type="number"
              min={1}
              value={draft.capabilityValue}
              onChange={(e) => set({ capabilityValue: e.target.value })}
            />
          )}
          <Input
            label="Kitne din"
            type="number"
            min={1}
            value={draft.days}
            onChange={(e) => set({ days: e.target.value })}
          />
        </div>
      )}

      {draft.kind === "SPOTLIGHT_CAMPAIGN" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Reach (unique log)"
            type="number"
            min={1}
            value={draft.reach}
            onChange={(e) => set({ reach: e.target.value })}
          />
          <Input
            label="Max din"
            type="number"
            min={1}
            value={draft.maxDays}
            onChange={(e) => set({ maxDays: e.target.value })}
          />
        </div>
      )}

      {draft.kind === "AI_DELIVERABLE" && (
        <Input label="Deliverable" value={draft.deliverable} onChange={(e) => set({ deliverable: e.target.value })} />
      )}

      <div className="flex flex-wrap items-center gap-4 pt-1">
        <label className="flex items-center gap-2 text-[0.8125rem] text-ink">
          <input type="checkbox" checked={draft.isActive} onChange={(e) => set({ isActive: e.target.checked })} />
          Active
        </label>
        <label className="flex items-center gap-2 text-[0.8125rem] text-ink">
          <input type="checkbox" checked={draft.isPublic} onChange={(e) => set({ isPublic: e.target.checked })} />
          Public
        </label>
      </div>

      <div className="flex gap-2 pt-1">
        <Button variant="primary" size="sm" onClick={onSave} loading={busy}>
          Save item
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
