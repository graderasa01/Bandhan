import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getAllAiRoutes } from "@/lib/ai/aiConfigService";
import { listCredentialStatus } from "@/lib/ai/credentials";
import { isSecretBoxConfigured } from "@/lib/security/secretBox";
import { AI_FEATURE_LABELS } from "@/lib/ai/models";
import AdminShell from "@/components/layout/AdminShell";
import AiSettingsManager from "@/components/admin/AiSettingsManager";
import ProviderKeyManager from "@/components/admin/ProviderKeyManager";
import VoiceSettingsManager from "@/components/admin/VoiceSettingsManager";
import { getVoiceSettings } from "@/lib/speech/voiceConfig";
import { VOICE_PROVIDERS, VOICE_PROVIDER_META, type VoiceProviderName } from "@/lib/speech/voiceCatalog";

export default async function AdminAiSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login?next=/admin/ai-settings");
  if (user.role !== "ADMIN") redirect("/");

  const [routes, credentials, voice] = await Promise.all([
    getAllAiRoutes(),
    listCredentialStatus(),
    getVoiceSettings(),
  ]);

  // Derived from the credential rows already fetched rather than a second read,
  // so the warning inside the voice panel can never disagree with the key list
  // rendered directly above it.
  const keyed = Object.fromEntries(
    VOICE_PROVIDERS.map((p) => [
      p,
      credentials.some((c) => c.provider === VOICE_PROVIDER_META[p].credential && c.source !== "NONE"),
    ]),
  ) as Record<VoiceProviderName, boolean>;

  return (
    <AdminShell adminName={user.fullName}>
      <div className="mx-auto max-w-4xl">
        <section className="mb-6">
          <h1 className="text-2xl font-bold text-wine-700">AI Settings</h1>
          <p className="mt-2 text-sm text-muted">
            Har AI feature ke liye provider aur model yahan se badlein — turant live ho jata hai, redeploy ki zaroorat
            nahi.
          </p>
        </section>

        {/* Keys before routing: choosing a provider whose key isn't installed
            is the one way to leave a feature dead, and this order makes the
            missing key visible before the dropdown that depends on it. */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-ink">API Keys</h2>
          <p className="mt-1 text-sm text-muted">
            Yahan set ki gayi key env var par bhaari padti hai aur encrypted store hoti hai. Key kabhi wapas screen par
            nahi dikhti — sirf aakhri 4 characters.
          </p>
          <div className="mt-4">
            <ProviderKeyManager
              encryptionConfigured={isSecretBoxConfigured()}
              rows={credentials.map((c) => ({
                provider: c.provider,
                label: c.label,
                envVar: c.envVar,
                blurb: c.blurb,
                source: c.source,
                maskedHint: c.maskedHint,
                updatedAt: c.updatedAt?.toISOString() ?? null,
              }))}
            />
          </div>
        </section>

        {/* Between keys and text routing on purpose: voice has its own vendors
            (Sarvam sells no text model, so it never appears below) and its own
            failure mode — an unkeyed choice degrades by ear, not by error. */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-ink">Grio ki awaaz</h2>
          <p className="mt-1 text-sm text-muted">
            Grio kis vendor se sunta hai aur kis se bolta hai. Dono alag-alag chun sakte hain. Koi bhi vendor available
            na ho to browser ki apni awaaz chal jaati hai — feature kabhi band nahi hota.
          </p>
          <div className="mt-4">
            <VoiceSettingsManager
              current={{
                sttProvider: voice.sttProvider,
                ttsProvider: voice.ttsProvider,
                sarvamVoice: voice.sarvamVoice,
                geminiVoice: voice.geminiVoice,
              }}
              keyed={keyed}
            />
          </div>
        </section>

        <h2 className="mb-4 text-lg font-semibold text-ink">Feature routing</h2>
        <AiSettingsManager
          rows={routes.map((r) => ({
            feature: r.feature,
            label: AI_FEATURE_LABELS[r.feature],
            provider: r.route.provider,
            model: r.route.model,
            isDefault: r.isDefault,
            retiredModel: r.retiredModel,
          }))}
        />
      </div>
    </AdminShell>
  );
}
