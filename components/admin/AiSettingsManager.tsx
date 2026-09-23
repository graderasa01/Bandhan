"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Layers, Sparkles } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { Checkbox, Select } from "@/components/ui/Controls";
import { useToast } from "@/components/ui/Toast";
import AdminActionConfirmModal from "@/components/admin/AdminActionConfirmModal";
import {
  AI_IMAGE_EDIT_FEATURES,
  AI_IMAGE_EDIT_PROVIDER_MODELS,
  AI_PROVIDER_MODELS,
  AI_VISION_FEATURES,
  type AiFeatureKey,
  type AiProviderName,
} from "@/lib/ai/models";
import { planProviderSwitch } from "@/lib/ai/providerSwitch";
import type { ModelAvailability } from "@/lib/ai/health";
import { AvailabilityBadge } from "@/components/admin/AiHealthPanel";

const PROVIDER_LABELS: Record<AiProviderName, string> = {
  ANTHROPIC: "Claude (Anthropic)",
  OPENAI: "ChatGPT (OpenAI)",
  GEMINI: "Gemini (Google)",
  DEEPSEEK: "DeepSeek",
};

export type AdminAiRoute = {
  feature: AiFeatureKey;
  label: string;
  provider: AiProviderName;
  model: string;
  isDefault: boolean;
  /** The saved model was retired by its provider; `model` above is the stand-in now running. */
  retiredModel: string | null;
  /**
   * What the router would try right now if this feature were called, primary
   * first — computed from live health and the fallback policy, not stored.
   */
  chain?: { provider: AiProviderName; model: string; role: string }[];
};

/** Last observed state per `PROVIDER:model` — see components/admin/AiHealthPanel. */
export type ModelHealthMap = Record<string, { state: ModelAvailability; label: string; stale: boolean }>;

type Draft = { provider: AiProviderName; model: string };

type PendingSave = { feature: AiFeatureKey; label: string; draft: Draft; prev: Draft } | null;

/** Providers that have at least one vision-capable model — the only valid picks for a vision feature. */
const VISION_PROVIDERS = (Object.keys(AI_PROVIDER_MODELS) as AiProviderName[]).filter((p) =>
  AI_PROVIDER_MODELS[p].some((m) => m.vision),
);

/**
 * The move that used to take sixteen dropdowns and sixteen confirm dialogs.
 *
 * Its reason for existing is not convenience. When a provider's credit runs
 * out, every feature on it is dead at once, and the per-feature UI below makes
 * the recovery long enough that features get left behind — this deployment was
 * found with ten features stranded on a provider whose balance had been zero
 * for days, and six of the moved ones stacked on a single model ID.
 *
 * The plan is computed client-side by the same `planProviderSwitch` the server
 * runs, so the confirm dialog shows exactly what will be written — the admin is
 * never agreeing to "switch everything" without seeing where everything lands.
 */
