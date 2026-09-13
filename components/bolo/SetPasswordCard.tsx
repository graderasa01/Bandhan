"use client";

import { CheckCircle2, KeyRound } from "lucide-react";
import { PASSWORD_MIN_LENGTH, isAcceptablePassword } from "@/lib/auth/passwordPolicy";
import Button from "@/components/ui/Button";
import PasswordInput from "@/components/auth/PasswordInput";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * "Apna password banayein" — offered once, right after the profile exists, to
 * an account that has no password.
 *
 * Optional, and it says so: an account that got here with a verified code can
 * always log back in with one. What a password adds is the other door —
 * another phone, a code that does not arrive, a day SMS is down. It is the
 * person's own password, typed here; nothing generates one, and Grio never
 * hears it (the page never forwards this field to the model).
 *
 * Controlled by the page, because the page has to know about a typed-but-
 * unsaved password: a spoken "chalein" must not walk away from it.
 */
export default function SetPasswordCard({
  value,
  onChange,
  saved,
  busy,
  error,
  loginId,
  onSave,
}: {
  value: string;
  onChange: (value: string) => void;
  saved: boolean;
  busy: boolean;
  error: string | null;
  /** The mobile or email this account logs in with, so a password manager files the new password under it. */
  loginId?: string;
  onSave: () => void;
}) {
  const t = useT();

  if (saved) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-trust/30 bg-trust-bg px-4 py-3 text-left text-sm text-trust">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
        <span>{t("bolo.setPassword.saved", "Password ban gaya — ab login ID aur password se bhi login ho sakta hai.")}</span>
      </div>
    );
  }

  const valid = isAcceptablePassword(value);

  return (
    <section className="rounded-2xl border border-line bg-surface p-4 text-left shadow-sm sm:p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-gold-100 text-gold-700 dark:bg-gold-900/50 dark:text-gold-200">
          <KeyRound className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-ink">{t("bolo.setPassword.title", "Apna password banayein")}</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">
            {t(
              "bolo.setPassword.body",
              "OTP ke alawa password se bhi login kar payenge — kisi bhi phone par. Zaroori nahi, par achha rahega.",
            )}
          </p>
        </div>
      </div>

      <form
        className="mt-4 space-y-3"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) onSave();
        }}
      >
        {loginId && (
          <input
            type="text"
            name="username"
            autoComplete="username"
            value={loginId}
            readOnly
            tabIndex={-1}
            aria-hidden="true"
            className="sr-only"
          />
        )}
        <PasswordInput
          label={t("bolo.password.label", "Apna password")}
          name="new-password"
          autoComplete="new-password"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          helperText={`${t("bolo.password.helpPrefix", "Kam se kam")} ${PASSWORD_MIN_LENGTH} ${t("bolo.password.helpSuffix", "characters. Kisi ko na batayein — Grio ko bhi nahi.")}`}
          error={error ?? undefined}
        />
        <Button type="submit" variant="secondary" fullWidth loading={busy} disabled={!valid}>
          {t("bolo.setPassword.save", "Save Password")}
        </Button>
      </form>
    </section>
  );
}
