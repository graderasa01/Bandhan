"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { Select } from "@/components/ui/Controls";
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
};

type Draft = { provider: AiProviderName; model: string };

type PendingSave = { feature: AiFeatureKey; label: string; draft: Draft; prev: Draft } | null;

/** Providers that have at least one vision-capable model — the only valid picks for a vision feature. */
const VISION_PROVIDERS = (Object.keys(AI_PROVIDER_MODELS) as AiProviderName[]).filter((p) =>
  AI_PROVIDER_MODELS[p].some((m) => m.vision),
);

export default function AiSettingsManager({ rows }: { rows: AdminAiRoute[] }) {
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
                options={models.map((m) => ({ value: m.id, label: m.label }))}
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
