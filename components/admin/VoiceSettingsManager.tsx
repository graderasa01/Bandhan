"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Ear, Volume2 } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { Select } from "@/components/ui/Controls";
import { useToast } from "@/components/ui/Toast";
import AdminActionConfirmModal from "@/components/admin/AdminActionConfirmModal";
import {
  GEMINI_VOICES,
  SARVAM_VOICES,
  VOICE_PROVIDERS,
  VOICE_PROVIDER_META,
  type VoiceProviderName,
} from "@/lib/speech/voiceCatalog";

/**
 * Who Grio listens with, and who Grio speaks with.
 *
 * Two dropdowns rather than one because the halves are independently good and
 * an admin should be able to buy the better one of each — Sarvam's Bulbul reads
 * Hinglish without the flat American cadence, while Gemini's audio
 * understanding handles code-mixing on the way in.
 *
 * The keyless warning is the part that earns its place. `resolveVoiceRoute`
 * silently falls back to whichever vendor *does* have a key, which is the right
 * runtime behaviour and a terrible thing to discover by ear: without this line
 * an admin selects Gemini, hears Sarvam, and concludes the setting is broken.
 */

export type VoiceSettingsDraft = {
  sttProvider: VoiceProviderName;
  ttsProvider: VoiceProviderName;
  sarvamVoice: string;
  geminiVoice: string;
};

const LANES = [
  {
    key: "sttProvider" as const,
    title: "Sunna (speech-to-text)",
    blurb: "User jo bolta hai use text me badalna — Grio ke kaan.",
    Icon: Ear,
  },
  {
    key: "ttsProvider" as const,
    title: "Bolna (text-to-speech)",
    blurb: "Grio ka jawab awaaz me sunana — Grio ki zubaan.",
    Icon: Volume2,
  },
];

export default function VoiceSettingsManager({
  current,
  /** Which voice vendors actually have a key installed right now. */
  keyed,
}: {
  current: VoiceSettingsDraft;
  keyed: Record<VoiceProviderName, boolean>;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [draft, setDraft] = useState<VoiceSettingsDraft>(current);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const dirty =
    draft.sttProvider !== current.sttProvider ||
    draft.ttsProvider !== current.ttsProvider ||
    draft.sarvamVoice !== current.sarvamVoice ||
    draft.geminiVoice !== current.geminiVoice;

  // A vendor is only "in use" if some lane points at it — no point warning
  // about a missing Gemini key on a deployment running entirely on Sarvam.
  const missingKeys = VOICE_PROVIDERS.filter(
    (p) => !keyed[p] && (draft.sttProvider === p || draft.ttsProvider === p),
  );

  async function save() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/voice-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Save fail hua", description: json.message, tone: "error" });
        return;
      }
      toast({
        title: "Voice settings update ho gayi",
        description: `Sunna: ${VOICE_PROVIDER_META[draft.sttProvider].label} · Bolna: ${
          VOICE_PROVIDER_META[draft.ttsProvider].label
        }`,
        tone: "success",
      });
      setConfirming(false);
      router.refresh();
    } catch {
      toast({ title: "Network error — dobara try karein", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {LANES.map(({ key, title, blurb, Icon }) => (
        <Card key={key} variant="soft" padding="md">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-semibold text-ink">{title}</h3>
              <p className="mt-0.5 text-xs text-muted">{blurb}</p>
            </div>
            <Icon className="size-5 shrink-0 text-gold-600" />
          </div>

          <div className="mt-3">
            <Select
              selectSize="sm"
              value={draft[key]}
              onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value as VoiceProviderName }))}
              options={VOICE_PROVIDERS.map((p) => ({
                value: p,
                label: keyed[p] ? VOICE_PROVIDER_META[p].label : `${VOICE_PROVIDER_META[p].label} — key nahi hai`,
              }))}
            />
            <p className="mt-1.5 text-xs text-muted">{VOICE_PROVIDER_META[draft[key]].blurb}</p>
          </div>
        </Card>
      ))}

      <Card variant="soft" padding="md">
        <h3 className="font-semibold text-ink">Awaaz (voice)</h3>
        <p className="mt-0.5 text-xs text-muted">
          Dono vendor ki apni alag voice list hai, isliye dono yahan set rehti hain — jo vendor chalega uski voice apne
          aap use hogi.
        </p>

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Sarvam speaker</label>
            <Select
              selectSize="sm"
              value={draft.sarvamVoice}
              onChange={(e) => setDraft((d) => ({ ...d, sarvamVoice: e.target.value }))}
              options={SARVAM_VOICES.map((v) => ({ value: v, label: v }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Gemini voice</label>
            <Select
              selectSize="sm"
              value={draft.geminiVoice}
              onChange={(e) => setDraft((d) => ({ ...d, geminiVoice: e.target.value }))}
              options={GEMINI_VOICES.map((v) => ({ value: v.id, label: v.label }))}
            />
          </div>
        </div>
      </Card>

      {missingKeys.length > 0 && (
        <p className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-ink">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <span>
            {missingKeys.map((p) => VOICE_PROVIDER_META[p].label).join(" aur ")} ki key abhi set nahi hai. Save to ho
            jayega, par jab tak key na aaye tab tak doosra vendor bolega — aur wo bhi na ho to browser ki apni awaaz.
            Key upar &ldquo;API Keys&rdquo; me daalein.
          </span>
        </p>
      )}

      <div>
        <Button size="sm" variant="secondary" disabled={!dirty || busy} onClick={() => setConfirming(true)}>
          Save
        </Button>
      </div>

      <AdminActionConfirmModal
        isOpen={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={save}
        title="Grio ki voice badlein?"
        description="Har naya voice turn turant is vendor se hoga — redeploy ki zaroorat nahi."
        details={[
          {
            label: "Sunna",
            value: `${VOICE_PROVIDER_META[current.sttProvider].label} → ${VOICE_PROVIDER_META[draft.sttProvider].label}`,
          },
          {
            label: "Bolna",
            value: `${VOICE_PROVIDER_META[current.ttsProvider].label} → ${VOICE_PROVIDER_META[draft.ttsProvider].label}`,
          },
          { label: "Voice", value: `Sarvam: ${draft.sarvamVoice} · Gemini: ${draft.geminiVoice}` },
        ]}
        confirmLabel="Yes, Save"
      />
    </div>
  );
}
