"use client";

import { useState, type FormEvent } from "react";
import { KeyRound } from "lucide-react";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { useT } from "@/components/i18n/LanguageProvider";

export default function PasswordSettingsCard({ initialHasPassword }: { initialHasPassword: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [hasPassword, setHasPassword] = useState(initialHasPassword);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    if (newPassword !== confirmPassword) {
      setError(t("passwordSettings.mismatch", "Dono naye password alag hain."));
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ current_password: currentPassword || undefined, new_password: newPassword }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.message ?? t("passwordSettings.failed", "Password badal nahi paaya."));
        return;
      }
      setHasPassword(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSaved(true);
      setOpen(false);
    } catch {
      setError(t("auth.error.network", "Network error — dobara try karein."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card variant="soft" padding="md">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-gold-100 text-gold-700 dark:bg-gold-900/50 dark:text-gold-200">
          <KeyRound className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-ink">{t("passwordSettings.title", "Login password")}</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">
            {t(
              "passwordSettings.subtitle",
              "System ka diya password ho ya aapka apna — yahan se jab chahein badal sakte hain.",
            )}
          </p>
        </div>
      </div>

      {saved && (
        <p className="mt-3 rounded-md bg-trust-bg px-3 py-2 text-xs font-medium text-trust">
          {t("passwordSettings.saved", "Password badal gaya.")}
        </p>
      )}

      {!open ? (
        <div className="mt-4">
          <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(true)}>
            {hasPassword
              ? t("passwordSettings.change", "Password badlein")
              : t("passwordSettings.set", "Password banayein")}
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-4 space-y-3" noValidate>
          {hasPassword && (
            <Input
              label={t("passwordSettings.current", "Purana password")}
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
            />
          )}
          <Input
            label={t("passwordSettings.new", "Naya password")}
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            helperText={t("passwordSettings.help", "Kam se kam 8 characters")}
            required
          />
          <Input
            label={t("passwordSettings.confirm", "Naya password dobara")}
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
          />

          {error && <p className="rounded-md bg-danger-bg px-3 py-2 text-xs text-danger">{error}</p>}

          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" loading={busy}>
              {t("passwordSettings.save", "Save password")}
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
              {t("common.cancel", "Cancel")}
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
