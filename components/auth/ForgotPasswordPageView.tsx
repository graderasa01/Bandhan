"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * The form behind login's "Forgot password?" link — which pointed at `href="#"`
 * and did nothing at all until this existed.
 *
 * Submitting always shows the same confirmation, whether or not the mobile/
 * email matched an account. See `requestPasswordReset` for why: a different
 * message for "no such account" is exactly the oracle an attacker probing
 * addresses is looking for.
 */
export default function ForgotPasswordPageView() {
  const t = useT();
  const [mobileOrEmail, setMobileOrEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch("/api/auth/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile_or_email: mobileOrEmail }),
      });
      // Shown regardless of the response — the API never distinguishes
      // "found" from "not found" either, so there is nothing else to branch on.
      setSent(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-[28rem] px-4 py-16">
      <Card padding="lg">
        {sent ? (
          <div className="text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-full bg-trust-bg text-trust">
              <MailCheck className="size-6" />
            </span>
            <h1 className="mt-4 text-xl font-bold text-wine-700">
              {t("forgotPassword.sentTitle", "Email check kijiye")}
            </h1>
            <p className="mt-2 text-sm text-muted">
              {t(
                "forgotPassword.sentBody",
                "Agar ye mobile ya email kisi account se juda hai, hamne usi email par ek reset link bhej diya hai. Link 30 minute me expire ho jayega.",
              )}
            </p>
            <Link href="/login" className="mt-6 inline-block text-sm font-medium text-gold-700">
              {t("forgotPassword.backToLogin", "Login par wapas jaayein")}
            </Link>
          </div>
        ) : (
          <>
            <h1 className="text-center text-2xl font-bold text-wine-700">
              {t("forgotPassword.title", "Password Bhool Gaye?")}
            </h1>
            <p className="mt-2 text-center text-sm text-muted">
              {t(
                "forgotPassword.subtitle",
                "Apna mobile ya email daaliye — agar account me email hai, wahan reset link bhej denge.",
              )}
            </p>

            <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
              <Input
                label={t("forgotPassword.field.mobileOrEmail", "Mobile ya Email")}
                name="mobile_or_email"
                autoComplete="username"
                value={mobileOrEmail}
                onChange={(e) => setMobileOrEmail(e.target.value)}
                required
              />
              <Button type="submit" fullWidth loading={loading}>
                {t("forgotPassword.submit", "Reset Link Bhejein")}
              </Button>
            </form>

            <div className="mt-4 text-center">
              <Link href="/login" className="text-sm text-gold-700">
                {t("forgotPassword.backToLogin", "Login par wapas jaayein")}
              </Link>
            </div>
          </>
        )}
      </Card>
    </main>
  );
}
