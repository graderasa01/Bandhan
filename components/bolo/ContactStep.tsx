"use client";

import { useEffect, useRef } from "react";
import { CheckCircle2, KeyRound, MessageSquareText, ShieldCheck } from "lucide-react";
import type { FillingFor } from "@/lib/contracts/interview";
import { PASSWORD_MIN_LENGTH, isAcceptablePassword } from "@/lib/auth/passwordPolicy";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import PasswordInput from "@/components/auth/PasswordInput";
import { useT } from "@/components/i18n/LanguageProvider";

export type OtpPhase = "enter" | "sent" | "skipped" | "verified";

export interface OtpState {
  phase: OtpPhase;
  masked: string | null;
  existingUser: boolean;
  error: string | null;
  /** Seconds until "resend" is allowed again. */
  cooldown: number;
}

/**
 * The only form on the page: where the account gets its number.
 *
 * It sits *after* the profile, on purpose — by now the visitor has watched
 * their answers fill a card and has something to lose by leaving, which is
 * the moment a phone number is a fair ask. Grio drives the same step by
 * voice through `request_otp`/`verify_otp`; the inputs here are for the
 * digits people would rather type, and the one-time code auto-fills from the
 * SMS on Android via the WebOTP API so most never type it at all.
 *
 * ## When no code can reach the contact
 *
 * The contact's own channel decides, not "is any OTP configured": a deployment
 * can send email codes and have no SMS provider, and then a mobile number gets
 * no code at all. Rather than a Send OTP button that can only come back
 * "unavailable", that contact goes straight to a password field — the
 * person's own, and required, because an account with neither a code nor a
 * password to log in by is locked out the day its session ends (the server
 * refuses one too; see `completeService`). A contact a code *can* reach keeps
 * the code and is never asked for a password here — the done screen offers one.
 */
