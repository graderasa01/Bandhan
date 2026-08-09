"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { EyeOff, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * The incognito switch, with its cost stated on the control itself.
 *
 * Incognito here is symmetric — turning it on also closes the user's own
 * "Viewed You" names (see `canSeeViewerIdentity`). That is a real trade, not
 * fine print, so it is written next to the toggle rather than buried in a help
 * page. Somebody who flips this and then wonders why their viewer list emptied
 * has been surprised by their own setting, which is the failure this copy
 * exists to prevent.
 */
export default function IncognitoToggle({
  initialEnabled,
  allowed,
}: {
  initialEnabled: boolean;
  allowed: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    const next = !enabled;
    setBusy(true);
    try {
      const res = await fetch("/api/profile/incognito", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: t("profile.incognitoToggle.saveFailed", "Save nahi hua"), description: json.message, tone: "error" });
        return;
      }
      setEnabled(next);
      toast({
        title: next
          ? t("profile.incognitoToggle.turnedOn", "Incognito on — ab aap kisi ki list me nahi dikhenge")
          : t("profile.incognitoToggle.turnedOff", "Incognito off"),
        tone: "info",
      });
      router.refresh();
    } catch {
      toast({ title: t("profile.incognitoToggle.networkError", "Network error — dobara try karein"), tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-line px-3.5 py-3">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-[0.875rem] font-medium text-ink">
          <EyeOff className="size-3.5 shrink-0" />
          {t("profile.incognitoToggle.title", "Incognito browsing")}
        </p>
        <p className="text-[0.75rem] leading-snug text-muted">
          {allowed
            ? t(
                "profile.incognitoToggle.descriptionAllowed",
                "On karne par aap kisi ke “Viewed You” me nahi dikhenge — aur us dauraan aapko bhi kisi ka naam nahi dikhega. Dono taraf barabar. Purani browsing chhupi hi rahegi, chahe aap ise baad me band kar dein.",
              )
            : t(
                "profile.incognitoToggle.descriptionLocked",
                "Premium plan me milti hai. On hone par aap kisi ke “Viewed You” me nahi dikhte — aur us dauraan aapko bhi kisi ka naam nahi dikhta.",
              )}
        </p>
        {!allowed && (
          <Link
            href="/user/subscription"
            className="mt-1 inline-block text-[0.75rem] font-semibold text-wine-700 hover:text-wine-800"
          >
            {t("profile.incognitoToggle.viewPlans", "Plans dekhein →")}
          </Link>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={t("profile.incognitoToggle.title", "Incognito browsing")}
        // A user whose plan lapsed while hidden must still be able to switch
        // off, so the control is only disabled when it is already off.
        disabled={busy || (!allowed && !enabled)}
        onClick={toggle}
        className={cn(
          "relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-60",
          enabled ? "bg-gold-500" : "bg-line-strong",
        )}
      >
        {busy ? (
          <Loader2 className="absolute inset-0 m-auto size-3.5 animate-spin text-white" />
        ) : (
          <span
            className={cn(
              "absolute top-0.5 size-6 rounded-full bg-white shadow transition-transform",
              enabled ? "translate-x-[22px]" : "translate-x-0.5",
            )}
          />
        )}
      </button>
    </div>
  );
}
