"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mic } from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * "OTP se login" — mobile or email, a six-digit code, in.
 *
 * Shares `/api/auth/otp/*` with the bolo flow; the only difference is
 * `intent: "login"` on send (no code is spent on a number without an
 * account) and `login: true` on verify (a session is opened instead of a
 * proof being returned). The code auto-fills from the SMS on Android via
 * WebOTP — `autocomplete="one-time-code"` covers iOS.
 */
export default function OtpLoginForm({ next }: { next: string | null }) {
  const t = useT();
  const router = useRouter();
  const [contact, setContact] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState<{ masked: string } | null>(null);
  const [noAccount, setNoAccount] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    if (!sent || contact.includes("@")) return;
    if (typeof navigator === "undefined" || !("credentials" in navigator) || !("OTPCredential" in window)) return;
    const controller = new AbortController();
    navigator.credentials
      .get({ otp: { transport: ["sms"] }, signal: controller.signal } as CredentialRequestOptions)
      .then((credential) => {
        const received = (credential as { code?: string } | null)?.code;
        if (received && /^\d{6}$/.test(received)) {
          setCode(received);
          void verify(received);
        }
      })
      .catch(() => {});
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sent, contact]);

  async function send() {
    setError(null);
    setNoAccount(false);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/otp/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contact, intent: "login" }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        message?: string;
        masked?: string;
        retryAfterSeconds?: number;
      };
      if (body.ok) {
        setSent({ masked: body.masked ?? contact });
        setCode("");
        setCooldown(60);
        window.setTimeout(() => codeRef.current?.focus(), 50);
        return;
      }
      if (body.error === "no_account") {
        setNoAccount(true);
        return;
      }
      if (body.error === "not_configured") {
        setError(t("login.otp.unavailable", "OTP login abhi uplabdh nahi hai — password se login karein."));
        return;
      }
      if (body.retryAfterSeconds) setCooldown(body.retryAfterSeconds);
      setError(body.message ?? t("login.error.failed", "Login nahi ho paya."));
    } catch {
      setError(t("auth.error.network", "Network error — dobara try karein."));
    } finally {
      setLoading(false);
    }
  }

  async function verify(rawCode: string) {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contact, code: rawCode, login: true, next: next ?? undefined }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; loggedIn?: boolean; landing?: string; message?: string };
      if (body.ok && body.loggedIn && body.landing) {
        router.push(body.landing);
        router.refresh();
        return;
      }
      setError(body.message ?? t("login.error.failed", "Login nahi ho paya."));
    } catch {
      setError(t("auth.error.network", "Network error — dobara try karein."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      className="mt-6 space-y-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (sent && code.length === 6) void verify(code);
        else if (!sent) void send();
      }}
    >
      <Input
        label={t("login.otp.contact", "Mobile ya Email")}
        name="contact"
        autoComplete="username"
        inputMode="tel"
        value={contact}
        onChange={(e) => {
          setContact(e.target.value);
          setSent(null);
          setNoAccount(false);
        }}
        helperText={t("login.otp.help", "Password ki zaroorat nahi — code aapke phone ya inbox par aayega.")}
        required
      />

      {noAccount && (
        <div className="rounded-lg border border-gold-300/70 bg-gold-50/70 p-3 text-sm dark:bg-gold-900/20">
          <p className="text-ink">{t("login.otp.noAccount", "Is number se abhi koi account nahi hai.")}</p>
          <Link href="/bolo" className="mt-1 inline-flex items-center gap-1.5 font-semibold text-primary-text underline-offset-4 hover:underline">
            <Mic className="size-4" />
            {t("login.otp.createOne", "Bol kar profile banayein")}
          </Link>
        </div>
      )}

      {sent && (
        <div className="space-y-3 rounded-lg border border-line bg-bg-subtle p-4">
          <p className="text-sm text-ink">
            {t("login.otp.sentTo", "Code bheja gaya:")} <span className="font-semibold">{sent.masked}</span>
          </p>
          <Input
            ref={codeRef}
            label={t("login.otp.code", "6-digit OTP")}
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="••••••"
          />
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {sent ? (
        <div className="flex flex-col gap-2">
          <Button type="submit" fullWidth loading={loading} disabled={code.length !== 6}>
            {t("login.otp.verify", "Log in")}
          </Button>
          <Button type="button" variant="ghost" fullWidth disabled={loading || cooldown > 0} onClick={() => void send()}>
            {cooldown > 0 ? `${t("login.otp.resendIn", "Resend in")} ${cooldown}s` : t("login.otp.resend", "Resend OTP")}
          </Button>
        </div>
      ) : (
        <Button type="submit" fullWidth loading={loading} disabled={!contact.trim()}>
          {t("login.otp.send", "Send OTP")}
        </Button>
      )}
    </form>
  );
}
