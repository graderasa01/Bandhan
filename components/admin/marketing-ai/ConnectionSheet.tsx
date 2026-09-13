"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, KeyRound, ShieldAlert, ShieldCheck, XCircle } from "lucide-react";
import Sheet from "@/components/ui/Sheet";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import Field from "@/components/ui/Field";
import Pill from "@/components/ui/Pill";
import { useToast } from "@/components/ui/Toast";
import AdminActionConfirmModal from "@/components/admin/AdminActionConfirmModal";
import {
  CONNECTION_HEALTH_LABEL,
  CONVERSION_EVENTS,
  MARKETING_PROVIDER_META,
  type ConnectionStatusRow,
  type MarketingProviderKey,
  type MetaReadinessReport,
  type MetaReadinessState,
} from "@/lib/contracts/marketingAi";

const HEALTH_TONE = { CONNECTED: "trust", NEEDS_ATTENTION: "gold", NOT_CONNECTED: "neutral" } as const;

/** Doc 14 §9 — one pill per readiness answer. UNVERIFIED is an honest answer, not a pass. */
const READINESS_TONE: Record<MetaReadinessState, "trust" | "danger" | "gold" | "neutral"> = { READY: "trust", MISSING: "danger", UNVERIFIED: "gold", NOT_NEEDED: "neutral" };

/** The env fallback behind each Meta id (`connectionService.envAccountRef`) — named when that is what the sheet is showing. */
const META_ENV_NAME: Partial<Record<MarketingProviderKey, string>> = { META_ADS: "META_AD_ACCOUNT_ID", FACEBOOK_PAGE: "META_FACEBOOK_PAGE_ID", INSTAGRAM: "META_INSTAGRAM_USER_ID" };

/**
 * Meta Ads options only an admin sets (doc 14 §6, §10): special ad categories
 * are a policy decision the model never guesses, and a Pixel + event exist
 * only when LEADS/SALES tracking is really configured.
 */
const META_ADMIN_KEYS = ["specialAdCategories", "specialAdCategoryCountry", "metaPixelId", "metaConversionEvent"] as const;
type MetaAdminKey = (typeof META_ADMIN_KEYS)[number];
type MetaAdminSettings = Record<MetaAdminKey, string>;

function metaAdminSettingsOf(settings: Record<string, string> | undefined): MetaAdminSettings {
  return {
    specialAdCategories: settings?.specialAdCategories ?? "",
    specialAdCategoryCountry: settings?.specialAdCategoryCountry ?? "",
    metaPixelId: settings?.metaPixelId ?? "",
    metaConversionEvent: settings?.metaConversionEvent ?? "",
  };
}

/**
 * MKT-2: which Google Ads conversion action a BandhanTak event maps to is a
 * product decision (doc 13 §23), never guessed. Stored as settings keys
 * `conversion_<event>` and edited here as "event=resourceName" lines; when
 * a line is absent, preflight matches by exact name and blocks otherwise.
 */
function conversionMapText(settings: Record<string, string>): string {
  return CONVERSION_EVENTS.filter((e) => settings[`conversion_${e}`])
    .map((e) => `${e}=${settings[`conversion_${e}`]}`)
    .join("\n");
}

function parseConversionMap(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const [k, ...rest] = line.split("=");
    const event = k?.trim();
    const value = rest.join("=").trim();
    if (event && value && (CONVERSION_EVENTS as readonly string[]).includes(event)) out[`conversion_${event}`] = value;
  }
  return out;
}

/**
 * One provider's connection, in a drawer. The rule it keeps is the one
 * `ProviderKeyManager` keeps: **a stored secret never comes back to the
 * browser.** A Google grant arrives through the consent redirect; a Meta or
 * developer token is pasted into a password field, sent once, and the
 * field is cleared. "Is it right" is answered by Test, never by display —
 * and for Meta Ads, "can ads be created" by the separate readiness check.
 */
