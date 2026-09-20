"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AmbientBackground from "@/components/theme/AmbientBackground";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";

/**
 * The admin panel's own door — separate from the member `/login` on purpose
 * (see app/admin/login/page.tsx). Not linked from anywhere public; reached
 * only by typing the URL or via a redirect from an /admin/* page.
 */
export default function AdminLoginView({ next }: { next: string | null }) {
  const router = useRouter();
  const [mobileOrEmail, setMobileOrEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile_or_email: mobileOrEmail, password, portal: "admin" }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.message ?? "Login nahi ho paya.");
        return;
      }
      // `landing` comes from the server (lib/auth/postLoginPath.ts): ADMIN →
      // /admin, SUPPORT → /admin/partners, since /admin itself is ADMIN-only
      // and would only bounce a support account straight back out.
      router.push(next ?? (typeof json.landing === "string" ? json.landing : "/admin"));
      router.refresh();
    } catch {
      setError("Network error — dobara try karein.");
    } finally {
      setLoading(false);
    }
  }

  return (
    // The admin door stands in the same room as everything else — the glass
    // theme's own scope, with the focus ambience behind the single card. The
    // old wine gradient was the one screen still painting its own ground.
    // The `flex` that used to live on this element never applied: `.bt-glass`
    // sets `display: flow-root` from an unlayered rule, and unlayered CSS beats
    // every Tailwind utility whatever its specificity — so the card sat hard
    // against the left edge. The centring moved to a child, which is the fix
    // that does not change how `.bt-glass` behaves for the other hundred routes.
    <main className="bt-glass dark relative isolate min-h-screen px-4 py-16">
      <AmbientBackground variant="focus" />
      <div className="flex min-h-[calc(100svh-8rem)] items-center justify-center">
      <Card padding="lg" className="w-full max-w-[26rem]">
        <h1 className="text-center text-2xl font-bold text-ink">Admin Login</h1>
        <p className="mt-2 text-center text-sm text-muted">BandhanTak Control Center</p>

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

          {error && (
            <p role="alert" className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}

          <Button type="submit" fullWidth loading={loading}>
            Login
          </Button>
        </form>

        <div className="mt-4 text-center">
          <Link href="/" className="text-sm text-muted">
            ← BandhanTak.com
          </Link>
        </div>
      </Card>
      </div>
    </main>
  );
}
