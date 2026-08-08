"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { LoginPageViewModel } from "@/lib/contracts/publicPages";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import GoogleSignInButton from "@/components/auth/GoogleSignInButton";

type Props = { data: LoginPageViewModel };

const GOOGLE_ERRORS: Record<string, string> = {
  google_failed: "Google se login nahi ho paya. Ek baar phir try kijiye.",
  google_state: "Login link purana ho gaya tha. Dobara 'Continue with Google' dabaiye.",
  google_unverified:
    "Is Google account ka email verify nahi hai, isliye login nahi ho sakta. Google me email verify karke phir try kijiye.",
  google_unavailable: "Google login abhi available nahi hai. Mobile/email se login kijiye.",
  account_blocked: "Ye account blocked hai. Support se sampark karein.",
};

export default function LoginPageView({ data }: Props) {
  const router = useRouter();
  const [mobileOrEmail, setMobileOrEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [registerHref, setRegisterHref] = useState(data.registerLink.href);

  // Middleware sends people here with ?next=/partner/register when they
  // weren't logged in yet — without forwarding it, clicking through to
  // Register silently drops that intent and they land on the regular
  // post-signup flow instead of back on the partner application.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const next = params.get("next");

    // A stale bookmark or old link can still point here with ?next=/admin/....
    // This form can never authenticate an admin account (the API rejects it),
    // so send them straight to the door that can rather than let them hit that
    // rejection first.
    if (next && next.startsWith("/admin")) {
      router.replace(`/admin/login?next=${encodeURIComponent(next)}`);
      return;
    }

    if (next && next.startsWith("/")) {
      setRegisterHref(`${data.registerLink.href}?next=${encodeURIComponent(next)}`);
    }

    // Google Sign-In fails by redirecting here with a code, because the
    // callback is a top-level navigation — a JSON error body would strand the
    // user on a blank page. Anything unrecognised is treated as the generic
    // failure rather than printed raw: this value comes off the URL bar and
    // must never be rendered as text.
    const code = params.get("error");
    if (code) setError(GOOGLE_ERRORS[code] ?? GOOGLE_ERRORS.google_failed);
  }, [data.registerLink.href, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mobile_or_email: mobileOrEmail,
          password,
          remember_me: rememberMe,
          portal: "member",
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.message ?? "Login nahi ho paya.");
        return;
      }
      const next = new URLSearchParams(window.location.search).get("next");
      // `landing` is resolved server-side (lib/auth/postLoginPath.ts) because
      // only the server can see role + live partner status. This form used to
      // guess "/user/dashboard" for everyone and then ask
      // /api/profile/completion whether to downgrade to /profile/build — which
      // was one extra round trip *and* silently wrong for partners, admins and
      // support, who all got bounced by middleware straight to the marketing
      // homepage. Middleware's own `?next=` still wins over the default.
      const dest =
        next && next.startsWith("/") && !next.startsWith("//")
          ? next
          : typeof json.landing === "string"
            ? json.landing
            : "/user/dashboard";
      router.push(dest);
      router.refresh();
    } catch {
      setError("Network error — dobara try karein.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-[28rem] px-4 py-16">
      <Card padding="lg">
        <h1 className="text-center text-2xl font-bold text-wine-700">Login</h1>
        <p className="mt-2 text-center text-sm text-muted">Apne account me login karein</p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
          <Input
            label="Mobile ya Email"
            name="mobile_or_email"
            autoComplete="username"
            value={mobileOrEmail}
            onChange={(e) => setMobileOrEmail(e.target.value)}
            required
          />
          <Input
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <label className="flex min-h-11 items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="size-4 rounded border-line-strong accent-gold-600"
            />
            Mujhe yaad rakhein
          </label>

          {error && (
            <p role="alert" className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}

          <Button type="submit" fullWidth loading={loading}>
            {data.submitLabel}
          </Button>
        </form>

        <GoogleSignInButton />

        <div className="mt-4 text-center">
          <a href="#" className="text-sm text-gold-700">
            {data.forgotPasswordLabel}
          </a>
        </div>
        <div className="mt-3 border-t border-line pt-4 text-center">
          <a href={registerHref} className="text-sm font-medium text-gold-700">
            {data.registerLink.label}
          </a>
        </div>
        <div className="mt-3 text-center">
          <a href={data.partnerCTA.href} className="text-sm text-muted">
            {data.partnerCTA.label}
          </a>
        </div>
        <p className="mt-4 text-center text-xs text-muted">{data.safetyNote}</p>
      </Card>
    </main>
  );
}
