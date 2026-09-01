"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * Where the emailed reset link lands. The token is read off
 * `window.location.search` in an effect rather than `useSearchParams()` — same
 * choice `LoginPageView` already made for its own `?next=`/`?error=`, so this
 * page needs no Suspense boundary and stays a plain client component.
 */
export default function ResetPasswordPageView() {
  const t = useT();
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token"));
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError(t("resetPassword.error.mismatch", "Passwords match nahi kar rahe."));
      return;
    }
    if (!token) return;

    setLoading(true);
    try {
      const res = await fetch("/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.message ?? t("resetPassword.error.failed", "Password reset nahi ho paya."));
        return;
      }
      setDone(true);
      setTimeout(() => router.push("/login"), 2500);
    } catch {
      setError(t("auth.error.network", "Network error — dobara try karein."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-[28rem] px-4 py-16">
      <Card padding="lg">
        {done ? (
          <div className="text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-full bg-trust-bg text-trust">
              <CheckCircle2 className="size-6" />
            </span>
            <h1 className="mt-4 text-xl font-bold text-wine-700">
              {t("resetPassword.doneTitle", "Password badal gaya")}
            </h1>
            <p className="mt-2 text-sm text-muted">
              {t("resetPassword.doneBody", "Ab naye password se login kijiye — aapko login par le ja rahe hain.")}
            </p>
          </div>
        ) : token === null ? null : token === "" ? (
          <div className="text-center">
            <h1 className="text-xl font-bold text-wine-700">
              {t("resetPassword.missingTitle", "Link sahi nahi hai")}
            </h1>
            <p className="mt-2 text-sm text-muted">
              {t(
                "resetPassword.missingBody",
                "Ye reset link adhoora hai. Dobara 'Password bhool gaye' se ek naya link mangwaiye.",
              )}
            </p>
            <Link href="/forgot-password" className="mt-6 inline-block text-sm font-medium text-gold-700">
              {t("resetPassword.requestNew", "Naya link mangwaiye")}
            </Link>
          </div>
        ) : (
          <>
            <h1 className="text-center text-2xl font-bold text-wine-700">
              {t("resetPassword.title", "Naya Password Set Karein")}
            </h1>

            <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
              <Input
                label={t("resetPassword.field.password", "Naya Password")}
                name="password"
                type="password"
                autoComplete="new-password"
                helperText={t("resetPassword.field.passwordHelp", "Kam se kam 8 characters")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <Input
                label={t("resetPassword.field.confirmPassword", "Password Dobara Likhein")}
                name="confirm_password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />

              {error && (
                <p role="alert" className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">
                  {error}
                </p>
              )}

              <Button type="submit" fullWidth loading={loading}>
                {t("resetPassword.submit", "Password Set Karein")}
              </Button>
            </form>
          </>
        )}
      </Card>
    </main>
  );
}
