"use client";

import { useEffect, useState } from "react";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * "Continue with Google".
 *
 * A plain `<a>`, not a fetch-then-redirect: the browser has to navigate to
 * Google either way, and an anchor keeps working while the page's JavaScript
 * is still loading — which is exactly when someone on a slow connection is
 * most likely to tap it.
 *
 * The `next` parameter is picked up from the current URL so that middleware's
 * `?next=/user/reel` survives a detour through Google. It is read in an effect
 * rather than during render because the server has no window to read it from,
 * and an href that changed on hydration would be a mismatch.
 *
 * Renders nothing when the deployment has no Google credentials — a button
 * that always errors is worse than no button, and this app ships with the
 * password flow fully working on its own.
 */
export default function GoogleSignInButton({ label = "Continue with Google" }: { label?: string }) {
  const t = useT();
  const [href, setHref] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/google/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.configured) return;
        const next = new URLSearchParams(window.location.search).get("next");
        setHref(
          next && next.startsWith("/")
            ? `/api/auth/google/start?next=${encodeURIComponent(next)}`
            : "/api/auth/google/start",
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!href) return null;

  return (
    <>
      <div className="my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-line" />
        <span className="text-xs text-subtle">{t("auth.divider.or", "ya")}</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <a
        href={href}
        className="flex min-h-12 w-full items-center justify-center gap-3 rounded-full border border-line-strong bg-surface px-5 text-sm font-semibold text-ink transition-colors hover:bg-bg-subtle"
      >
        <GoogleMark />
        {label}
      </a>
    </>
  );
}

/** Google's official four-colour mark. Inlined so it can't be blocked or fail to load. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden className="size-5 shrink-0">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
