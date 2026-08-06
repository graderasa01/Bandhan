"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, ShieldCheck, X } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { Select } from "@/components/ui/Controls";
import { useToast } from "@/components/ui/Toast";
import {
  PLAN_FEATURE_KEYS,
  PLAN_FEATURE_LABELS,
  PLAN_FEATURE_TYPES,
  PLAN_NAMES,
  PLAN_ORDER,
  type PlanFeatureSet,
} from "@/lib/constants/plans";
import type { PlanCode } from "@prisma/client";

export type ActiveOverrideRow = {
  id: string;
  userName: string;
  userEmail: string | null;
  planCode: PlanCode | null;
  capabilityKey: string | null;
  value: string | null;
  reason: string;
  expiresAt: string | null;
};

type FoundUser = { id: string; fullName: string; email: string | null; mobile: string | null };

type Mode = "plan" | "capability";

/**
 * Hand-granting access.
 *
 * The whole reason this screen exists: paid features have to be testable and
 * demo-able before Razorpay is wired, and support has to be able to say yes to
 * a real person without anyone editing the pricing ladder. Overrides are
 * raise-only (see entitlementOverrides.ts) — this UI cannot take anything away,
 * by design.
 */
export default function EntitlementOverrideManager({ active }: { active: ActiveOverrideRow[] }) {
  const router = useRouter();
  const { toast } = useToast();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoundUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [target, setTarget] = useState<FoundUser | null>(null);

  const [mode, setMode] = useState<Mode>("plan");
  const [planCode, setPlanCode] = useState<PlanCode>("PREMIUM");
  const [capabilityKey, setCapabilityKey] = useState<keyof PlanFeatureSet>("chat");
  const [capValue, setCapValue] = useState("true");
  const [reason, setReason] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("30");
  const [busy, setBusy] = useState(false);

  const capType = PLAN_FEATURE_TYPES[capabilityKey];

  async function search() {
    if (query.trim().length < 3) {
      toast({ title: "Kam se kam 3 akshar likhein", tone: "warning" });
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/admin/entitlements?q=${encodeURIComponent(query.trim())}`);
      const json = await res.json();
      setResults(json.users ?? []);
      if ((json.users ?? []).length === 0) toast({ title: "Koi user nahi mila", tone: "info" });
    } finally {
      setSearching(false);
    }
  }

  function parsedValue(): boolean | number | null {
    if (capType === "boolean") return capValue === "true";
    if (capValue === "unlimited") return null;
    const n = Number(capValue);
    return Number.isFinite(n) ? Math.trunc(n) : 0;
  }

  async function grant() {
    if (!target) return;
    if (reason.trim().length < 3) {
      toast({ title: "Reason likhna zaroori hai", description: "Baad me audit log me yahi dikhega.", tone: "warning" });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/entitlements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: target.id,
          planCode: mode === "plan" ? planCode : null,
          capabilityKey: mode === "capability" ? capabilityKey : null,
          value: mode === "capability" ? parsedValue() : undefined,
          reason: reason.trim(),
          expiresInDays: expiresInDays === "never" ? null : Number(expiresInDays),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Grant fail hua", description: json.message, tone: "error" });
        return;
      }
      toast({
        title: `${target.fullName} ko access mil gaya`,
        description:
          mode === "plan"
            ? `${PLAN_NAMES[planCode]} plan${expiresInDays === "never" ? "" : `, ${expiresInDays} din ke liye`}`
            : PLAN_FEATURE_LABELS[capabilityKey],
        tone: "success",
      });
      setReason("");
      setTarget(null);
      setResults([]);
      setQuery("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    const res = await fetch(`/api/admin/entitlements/${id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Admin panel se revoke" }),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) {
      toast({ title: "Revoke fail hua", description: json.message, tone: "error" });
      return;
    }
    toast({ title: "Override hata diya", tone: "success" });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <Card padding="md">
        <h3 className="mb-3 text-[0.9375rem] font-semibold text-ink">Kisi user ko access dein</h3>

        {/* Step 1 — find the person */}
        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="Naam, email ya mobile"
            aria-label="User dhoondhein"
          />
          <Button type="button" onClick={search} disabled={searching} variant="secondary">
            <Search className="size-4" />
            Search
          </Button>
        </div>

        {results.length > 0 && !target && (
          <ul className="mt-3 space-y-1">
            {results.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => setTarget(u)}
                  className="flex min-h-12 w-full items-center gap-3 rounded-md border border-line px-3 py-2 text-left hover:bg-bg-subtle"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink">{u.fullName}</span>
                    <span className="block text-[0.75rem] text-muted">{u.email ?? u.mobile ?? u.id}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {target && (
          <div className="mt-4 space-y-3 rounded-md border border-gold-300/60 bg-gold-50 p-4 dark:bg-gold-900/20">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 shrink-0 text-gold-700" />
              <span className="min-w-0 flex-1 text-sm font-semibold text-ink">{target.fullName}</span>
              <button
                type="button"
                onClick={() => setTarget(null)}
                aria-label="Change"
                className="grid size-8 place-items-center rounded-full text-muted hover:bg-surface"
              >
                <X className="size-4" />
              </button>
            </div>

            <Select
              aria-label="Kya dena hai"
              value={mode}
              onChange={(e) => setMode(e.target.value as Mode)}
              options={[
                { value: "plan", label: "Full Plan" },
                { value: "capability", label: "Single Capability" },
              ]}
            />

            {mode === "plan" ? (
              <Select
                aria-label="Plan"
                value={planCode}
                onChange={(e) => setPlanCode(e.target.value as PlanCode)}
                options={PLAN_ORDER.map((p) => ({ value: p, label: PLAN_NAMES[p] }))}
              />
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                <Select
                  aria-label="Capability"
                  value={capabilityKey}
                  onChange={(e) => {
                    const key = e.target.value as keyof PlanFeatureSet;
                    setCapabilityKey(key);
                    setCapValue(PLAN_FEATURE_TYPES[key] === "boolean" ? "true" : "10");
                  }}
                  options={PLAN_FEATURE_KEYS.map((k) => ({ value: k, label: PLAN_FEATURE_LABELS[k] }))}
                />
                {capType === "boolean" ? (
                  <Select
                    aria-label="Value"
                    value={capValue}
                    onChange={(e) => setCapValue(e.target.value)}
                    options={[{ value: "true", label: "Enabled" }]}
                  />
                ) : (
                  <Input
                    value={capValue}
                    onChange={(e) => setCapValue(e.target.value)}
                    placeholder={capType === "nullableNumber" ? "number ya 'unlimited'" : "number"}
                    aria-label="Value"
                  />
                )}
              </div>
            )}

            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason — audit log me dikhega"
              aria-label="Reason"
            />

            <Select
              aria-label="Kab tak"
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(e.target.value)}
              options={[
                { value: "7", label: "7 din" },
                { value: "30", label: "30 din" },
                { value: "90", label: "90 din" },
                { value: "365", label: "1 saal" },
                { value: "never", label: "Hamesha (expiry nahi)" },
              ]}
            />

            <Button type="button" onClick={grant} disabled={busy} className="w-full">
              Grant Access
            </Button>

            <p className="text-[0.75rem] leading-snug text-muted">
              Override sirf badha sakta hai, ghata nahi. Access wapas lene ke liye niche se revoke karein.
            </p>
          </div>
        )}
      </Card>

      <Card padding="md">
        <h3 className="mb-3 text-[0.9375rem] font-semibold text-ink">
          Abhi chalu overrides ({active.length})
        </h3>
        {active.length === 0 ? (
          <p className="text-sm text-muted">Abhi kisi user ke paas manual access nahi hai.</p>
        ) : (
          <ul className="space-y-2">
            {active.map((o) => (
              <li
                key={o.id}
                className="flex flex-col gap-2 rounded-md border border-line p-3 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">
                    {o.userName}
                    <span className="ml-2 text-[0.75rem] font-normal text-muted">{o.userEmail}</span>
                  </p>
                  <p className="text-[0.8125rem] text-muted">
                    {o.planCode
                      ? `Plan: ${PLAN_NAMES[o.planCode]}`
                      : `${PLAN_FEATURE_LABELS[o.capabilityKey as keyof PlanFeatureSet] ?? o.capabilityKey} = ${o.value}`}
                    {" · "}
                    {o.expiresAt ? `${new Date(o.expiresAt).toLocaleDateString("en-IN")} tak` : "hamesha"}
                  </p>
                  <p className="text-[0.75rem] text-subtle">{o.reason}</p>
                </div>
                <Button type="button" variant="ghost" onClick={() => revoke(o.id)}>
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
