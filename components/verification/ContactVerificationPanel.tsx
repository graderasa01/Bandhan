"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Mail, Smartphone } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/components/i18n/LanguageProvider";
import { cn } from "@/lib/utils";

type Channel = "PHONE" | "EMAIL";

interface ChannelStatus {
  available: boolean;
  masked: string | null;
  verified: boolean;
  cooldownSecondsRemaining: number;
}

interface StatusResponse {
  ok: boolean;
  status: { phone: ChannelStatus; email: ChannelStatus };
}

/**
 * The reusable phone/email verification UI — one row per channel, each with
 * its own send/resend/confirm flow. Used on `/user/verify-contact` (both
 * channels) and can be dropped anywhere a single-channel CTA is useful.
 *
 * Deliberately reads its own status rather than taking it as a prop: the
 * Trust Score page and the dashboard both want a working "Verify" button
 * without each having to fetch and thread the status themselves.
 */
export default function ContactVerificationPanel({ onVerified }: { onVerified?: () => void }) {
  const t = useT();
  const [status, setStatus] = useState<{ phone: ChannelStatus; email: ChannelStatus } | null>(null);
  const [loading, setLoading] = useState(true);

  async function reload() {
    try {
      const res = await fetch("/api/verify-contact/status");
      const json = (await res.json()) as StatusResponse;
      if (json.ok) setStatus(json.status);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-[0.8125rem] text-muted">
        <Loader2 className="size-3.5 animate-spin" />
        {t("verifyContact.loading", "Load ho raha hai...")}
      </div>
    );
  }
  if (!status) return null;

  return (
    <div className="space-y-3">
      <ChannelRow
        channel="PHONE"
        icon={Smartphone}
        title={t("verifyContact.phoneTitle", "Mobile Number")}
        status={status.phone}
        onChanged={() => {
          reload();
          onVerified?.();
        }}
      />
      <ChannelRow
        channel="EMAIL"
        icon={Mail}
        title={t("verifyContact.emailTitle", "Email")}
        status={status.email}
        onChanged={() => {
          reload();
          onVerified?.();
        }}
      />
    </div>
  );
}

function ChannelRow({
  channel,
  icon: Icon,
  title,
  status,
  onChanged,
}: {
  channel: Channel;
  icon: typeof Smartphone;
  title: string;
  status: ChannelStatus;
  onChanged: () => void;
}) {
  const t = useT();
  const { toast } = useToast();
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(status.cooldownSecondsRemaining);

  useEffect(() => {
    setCooldown(status.cooldownSecondsRemaining);
    if (status.cooldownSecondsRemaining > 0) setSent(true);
  }, [status.cooldownSecondsRemaining]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  async function send() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/verify-contact/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.message ?? t("verifyContact.errorGeneric", "Code nahi bheja ja saka."));
        if (typeof json.retryAfterSeconds === "number") setCooldown(json.retryAfterSeconds);
        return;
      }
      setSent(true);
      setCooldown(60);
      toast({
        title: t("verifyContact.codeSent", "Code bhej diya gaya"),
        tone: "success",
      });
    } catch {
      setError(t("verifyContact.errorNetwork", "Network error — dobara try karein."));
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (code.trim().length < 4) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/verify-contact/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, code: code.trim() }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.message ?? t("verifyContact.errorGeneric", "Code sahi nahi hai."));
        return;
      }
      setCode("");
      toast({ title: t("verifyContact.verified", "Verify ho gaya"), tone: "success" });
      onChanged();
    } catch {
      setError(t("verifyContact.errorNetwork", "Network error — dobara try karein."));
    } finally {
      setBusy(false);
    }
  }

  if (!status.available) {
    return (
      <div className="flex items-center gap-3 rounded-md border border-line px-3.5 py-3 opacity-70">
        <Icon className="size-4 shrink-0 text-subtle" />
        <p className="text-[0.8125rem] text-muted">
          {title} — {t("verifyContact.notOnAccount", "aapke account me nahi hai.")}
        </p>
      </div>
    );
  }

  if (status.verified) {
    return (
      <div className="flex items-center gap-3 rounded-md border border-trust/30 bg-trust-bg px-3.5 py-3">
        <CheckCircle2 className="size-4 shrink-0 text-trust" />
        <div className="min-w-0">
          <p className="text-[0.8125rem] font-medium text-ink">{title}</p>
          <p className="text-[0.75rem] text-muted">{status.masked} — {t("verifyContact.verifiedLabel", "verified")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-line px-3.5 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="size-4 shrink-0 text-subtle" />
          <div className="min-w-0">
            <p className="text-[0.8125rem] font-medium text-ink">{title}</p>
            <p className="truncate text-[0.75rem] text-muted">{status.masked}</p>
          </div>
        </div>
        {!sent && (
          <button
            type="button"
            onClick={send}
            disabled={busy}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 text-[0.8125rem] font-semibold text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-60"
          >
            {busy && <Loader2 className="size-3.5 animate-spin" />}
            {t("verifyContact.sendCode", "Send Code")}
          </button>
        )}
      </div>

      {sent && (
        <div className="mt-3 space-y-2 border-t border-line pt-3">
          <div className="flex items-center gap-2">
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="••••••"
              className="h-10 w-28 rounded-md border border-line-strong bg-surface px-3 text-center text-base tracking-[0.3em] text-ink outline-none focus:border-gold-500"
            />
            <button
              type="button"
              onClick={confirm}
              disabled={busy || code.trim().length < 4}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-[0.8125rem] font-semibold text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-60"
            >
              {busy && <Loader2 className="size-3.5 animate-spin" />}
              {t("verifyContact.verify", "Verify")}
            </button>
            <button
              type="button"
              onClick={send}
              disabled={busy || cooldown > 0}
              className={cn(
                "h-9 whitespace-nowrap rounded-full px-3 text-[0.75rem] font-medium transition-colors",
                cooldown > 0 ? "text-subtle" : "text-accent-text hover:bg-bg-subtle",
              )}
            >
              {cooldown > 0
                ? `${t("verifyContact.resendIn", "Resend in")} ${cooldown}s`
                : t("verifyContact.resend", "Resend")}
            </button>
          </div>
          {error && (
            <p className="text-[0.75rem] leading-snug text-danger" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
