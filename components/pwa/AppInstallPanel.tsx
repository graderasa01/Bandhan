"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Share, Smartphone, SquarePlus } from "lucide-react";
import {
  appKnownInstalled,
  isIosSafari,
  isStandalone,
  markAppInstalled,
  useInstallPrompt,
} from "@/lib/pwa/installPrompt";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n/LanguageProvider";

type Status = "checking" | "installed" | "android" | "ios" | "unavailable";

/**
 * The static, findable-later twin of the floating `InstallAppPrompt` banner —
 * this is a page section, not a dismissible nudge, so it has no snooze and no
 * auto-hide. Someone who skipped the banner still needs a way back to it.
 *
 * Shares `lib/pwa/installPrompt.ts`'s captured `beforeinstallprompt` with both
 * the banner and `PinSettingsCard`'s inline button — whichever surface the
 * user actually taps spends the same real, single-use event.
 */
export default function AppInstallPanel() {
  const t = useT();
  const { canInstall, triggerInstall } = useInstallPrompt();
  const [status, setStatus] = useState<Status>("checking");
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (isStandalone()) {
      markAppInstalled();
      setStatus("installed");
    } else if (appKnownInstalled()) {
      // Same page, ordinary browser tab. Without this the person who installed
      // the app and then came back to check this page was shown the how-to for
      // something they had already done.
      setStatus("installed");
    } else if (isIosSafari()) {
      setStatus("ios");
    } else {
      setStatus("unavailable");
    }
  }, []);

  useEffect(() => {
    // `beforeinstallprompt` only fires when the browser considers the app
    // installable, so it also overrides a remembered install: Chrome saying
    // "this can be installed" is fresher evidence than a flag written earlier
    // on a browser the app may since have been removed from.
    if (canInstall && !isStandalone()) setStatus("android");
  }, [canInstall]);

  async function install() {
    setInstalling(true);
    try {
      const outcome = await triggerInstall();
      if (outcome === "accepted") setStatus("installed");
      else if (outcome === "unavailable") setStatus("unavailable");
    } finally {
      setInstalling(false);
    }
  }

  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <p className="flex items-center gap-2 text-[0.9375rem] font-semibold text-ink">
        <Smartphone className="size-4 shrink-0" />
        {t("pwa.installPanel.title", "App jaisa install karein")}
      </p>
      <p className="mt-1 text-[0.8125rem] leading-snug text-muted">
        {t(
          "pwa.installPanel.description",
          "Home screen par icon lag jaata hai — tap kariye aur seedha andar, na URL type karna, na baar-baar login.",
        )}
      </p>

      <div className="mt-3">
        {status === "checking" && (
          <p className="flex items-center gap-2 text-[0.8125rem] text-muted">
            <Loader2 className="size-3.5 animate-spin" /> {t("pwa.installPanel.checking", "Check kar rahe hain…")}
          </p>
        )}

        {status === "installed" && (
          <p className="flex items-center gap-2 rounded-md border border-trust/25 bg-trust-bg px-3 py-2 text-[0.8125rem] font-medium text-trust">
            <CheckCircle2 className="size-4 shrink-0" />
            {t("pwa.installPanel.alreadyInstalled", "Already installed hai — aap ise app ki tarah hi use kar rahe hain.")}
          </p>
        )}

        {status === "android" && (
          <button
            type="button"
            onClick={install}
            disabled={installing}
            className={cn(
              "inline-flex h-10 items-center gap-2 rounded-full bg-gradient-to-r from-gold-400 to-gold-600 px-5 text-sm font-semibold text-primary-fg shadow-gold disabled:opacity-70",
            )}
          >
            {installing && <Loader2 className="size-3.5 animate-spin" />}
            {t("pwa.installPanel.installApp", "Install App")}
          </button>
        )}

        {status === "ios" && (
          <ol className="space-y-2">
            <li className="flex items-center gap-2 text-[0.8125rem] text-ink">
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-bg-subtle text-[0.6875rem] font-semibold text-muted">
                1
              </span>
              <Share className="size-4 shrink-0 text-accent-text" aria-hidden />
              <span>
                {t("pwa.installPanel.iosStep1Prefix", "Neeche")}{" "}
                <span className="font-semibold">Share</span>{" "}
                {t("pwa.installPanel.iosStep1Suffix", "button dabaiye")}
              </span>
            </li>
            <li className="flex items-center gap-2 text-[0.8125rem] text-ink">
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-bg-subtle text-[0.6875rem] font-semibold text-muted">
                2
              </span>
              <SquarePlus className="size-4 shrink-0 text-accent-text" aria-hidden />
              <span>
                <span className="font-semibold">Add to Home Screen</span>{" "}
                {t("pwa.installPanel.iosStep2Suffix", "par tap kijiye")}
              </span>
            </li>
          </ol>
        )}

        {status === "unavailable" && (
          <p className="text-[0.8125rem] leading-snug text-subtle">
            {t(
              "pwa.installPanel.unavailable",
              "Is browser me abhi install ka option nahi hai. Phone ke Chrome browser me ye page kholiye — install ka button yahin dikhega.",
            )}
          </p>
        )}
      </div>
    </div>
  );
}
