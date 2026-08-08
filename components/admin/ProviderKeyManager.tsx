"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, KeyRound, ShieldAlert, XCircle } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Pill from "@/components/ui/Pill";
import { useToast } from "@/components/ui/Toast";
import AdminActionConfirmModal from "@/components/admin/AdminActionConfirmModal";

export type ProviderKeyRow = {
  provider: string;
  label: string;
  envVar: string;
  blurb: string;
  source: "DB" | "ENV" | "NONE";
  maskedHint: string | null;
  updatedAt: string | null;
};

type TestState = { ok: boolean; message: string } | null;

const SOURCE_PILL: Record<ProviderKeyRow["source"], { tone: "trust" | "gold" | "neutral"; label: string }> = {
  DB: { tone: "trust", label: "Yahan se set hai" },
  ENV: { tone: "gold", label: "Env var se" },
  NONE: { tone: "neutral", label: "Set nahi hai" },
};

/**
 * API keys, set from the panel instead of a redeploy.
 *
 * The one hard rule this UI keeps: **a stored key never comes back to the
 * browser.** The server sends only a `••••1234` hint and which source is
 * winning, so there is no state here that a screenshot or a screenshare could
 * leak. "Is it the right key" is answered by the Test button hitting the
 * provider, not by showing the value.
 */
export default function ProviderKeyManager({
  rows,
  encryptionConfigured,
}: {
  rows: ProviderKeyRow[];
  encryptionConfigured: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [tests, setTests] = useState<Record<string, TestState>>({});
  const [pendingClear, setPendingClear] = useState<ProviderKeyRow | null>(null);

  async function save(row: ProviderKeyRow) {
    const apiKey = (drafts[row.provider] ?? "").trim();
    if (!apiKey) return;
    setBusy(row.provider);
    try {
      const res = await fetch(`/api/admin/provider-keys/${row.provider}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Save fail hua", description: json.message, tone: "error" });
        return;
      }
      // Cleared immediately: the key has no business sitting in React state
      // after it has been stored.
      setDrafts((d) => ({ ...d, [row.provider]: "" }));
      setTests((t) => ({ ...t, [row.provider]: null }));
      toast({ title: `${row.label} ki key save ho gayi`, description: "Ab 'Test' se check kar lein.", tone: "success" });
      router.refresh();
    } catch {
      toast({ title: "Network error — dobara try karein", tone: "error" });
    } finally {
      setBusy(null);
    }
  }

  async function runTest(row: ProviderKeyRow) {
    setBusy(row.provider);
    setTests((t) => ({ ...t, [row.provider]: null }));
    try {
      const res = await fetch(`/api/admin/provider-keys/${row.provider}/test`, { method: "POST" });
      const json = await res.json();
      setTests((t) => ({ ...t, [row.provider]: { ok: Boolean(json.ok), message: json.message ?? "" } }));
    } catch {
      setTests((t) => ({ ...t, [row.provider]: { ok: false, message: "Network error — dobara try karein." } }));
    } finally {
      setBusy(null);
    }
  }

  async function confirmClear() {
    if (!pendingClear) return;
    const row = pendingClear;
    setBusy(row.provider);
    try {
      const res = await fetch(`/api/admin/provider-keys/${row.provider}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Hataya nahi ja saka", description: json.message, tone: "error" });
        return;
      }
      setPendingClear(null);
      setTests((t) => ({ ...t, [row.provider]: null }));
      toast({ title: `${row.label} ki stored key hata di`, tone: "success" });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {!encryptionConfigured && (
        <Card variant="soft" padding="md" className="border border-warn/40">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warn" aria-hidden />
            <div>
              <p className="text-sm font-semibold text-ink">SECRETS_ENCRYPTION_KEY set nahi hai</p>
              <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted">
                Key ko encrypt kiye bina store nahi kiya jaayega, isliye save abhi band hai. Deployment ke env me ye
                variable daalein — dekhein <code className="text-[0.75rem]">.env.example</code>. Tab tak env var wali
                keys jaise chal rahi hain waise hi chalti rahengi.
              </p>
            </div>
          </div>
        </Card>
      )}

      {rows.map((row) => {
        const draft = drafts[row.provider] ?? "";
        const test = tests[row.provider];
        const isBusy = busy === row.provider;
        const pill = SOURCE_PILL[row.source];

        return (
          <Card key={row.provider} variant="soft" padding="md">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-ink">{row.label}</h3>
                  <Pill tone={pill.tone} size="sm">
                    {pill.label}
                  </Pill>
                  {row.maskedHint && (
                    <span className="font-mono text-[0.75rem] text-muted">{row.maskedHint}</span>
                  )}
                </div>
                <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted">{row.blurb}</p>
                <p className="mt-1 text-xs text-subtle">
                  Fallback env var: <code>{row.envVar}</code>
                  {row.updatedAt && ` · ${new Date(row.updatedAt).toLocaleDateString("en-IN")} ko update hui`}
                </p>
              </div>
              <KeyRound className="size-5 shrink-0 text-gold-600" aria-hidden />
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
              <Input
                type="password"
                autoComplete="off"
                inputSize="sm"
                placeholder={row.source === "NONE" ? "Nayi key paste karein" : "Nayi key se badalne ke liye paste karein"}
                value={draft}
                onChange={(e) => setDrafts((d) => ({ ...d, [row.provider]: e.target.value }))}
              />
              <Button
                size="sm"
                variant="secondary"
                disabled={!draft.trim() || isBusy || !encryptionConfigured}
                onClick={() => save(row)}
              >
                Save Key
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={isBusy || row.source === "NONE"}
                onClick={() => runTest(row)}
              >
                Test
              </Button>
            </div>

            {test && (
              <p
                className={`mt-2 flex items-start gap-1.5 text-[0.8125rem] ${test.ok ? "text-trust" : "text-danger"}`}
                role="status"
              >
                {test.ok ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
                ) : (
                  <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                )}
                {test.message}
              </p>
            )}

            {row.source === "DB" && (
              <button
                type="button"
                onClick={() => setPendingClear(row)}
                disabled={isBusy}
                className="mt-2 min-h-11 text-[0.8125rem] font-medium text-muted underline underline-offset-2 hover:text-danger disabled:opacity-50"
              >
                Stored key hatayein
              </button>
            )}
          </Card>
        );
      })}

      <AdminActionConfirmModal
        isOpen={pendingClear !== null}
        onClose={() => setPendingClear(null)}
        onConfirm={confirmClear}
        title={pendingClear ? `${pendingClear.label} ki key hatayein?` : ""}
        description="Stored key delete ho jaayegi. Env var set hai to wo phir se chalne lagega — warna is provider ke saare feature band ho jaayenge."
        details={
          pendingClear
            ? [
                { label: "Provider", value: pendingClear.label },
                { label: "Abhi", value: pendingClear.maskedHint ?? "—" },
                { label: "Env fallback", value: pendingClear.envVar },
              ]
            : []
        }
        confirmLabel="Yes, Remove"
      />
    </div>
  );
}
