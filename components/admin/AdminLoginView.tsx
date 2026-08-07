"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";

/**
 * The admin panel's own door — separate from the member `/login` on purpose
 * (see app/admin/login/page.tsx). Not linked from anywhere public; reached
 * only by typing the URL or via a redirect from an /admin/* page.
 */
export default function AdminLoginView({ next }: { next: string }) {
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
      router.push(next.startsWith("/admin") ? next : "/admin");
      router.refresh();
    } catch {
      setError("Network error — dobara try karein.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-wine-700 via-wine-800 to-wine-900 px-4 py-16">
      <Card padding="lg" className="w-full max-w-[26rem]">
        <h1 className="text-center text-2xl font-bold text-wine-700">Admin Login</h1>
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
    </main>
  );
}