function BulkProviderSwitch({ onDone }: { onDone: () => void }) {
  const { toast } = useToast();
  const [provider, setProvider] = useState<AiProviderName>("GEMINI");
  const [spread, setSpread] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const mode = spread ? "spread" : "tier";
  const plan = useMemo(() => planProviderSwitch(provider, mode), [provider, mode]);

  /** One row per model, so the dialog reads as "these features, this bucket". */
  const byModel = useMemo(() => {
    const groups = new Map<string, AiFeatureKey[]>();
    for (const a of plan.assignments) groups.set(a.model, [...(groups.get(a.model) ?? []), a.feature]);
    return [...groups.entries()];
  }, [plan]);

  async function apply() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/ai-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, mode }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Switch fail hua", description: json.message, tone: "error" });
        return;
      }
      toast({
        title: `${json.appliedCount} features ab ${PROVIDER_LABELS[provider]} par hain`,
        description:
          `${json.modelsUsed} alag model use ho rahe hain.` +
          (json.skipped?.length ? ` ${json.skipped.length} feature skip hua — neeche dekhein.` : ""),
        tone: "success",
      });
      setConfirming(false);
      onDone();
    } catch {
      toast({ title: "Network error — dobara try karein", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card variant="elevated" padding="md" className="mb-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-ink">Sab ek provider par</h3>
          <p className="mt-1 text-sm text-muted">
            Ek provider ki credit khatam ho jaaye to neeche ek-ek karke badalne ki zaroorat nahi — yahan se saare
            features ek saath shift ho jaate hain. Har feature ka tier bacha rehta hai: chhote, baar-baar chalne wale
            call saste model par, aur lambi prose wale zyada capable par.
          </p>
        </div>
        <Layers className="size-5 shrink-0 text-gold-600" />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
        <Select
          selectSize="sm"
          value={provider}
          onChange={(e) => setProvider(e.target.value as AiProviderName)}
          options={(Object.keys(AI_PROVIDER_MODELS) as AiProviderName[]).map((p) => ({
            value: p,
            label: PROVIDER_LABELS[p],
          }))}
        />
        <Button size="sm" variant="primary" disabled={busy} onClick={() => setConfirming(true)}>
          Switch All
        </Button>
      </div>

      <Checkbox
        className="mt-1"
        checked={spread}
        onChange={(e) => setSpread(e.target.checked)}
        label="Models me baant do"
        description="Rate limit har model ID par alag ginti jaata hai — Gemini ke free tier par khaas kar. Sab features ek hi model par daal denge to sabka daily budget ek hi jagah se katega."
      />

      <p className="mt-2 text-xs text-muted">
        {plan.assignments.length} features → {PROVIDER_LABELS[provider]} · {byModel.length} alag model
        {plan.skipped.length > 0 && ` · ${plan.skipped.length} skip`}
      </p>

      {plan.skipped.map((s) => (
        <p key={s.feature} className="mt-1 text-xs text-warn">
          <code>{s.feature}</code> nahi badlega — {s.reason}
        </p>
      ))}

      <AdminActionConfirmModal
        isOpen={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={apply}
        title={`Saare features ${PROVIDER_LABELS[provider]} par shift karein?`}
        description={`${plan.assignments.length} features ka har naya AI call turant in models se hoga. Jo feature is provider par chal hi nahi sakta, wo jahan hai wahin rahega.`}
        details={byModel.map(([model, features]) => ({ label: model, value: features.join(", ") }))}
        confirmLabel="Yes, Switch All"
      />
    </Card>
  );
}

export default function AiSettingsManager({
  rows,
  health = {},
}: {
  rows: AdminAiRoute[];
  /**
   * The dropdown's options carry each model's last observed state, so a model
   * that has been answering 503 all afternoon cannot be picked believing it
   * works. Shown, not hidden: a 503 is usually temporary and an admin may know
   * better than the last observation.
   */
  health?: ModelHealthMap;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [drafts, setDrafts] = useState<Record<string, Draft>>(
    Object.fromEntries(rows.map((r) => [r.feature, { provider: r.provider, model: r.model }])),
  );
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingSave>(null);

  function providersFor(feature: AiFeatureKey): AiProviderName[] {
    if (AI_IMAGE_EDIT_FEATURES.has(feature)) return Object.keys(AI_IMAGE_EDIT_PROVIDER_MODELS) as AiProviderName[];
    return AI_VISION_FEATURES.has(feature) ? VISION_PROVIDERS : (Object.keys(AI_PROVIDER_MODELS) as AiProviderName[]);
  }

  function modelsFor(feature: AiFeatureKey, provider: AiProviderName) {
    if (AI_IMAGE_EDIT_FEATURES.has(feature)) {
      return provider === "OPENAI" || provider === "GEMINI" ? AI_IMAGE_EDIT_PROVIDER_MODELS[provider] : [];
    }
    const all = AI_PROVIDER_MODELS[provider];
    return AI_VISION_FEATURES.has(feature) ? all.filter((m) => m.vision) : all;
  }

  function setProvider(feature: AiFeatureKey, provider: AiProviderName) {
    const firstModel = modelsFor(feature, provider)[0]?.id ?? "";
    setDrafts((d) => ({ ...d, [feature]: { provider, model: firstModel } }));
  }

  function setModel(feature: AiFeatureKey, model: string) {
    setDrafts((d) => ({ ...d, [feature]: { ...d[feature], model } }));
  }

  async function confirmSave() {
    if (!pending) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/ai-settings/${pending.feature}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pending.draft),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Save fail hua", description: json.message, tone: "error" });
        return;
      }
      toast({
        title: `${pending.label} ka provider update ho gaya`,
        description: `${PROVIDER_LABELS[pending.draft.provider]} · ${pending.draft.model}`,
        tone: "success",
      });
      setPending(null);
      router.refresh();
    } catch {
      toast({ title: "Network error — dobara try karein", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Drafts are cleared, not just refreshed. Each row below falls back to
          its server value when it has no draft, so dropping them is what makes
          the sixteen dropdowns show what the bulk switch just wrote — leaving
          them would render every row as unsaved-dirty against a stale value. */}
      <BulkProviderSwitch
        onDone={() => {
          setDrafts({});
          router.refresh();
        }}
      />

      {rows.map((row) => {
        const draft = drafts[row.feature] ?? { provider: row.provider, model: row.model };
        const dirty = draft.provider !== row.provider || draft.model !== row.model;
        const models = modelsFor(row.feature, draft.provider);
        const modelValid = models.some((m) => m.id === draft.model);

        return (
          <Card key={row.feature} variant="soft" padding="md">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-semibold text-ink">{row.label}</h3>
                {AI_VISION_FEATURES.has(row.feature) && (
                  <p className="mt-0.5 text-xs text-muted">Photo/PDF padhta hai — sirf vision-capable model chalega.</p>
                )}
                {AI_IMAGE_EDIT_FEATURES.has(row.feature) && (
                  <p className="mt-0.5 text-xs text-muted">
                    Naya photo generate karta hai — sirf GPT ya Gemini support karte hain, Claude/DeepSeek nahi.
                  </p>
                )}
                {row.isDefault && <p className="mt-0.5 text-xs text-muted">Abhi code ka default use ho raha hai.</p>}
                {row.retiredModel && (
                  <p className="mt-0.5 text-xs text-warn">
                    Purana model <code>{row.retiredModel}</code> provider ne band kar diya — filhaal{" "}
                    <code>{row.model}</code> chal raha hai. Neeche se apni pasand ka model chun kar save kar dijiye.
                  </p>
                )}
                {health[`${row.provider}:${row.model}`] && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span>Abhi:</span>
                    <AvailabilityBadge {...health[`${row.provider}:${row.model}`]} />
                  </div>
                )}
                {row.chain && row.chain.length > 1 && (
                  <p className="mt-1 text-xs text-muted">
                    Ye na chale to:{" "}
                    <code>
                      {row.chain
                        .filter((c) => c.role !== "primary")
                        .map((c) => `${c.provider === row.provider ? "" : `${c.provider}:`}${c.model}`)
                        .join(" → ")}
                    </code>
                  </p>
                )}
              </div>
              <Sparkles className="size-5 shrink-0 text-gold-600" />
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <Select
                selectSize="sm"
                value={draft.provider}
                onChange={(e) => setProvider(row.feature, e.target.value as AiProviderName)}
                options={providersFor(row.feature).map((p) => ({ value: p, label: PROVIDER_LABELS[p] }))}
              />
              <Select
                selectSize="sm"
                value={modelValid ? draft.model : ""}
                placeholder={modelValid ? undefined : "Model chunein"}
                onChange={(e) => setModel(row.feature, e.target.value)}
                options={models.map((m) => {
                  const h = health[`${draft.provider}:${m.id}`];
                  const suffix = !h || h.state === "UNKNOWN" ? "" : h.state === "AVAILABLE" ? " · Available" : ` · ${h.label}`;
                  return { value: m.id, label: `${m.label}${suffix}` };
                })}
              />
              <Button
                size="sm"
                variant="secondary"
                disabled={!dirty || !modelValid || busy}
                onClick={() =>
                  setPending({
                    feature: row.feature,
                    label: row.label,
                    draft,
                    prev: { provider: row.provider, model: row.model },
                  })
                }
              >
                Save
              </Button>
            </div>
          </Card>
        );
      })}

      <AdminActionConfirmModal
        isOpen={pending !== null}
        onClose={() => setPending(null)}
        onConfirm={confirmSave}
        title={pending ? `${pending.label} ka AI provider badlein?` : ""}
        description="Is feature ka har naya AI call turant is provider/model se hoga."
        details={
          pending
            ? [
                { label: "Pehle", value: `${PROVIDER_LABELS[pending.prev.provider]} · ${pending.prev.model}` },
                { label: "Ab", value: `${PROVIDER_LABELS[pending.draft.provider]} · ${pending.draft.model}` },
              ]
            : []
        }
        confirmLabel="Yes, Save"
      />
    </div>
  );
}