export default function ConnectionSheet({
  row,
  encryptionConfigured,
  googleOAuthConfigured,
  onClose,
  onChanged,
}: {
  row: ConnectionStatusRow | null;
  encryptionConfigured: boolean;
  googleOAuthConfigured: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const provider = row && row.provider !== "BANDHANTAK" ? (row.provider as MarketingProviderKey) : null;
  const meta = provider ? MARKETING_PROVIDER_META[provider] : null;

  const [accountRef, setAccountRef] = useState("");
  const [accountLabel, setAccountLabel] = useState("");
  const [loginCustomerId, setLoginCustomerId] = useState("");
  const [conversionMap, setConversionMap] = useState("");
  const [metaAdmin, setMetaAdmin] = useState<MetaAdminSettings>(metaAdminSettingsOf(undefined));
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);
  const [readiness, setReadiness] = useState<MetaReadinessReport | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  useEffect(() => {
    setAccountRef(row?.accountRef ?? "");
    setAccountLabel(row?.accountLabel ?? "");
    setLoginCustomerId(row?.settings.loginCustomerId ?? "");
    setConversionMap(row ? conversionMapText(row.settings) : "");
    setMetaAdmin(metaAdminSettingsOf(row?.settings));
  }, [row]);

  // Transient answers reset only when a different provider's sheet opens. The
  // console rebuilds `row` on every overview refresh — which each action here
  // triggers — and that must not wipe the result it was refreshed to show.
  useEffect(() => {
    setSecret("");
    setTest(null);
    setReadiness(null);
  }, [row?.provider]);

  if (!provider || !meta || !row) {
    return <Sheet open={false} onClose={onClose} variant="side">{null}</Sheet>;
  }

  async function saveSettings() {
    setBusy("save");
    try {
      const settings: Record<string, string> = {};
      if (provider === "GOOGLE_ADS" && loginCustomerId.trim()) settings.loginCustomerId = loginCustomerId.trim();
      if (provider === "GOOGLE_ADS") Object.assign(settings, parseConversionMap(conversionMap));
      if (provider === "META_ADS") {
        for (const key of META_ADMIN_KEYS) {
          const value = metaAdmin[key].trim();
          if (value) settings[key] = key === "metaPixelId" ? value : value.toUpperCase();
        }
      }
      // An id the sheet is only *showing* from env stays env-sourced: saving it unchanged must not freeze it into the row.
      const envBacked = row?.accountRefSource === "ENV" && accountRef.trim() === (row?.accountRef ?? "");
      const res = await fetch(`/api/admin/marketing-ai/connections/${provider}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountRef: envBacked ? null : accountRef.trim() || null, accountLabel: accountLabel.trim() || null, settings }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Save nahi hua", description: json.message, tone: "error" });
        return;
      }
      toast({ title: `${meta!.label} settings save ho gayi`, tone: "success" });
      onChanged();
    } catch {
      toast({ title: "Network error — dobara try karein", tone: "error" });
    } finally {
      setBusy(null);
    }
  }

  async function saveSecret() {
    if (!meta?.credential || !secret.trim()) return;
    setBusy("secret");
    try {
      const res = await fetch(`/api/admin/provider-keys/${meta.credential}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: secret.trim() }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Token save nahi hua", description: json.message, tone: "error" });
        return;
      }
      // Cleared immediately — the token has no business in React state after it has been stored.
      setSecret("");
      toast({ title: "Token save ho gaya", description: "Ab 'Test' se check kar lein.", tone: "success" });
      onChanged();
    } catch {
      toast({ title: "Network error — dobara try karein", tone: "error" });
    } finally {
      setBusy(null);
    }
  }

  async function runTest() {
    setBusy("test");
    setTest(null);
    try {
      const res = await fetch(`/api/admin/marketing-ai/connections/${provider}/test`, { method: "POST" });
      const json = await res.json();
      setTest({ ok: Boolean(json.ok), message: json.message ?? "" });
      onChanged();
    } catch {
      setTest({ ok: false, message: "Network error — dobara try karein." });
    } finally {
      setBusy(null);
    }
  }

  /** Doc 14 §9 — read-only Graph calls; nothing is created, activated or changed on Meta. */
  async function runReadiness() {
    setBusy("readiness");
    setReadiness(null);
    try {
      const res = await fetch("/api/admin/marketing-ai/connections/META_ADS/readiness", { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Readiness check nahi chala", description: json.message, tone: "error" });
        return;
      }
      setReadiness(json.report as MetaReadinessReport);
      onChanged();
    } catch {
      toast({ title: "Network error — dobara try karein", tone: "error" });
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    setBusy("disconnect");
    try {
      const res = await fetch(`/api/admin/marketing-ai/connections/${provider}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Disconnect nahi hua", description: json.message, tone: "error" });
        return;
      }
      setConfirmDisconnect(false);
      toast({ title: `${meta!.label} disconnect ho gaya`, tone: "success" });
      onChanged();
    } finally {
      setBusy(null);
    }
  }

  const isGoogle = meta.auth === "google-oauth";
  const isMeta = meta.auth === "meta-token";
  const envName = META_ENV_NAME[provider];
  const metaAdminChanged = provider === "META_ADS" && META_ADMIN_KEYS.some((k) => metaAdmin[k].trim() !== (row.settings[k] ?? ""));
  const canSave =
    accountRef.trim() !== (row.accountRef ?? "") ||
    accountLabel.trim() !== (row.accountLabel ?? "") ||
    loginCustomerId.trim() !== (row.settings.loginCustomerId ?? "") ||
    conversionMap.trim() !== conversionMapText(row.settings) ||
    metaAdminChanged;

  return (
    <Sheet open={true} onClose={onClose} variant="side" title={meta.label} description={meta.blurb}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={HEALTH_TONE[row.health]} size="sm">
            {CONNECTION_HEALTH_LABEL[row.health]}
          </Pill>
          {row.lastSyncAt && <span className="text-xs text-muted">last read {new Date(row.lastSyncAt).toLocaleString("en-IN")}</span>}
        </div>
        {row.todo && (
          <p className="flex items-start gap-2 rounded-md border border-warn/30 bg-warn-bg p-3 text-[0.8125rem] text-ink">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
            {row.todo}
          </p>
        )}

        {meta.auth === "not-available" && (
          <p className="text-sm text-muted">Video rendering provider adapter Phase MKT-3 me aayega. Tab tak har Reel/Story concept script, storyboard aur caption ke roop me package me hota hai.</p>
        )}

        {isGoogle && (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-ink">1. Google authorisation</h3>
            <p className="text-xs text-muted">
              Sirf is provider ka scope maanga jaata hai: <code className="text-[0.7rem]">{meta.scopes.join(" ")}</code>. Refresh token encrypted store hota hai.
            </p>
            {!googleOAuthConfigured && <p className="text-xs text-danger">GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET env me set nahi hain.</p>}
            {!encryptionConfigured && <p className="text-xs text-danger">SECRETS_ENCRYPTION_KEY set nahi hai — grant store nahi ho sakta.</p>}
            <div className="flex flex-wrap gap-2">
              <a
                href={`/api/admin/marketing-ai/connections/google/start?provider=${provider}`}
                className={
                  "inline-flex h-10 items-center gap-2 rounded-full border border-line-strong bg-surface px-4 text-sm font-semibold text-ink shadow-xs hover:border-gold-500" +
                  (!googleOAuthConfigured || !encryptionConfigured ? " pointer-events-none opacity-45" : "")
                }
              >
                <ExternalLink className="size-4" aria-hidden />
                {row.grantedAt ? "Re-connect with Google" : "Connect with Google"}
              </a>
              {row.grantedAt && (
                <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => setConfirmDisconnect(true)}>
                  Disconnect
                </Button>
              )}
            </div>
            {row.grantedAt && <p className="text-xs text-subtle">Authorised {new Date(row.grantedAt).toLocaleString("en-IN")}</p>}
          </section>
        )}

        {meta.credential && (
          <section className="space-y-2">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
              <KeyRound className="size-4 text-gold-600" aria-hidden />
              {isGoogle ? "2. Developer token (legacy, optional)" : "1. Meta access token"}
            </h3>
            <p className="text-xs text-muted">
              {isMeta
                ? "Business Manager → System users → ek token: padhne ke liye ads_read, pages_read_engagement, pages_show_list, instagram_basic, instagram_manage_insights; paused campaign create ke liye ads_management bhi. Ek hi token teeno Meta connections ke liye. Scope ke alawa system user ko ad account, Page aur Instagram 'Assign assets' se dene hote hain — Meta Ads sheet ka readiness check dono alag dikhata hai."
                : "Google ne 9 Sept 2026 ko developer token sunset kar diya — API access level ab Google Cloud project par hai (Cloud Console → Google Ads API → Overview). Purane setup ka token ho to paste karein, warna khaali chhodein. Token kabhi wapas screen par nahi aata."}
              {row.credentialHint && (
                <>
                  {" "}
                  Abhi: <span className="font-mono">{row.credentialHint}</span>
                </>
              )}
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
              <Input
                type="password"
                autoComplete="off"
                inputSize="sm"
                placeholder={row.credentialSet ? "Naye token se badalne ke liye paste karein" : "Token paste karein"}
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                disabled={!encryptionConfigured}
              />
              <Button size="sm" variant="secondary" disabled={!secret.trim() || busy !== null || !encryptionConfigured} loading={busy === "secret"} onClick={saveSecret}>
                Save Token
              </Button>
            </div>
            {!encryptionConfigured && <p className="text-xs text-danger">SECRETS_ENCRYPTION_KEY set nahi hai — token store nahi ho sakta.</p>}
          </section>
        )}

        {meta.auth !== "not-available" && (
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-ink">{isGoogle ? (meta.credential ? "3." : "2.") : "2."} Account</h3>
            <Field label={meta.accountRefLabel} hint={meta.accountRefHint}>
              <Input inputSize="sm" value={accountRef} onChange={(e) => setAccountRef(e.target.value)} placeholder={meta.accountRefLabel} />
            </Field>
            {isMeta && row.accountRefSource === "ENV" && envName && (
              <p className="text-xs text-muted">
                Ye value env se aa rahi hai (<code className="text-[0.7rem]">{envName}</code>). Isi value ke saath Save karne par bhi env hi source rahega; alag value daalenge to page ki value env ko override karegi.
              </p>
            )}
            {provider === "INSTAGRAM" && <p className="text-xs text-muted">Wahi Instagram Professional account jo BandhanTak Facebook Page se linked hai. Meta Ads sheet ka readiness check Page ke linked accounts ke IDs dikhata hai.</p>}
            {provider === "GOOGLE_ADS" && (
              <Field label="Login customer ID (manager account)" hint="Sirf tab jab account MCC ke through access hota hai. Warna khaali.">
                <Input inputSize="sm" value={loginCustomerId} onChange={(e) => setLoginCustomerId(e.target.value)} placeholder="1234567890" />
              </Field>
            )}
            {provider === "GOOGLE_ADS" && (
              <Field
                label="Conversion action mapping"
                optional
                hint="MKT-2 paused-create ke liye. Ek line me ek: event=customers/123/conversionActions/456. Khaali ho to account me exact naam se match hoga (jaise 'verification_completed'); na mile to deployment 'Configuration needed' par rukta hai — kabhi guess nahi."
              >
                <Textarea value={conversionMap} onChange={(e) => setConversionMap(e.target.value)} rows={3} placeholder={"verification_completed=customers/1234567890/conversionActions/111\nregistration_completed=customers/1234567890/conversionActions/222"} />
              </Field>
            )}
            {provider === "GOOGLE_ADS" && row.settings.currency && (
              <p className="text-xs text-muted">
                Account facts (last test): {row.settings.currency} · {row.settings.timeZone ?? "—"}
                {row.settings.isManager === "true" ? " · manager account (campaign nahi ban sakta)" : ""}
                {row.settings.isTestAccount === "true" ? " · TEST account" : ""}
              </p>
            )}
            {provider === "META_ADS" && (
              <>
                <Field
                  label="Special ad categories"
                  hint="Policy review ke baad aap khud likhein — NONE bhi ek jawab hai. Allowed: NONE, HOUSING, EMPLOYMENT, CREDIT, ISSUES_ELECTIONS_POLITICS, FINANCIAL_PRODUCTS_SERVICES (comma se alag). Khaali ho to Meta create 'Configuration needed' par rukta hai — AI kabhi guess nahi karta."
                >
                  <Input inputSize="sm" value={metaAdmin.specialAdCategories} onChange={(e) => setMetaAdmin((s) => ({ ...s, specialAdCategories: e.target.value }))} placeholder="NONE" />
                </Field>
                <Field label="Special ad category country" optional hint="Sirf jab category NONE nahi hai — 2 letter, jaise IN.">
                  <Input inputSize="sm" value={metaAdmin.specialAdCategoryCountry} onChange={(e) => setMetaAdmin((s) => ({ ...s, specialAdCategoryCountry: e.target.value }))} placeholder="IN" />
                </Field>
                <Field label="Meta Pixel ID" optional hint="Sirf OUTCOME_LEADS / OUTCOME_SALES ke liye. Traffic objective ko nahi chahiye — aur bina Pixel ke LEADS/SALES package kabhi chup-chaap TRAFFIC nahi banta.">
                  <Input inputSize="sm" value={metaAdmin.metaPixelId} onChange={(e) => setMetaAdmin((s) => ({ ...s, metaPixelId: e.target.value }))} placeholder="123456789012345" />
                </Field>
                <Field label="Pixel conversion event" optional hint="Pixel ID ke saath hi — jaise COMPLETE_REGISTRATION.">
                  <Input inputSize="sm" value={metaAdmin.metaConversionEvent} onChange={(e) => setMetaAdmin((s) => ({ ...s, metaConversionEvent: e.target.value }))} placeholder="COMPLETE_REGISTRATION" />
                </Field>
              </>
            )}
            <Field label="Label" optional hint="Apne liye — jaise 'BandhanTak main'">
              <Input inputSize="sm" value={accountLabel} onChange={(e) => setAccountLabel(e.target.value)} />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" disabled={!canSave || busy !== null} loading={busy === "save"} onClick={saveSettings}>
                Save
              </Button>
              <Button size="sm" variant="ghost" disabled={busy !== null} loading={busy === "test"} onClick={runTest}>
                Test connection
              </Button>
            </div>
            {test && (
              <p className={`flex items-start gap-1.5 text-[0.8125rem] ${test.ok ? "text-trust" : "text-danger"}`} role="status">
                {test.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden /> : <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden />}
                {test.message}
              </p>
            )}
            {row.lastError && !test && <p className="text-xs text-danger">Aakhri error: {row.lastError}</p>}
          </section>
        )}

        {provider === "META_ADS" && (
          <section className="space-y-2">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
              <ShieldCheck className="size-4 text-trust" aria-hidden />
              3. Ad creation readiness
            </h3>
            <p className="text-xs text-muted">
              Read-only Graph calls — Meta par kuch create, activate ya change nahi hota. Har cheez alag line: token valid, read/write scope, ad account par system user ka access (asset assignment), account status/currency/timezone, Page aur Instagram link. Token scope READY hone ka matlab ad account access READY nahi.
            </p>
            {!readiness && row.settings.readinessAt && <LastReadiness settings={row.settings} />}
            <Button size="sm" variant="secondary" disabled={busy !== null} loading={busy === "readiness"} onClick={runReadiness} icon={<ShieldCheck className="size-4" />}>
              Check ad creation readiness
            </Button>
            {readiness && <ReadinessReportView report={readiness} />}
          </section>
        )}
      </div>

      <AdminActionConfirmModal
        isOpen={confirmDisconnect}
        onClose={() => setConfirmDisconnect(false)}
        onConfirm={disconnect}
        title={`${meta.label} disconnect karein?`}
        description="Google grant revoke aur delete ho jaayega. Account ID rahega — dobara Connect karke wapas jod sakte hain."
        confirmLabel="Yes, Disconnect"
        variant="danger"
      />
    </Sheet>
  );
}

/** The verdict the last "Check ad creation readiness" stored on the connection — shown until a fresh check replaces it. */
function LastReadiness({ settings }: { settings: Record<string, string> }) {
  const scope = (value: string | undefined) => (value === "true" ? "READY" : value === "false" ? "MISSING" : "—");
  const instagram = settings.igAssigned === "true" ? `READY${settings.igUsername ? ` (@${settings.igUsername})` : ""}` : settings.igAssigned === "none" ? "set nahi" : "MISSING";
  return (
    <div className="rounded-md bg-bg-subtle/60 p-2 text-xs text-ink">
      <p>
        <span className="font-semibold">Last check {new Date(settings.readinessAt).toLocaleString("en-IN")}:</span> token scope — read {scope(settings.readReady)}, write {scope(settings.writeReady)} · ad account access {settings.accountAccess || "—"}
        {settings.currency ? ` · ${settings.currency} · ${settings.timeZone ?? "—"} · account_status ${settings.accountStatus || "—"}` : " · account facts nahi padhe gaye"} · Page {settings.pageAssigned === "true" ? "READY" : "MISSING"} · Instagram {instagram}
      </p>
      {settings.readinessCode ? (
        <p className="mt-1 text-danger">
          {settings.readinessCode}: {settings.readinessMessage}
        </p>
      ) : (
        <p className="mt-1 text-trust">Us waqt sab required checks READY the.</p>
      )}
    </div>
  );
}

function ReadinessReportView({ report }: { report: MetaReadinessReport }) {
  return (
    <div className="space-y-1.5" role="status">
      <p className={`flex items-start gap-1.5 text-[0.8125rem] ${report.ok ? "text-trust" : "text-danger"}`}>
        {report.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden /> : <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden />}
        {report.message}
      </p>
      <ul className="space-y-1">
        {report.checks.map((c) => (
          <li key={c.key} className="rounded-sm bg-bg-subtle/60 p-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone={READINESS_TONE[c.state]} size="sm">
                {c.state}
              </Pill>
              <span className="font-semibold text-ink">{c.label}</span>
              {c.reconnect && c.state !== "READY" && (
                <Pill tone="danger" size="sm">
                  new token needed
                </Pill>
              )}
            </div>
            {c.detail && <p className="mt-1 break-words text-muted">{c.detail}</p>}
            {c.fix && c.state !== "READY" && (
              <p className="mt-1 text-ink">
                <span className="font-semibold">Kya karein: </span>
                {c.fix}
              </p>
            )}
          </li>
        ))}
      </ul>
      <p className="text-[0.6875rem] text-subtle">
        checked {new Date(report.checkedAt).toLocaleString("en-IN")} · Graph {report.apiVersion}
      </p>
    </div>
  );
}