export default function ContactStep({
  fillingFor,
  contact,
  onContactChange,
  accountName,
  onAccountNameChange,
  code,
  onCodeChange,
  password,
  onPasswordChange,
  complete,
  otp,
  busy,
  channels,
  onSend,
  onVerify,
  onFinishWithoutOtp,
}: {
  fillingFor: FillingFor | null;
  contact: string;
  onContactChange: (v: string) => void;
  accountName: string;
  onAccountNameChange: (v: string) => void;
  code: string;
  onCodeChange: (v: string) => void;
  /** The account's own password, for a contact no code can reach. */
  password: string;
  onPasswordChange: (v: string) => void;
  /** All eight minimum fields are in — the button says "live", not "save draft". */
  complete: boolean;
  otp: OtpState;
  busy: boolean;
  channels: { mobile: boolean; email: boolean };
  onSend: () => void;
  onVerify: (code: string) => void;
  onFinishWithoutOtp: () => void;
}) {
  const t = useT();
  const forChild = fillingFor === "son" || fillingFor === "daughter";
  const isEmail = contact.includes("@");
  const codeCanReach = isEmail ? channels.email : channels.mobile;
  const needsPassword = otp.phase === "skipped" || (otp.phase === "enter" && !codeCanReach);
  const codeRef = useRef<HTMLInputElement>(null);
  const verifyRef = useRef(onVerify);
  verifyRef.current = onVerify;

  // WebOTP: on Android Chrome the browser offers the incoming SMS code and,
  // once the visitor taps it, the field fills and verifies itself. Elsewhere
  // this silently does nothing and the input works as usual.
  useEffect(() => {
    if (otp.phase !== "sent" || contact.includes("@")) return;
    if (typeof navigator === "undefined" || !("credentials" in navigator) || !("OTPCredential" in window)) return;
    const controller = new AbortController();
    navigator.credentials
      .get({ otp: { transport: ["sms"] }, signal: controller.signal } as CredentialRequestOptions)
      .then((credential) => {
        const received = (credential as { code?: string } | null)?.code;
        if (received && /^\d{6}$/.test(received)) {
          onCodeChange(received);
          verifyRef.current(received);
        }
      })
      .catch(() => {});
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp.phase, contact]);

  useEffect(() => {
    if (otp.phase === "sent") codeRef.current?.focus();
  }, [otp.phase]);

  if (otp.phase === "verified") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-trust/30 bg-trust-bg px-4 py-3 text-sm text-trust">
        <CheckCircle2 className="size-5 shrink-0" />
        <span>
          {otp.masked} — {t("bolo.contact.verified", "confirm ho gaya")}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {forChild && (
        <Input
          label={t("bolo.contact.accountName", "Aapka apna naam")}
          value={accountName}
          onChange={(e) => onAccountNameChange(e.target.value)}
          autoComplete="name"
          placeholder={t("bolo.contact.accountNamePlaceholder", "Jaise: Sunita Sharma")}
          disabled={otp.phase === "sent"}
        />
      )}

      <Input
        label={t("bolo.contact.label", "Mobile number ya email")}
        value={contact}
        onChange={(e) => onContactChange(e.target.value)}
        inputMode="tel"
        autoComplete={needsPassword ? "username" : "tel"}
        placeholder="98765 43210"
        helperText={
          codeCanReach
            ? t("bolo.contact.help", "Yehi aapki login ID hai — OTP isi par aayega.")
            : t("bolo.contact.helpNoOtp", "Yehi aapki login ID hai.")
        }
        disabled={otp.phase === "sent"}
        error={otp.phase === "enter" ? (otp.error ?? undefined) : undefined}
      />

      {otp.phase === "enter" && codeCanReach && (
        <Button type="button" variant="accent" fullWidth loading={busy} onClick={onSend}>
          <MessageSquareText className="size-4" />
          {t("bolo.contact.sendOtp", "Send OTP")}
        </Button>
      )}

      {needsPassword && (
        <div className="space-y-3">
          <p className="flex items-start gap-2 rounded-lg border border-line bg-bg-subtle px-3 py-2 text-xs leading-relaxed text-muted">
            <KeyRound className="mt-0.5 size-4 shrink-0 text-primary-text" />
            <span>
              {isEmail
                ? t(
                    "bolo.contact.passwordNeededEmail",
                    "Is email par abhi OTP nahi ja sakta — isliye apna ek password bana lijiye. Isi email aur password se login karenge.",
                  )
                : t(
                    "bolo.contact.passwordNeeded",
                    "Is number par abhi OTP nahi ja sakta — isliye apna ek password bana lijiye. Isi number aur password se login karenge.",
                  )}
            </span>
          </p>
          <PasswordInput
            label={t("bolo.password.label", "Apna password")}
            name="new-password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            helperText={`${t("bolo.password.helpPrefix", "Kam se kam")} ${PASSWORD_MIN_LENGTH} ${t("bolo.password.helpSuffix", "characters. Kisi ko na batayein — Grio ko bhi nahi.")}`}
          />
          <Button
            type="button"
            variant="accent"
            fullWidth
            loading={busy}
            disabled={!contact.trim() || !isAcceptablePassword(password)}
            onClick={onFinishWithoutOtp}
          >
            <ShieldCheck className="size-4" />
            {complete ? t("bolo.contact.goLive", "Make Profile Live") : t("bolo.contact.saveDraft", "Save Draft & Continue")}
          </Button>
        </div>
      )}

      {otp.phase === "sent" && (
        <div className="space-y-3 rounded-xl border border-line bg-bg-subtle p-4">
          <p className="text-sm text-ink">
            {t("bolo.contact.codeSentTo", "Code bheja gaya:")} <span className="font-semibold">{otp.masked}</span>
          </p>
          {otp.existingUser && (
            <p className="text-xs text-muted">
              {t("bolo.contact.existing", "Is number se account pehle se hai — code daalte hi usi me login ho jayega.")}
            </p>
          )}
          <Input
            ref={codeRef}
            label={t("bolo.contact.code", "6-digit OTP")}
            value={code}
            onChange={(e) => onCodeChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            placeholder="••••••"
            error={otp.error ?? undefined}
            onKeyDown={(e) => {
              if (e.key === "Enter" && code.length === 6) onVerify(code);
            }}
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" variant="accent" fullWidth loading={busy} disabled={code.length !== 6} onClick={() => onVerify(code)}>
              {t("bolo.contact.verify", "Verify & Go Live")}
            </Button>
            <Button type="button" variant="ghost" fullWidth disabled={busy || otp.cooldown > 0} onClick={onSend}>
              {otp.cooldown > 0
                ? `${t("bolo.contact.resendIn", "Resend in")} ${otp.cooldown}s`
                : t("bolo.contact.resend", "Resend OTP")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
