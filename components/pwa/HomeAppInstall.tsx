"use client";

import { useEffect, useState } from "react";
import {
  ArrowRight,
  BellRing,
  CheckCircle2,
  Download,
  Loader2,
  Share,
  Smartphone,
  SquarePlus,
  WifiOff,
} from "lucide-react";
import {
  appKnownInstalled,
  isIosDevice,
  isIosSafari,
  isStandalone,
  markAppInstalled,
  useInstallPrompt,
} from "@/lib/pwa/installPrompt";
import { useT } from "@/components/i18n/LanguageProvider";
import { cn } from "@/lib/utils";

type Status = "checking" | "installed" | "android" | "ios" | "unavailable";

/**
 * "Get the app", on the marketing page.
 *
 * The product has had a manifest, icons and a worker for a long time, but
 * every surface that offered the install lived behind the login — which meant
 * the one audience most likely to want an icon on their home screen, somebody
 * still deciding whether to sign up, was never asked. This is that offer, on
 * the public page, for a visitor with no account.
 *
 * ## Two things it needs that the signed-in panels get for free
 *
 * 1. **The worker.** `beforeinstallprompt` only fires once the browser has
 *    seen a registered service worker with a fetch handler, and nothing
 *    registers one outside `/user/*`. So this registers it — the same
 *    `/sw.js`, at the root scope, which is also what makes push work later if
 *    the person signs up and allows it. Registration is idempotent: the
 *    browser reuses an existing one rather than installing a second.
 * 2. **The page's own vocabulary.** This is written in `glass-surface` /
 *    `glass-card` / `glass-chip` / `accent-primary` like every other panel on
 *    the home page, so it takes all four themes — satin, day, night and the
 *    classic paper — without a single colour of its own.
 *
 * ## What it says, and when
 *
 * Nothing it cannot deliver. The button appears only once Chrome has actually
 * handed over a live `beforeinstallprompt` (see `lib/pwa/installPrompt.ts`);
 * iOS Safari gets the two-step Share sheet instruction, because that is the
 * only way to install there; and any other browser is told plainly to open the
 * page in Chrome rather than being shown a button that would do nothing.
 *
 * ## The native Android app, as a separate offer
 *
 * `androidApkHref` is the stable download link (`/download/android`), passed
 * only when a release is actually hosted (`lib/pwa/androidApk.ts`). It gets its
 * own line under the PWA offer and never replaces or relabels it — the button
 * above installs the website, this one downloads a different, native app. Not
 * shown on iPhone/iPad, where an APK cannot install.
 */
export default function HomeAppInstall({ androidApkHref = null }: { androidApkHref?: string | null }) {
  const t = useT();
  const { canInstall, triggerInstall } = useInstallPrompt();
  const [status, setStatus] = useState<Status>("checking");
  const [installing, setInstalling] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    // Root scope, so the installed app covers the whole site and not just the
    // page it happened to be offered on. Failures are silent on purpose: an
    // unsupported browser simply never reaches the `android` branch below.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    }

    setIos(isIosDevice());
    if (isStandalone()) {
      markAppInstalled();
      setStatus("installed");
    } else if (appKnownInstalled()) {
      setStatus("installed");
    } else if (isIosSafari()) {
      setStatus("ios");
    } else {
      setStatus("unavailable");
    }
  }, []);

  useEffect(() => {
    // The browser saying "this is installable" is fresher evidence than a flag
    // written on some earlier visit, so it overrides a remembered install.
    if (canInstall && !isStandalone()) setStatus("android");
  }, [canInstall]);

  async function install() {
    setInstalling(true);
    try {
      const outcome = await triggerInstall();
      if (outcome === "accepted") {
        markAppInstalled();
        setStatus("installed");
      } else if (outcome === "unavailable") {
        setStatus("unavailable");
      }
    } finally {
      setInstalling(false);
    }
  }

  const PERKS = [
    {
      icon: Smartphone,
      title: t("home.app.perkIconTitle", "Home screen par apna icon"),
      desc: t("home.app.perkIconDesc", "Ek tap — na URL, na baar-baar login"),
    },
    {
      icon: BellRing,
      title: t("home.app.perkPushTitle", "Naya rishta aate hi pata"),
      desc: t("home.app.perkPushDesc", "Notification seedha phone par, app band ho tab bhi"),
    },
    {
      icon: WifiOff,
      title: t("home.app.perkLightTitle", "Play Store ki zaroorat nahi"),
      desc: t("home.app.perkLightDesc", "Browser se hi lagta hai, phone me jagah nahi leta"),
    },
  ];

  return (
    <section className="glass-surface glass-card relative px-5 py-8 sm:px-9 sm:py-12 lg:px-12 lg:py-14">
      <div className="grid gap-9 lg:grid-cols-[1fr_0.84fr] lg:items-center lg:gap-14">
        <div>
          <span className="gold-label">
            <Download className="size-3.5" />
            {t("home.app.eyebrow", "BandhanTak App")}
          </span>

          <h2 className="bt-display mt-5 text-[1.9rem] sm:text-[2.45rem]">
            {t("home.app.headlineStart", "Poora BandhanTak,")}
            <br />
            <span className="text-gold">{t("home.app.headlineAccent", "aapke home screen")}</span>{" "}
            {t("home.app.headlineEnd", "par.")}
          </h2>

          <p className="mt-4 max-w-lg text-pretty leading-relaxed text-muted sm:text-[1.0625rem]">
            {t(
              "home.app.description",
              "Koi alag download nahi, koi store nahi. Yahi website aapke phone me app ban jaati hai — wahi profile, wahi reel, bas ek icon se.",
            )}
          </p>

          <div className="mt-7 min-h-[3rem]">
            {status === "checking" && (
              <p className="flex items-center gap-2 text-[0.875rem] text-muted">
                <Loader2 className="size-4 animate-spin" />
                {t("home.app.checking", "Aapka browser check kar rahe hain…")}
              </p>
            )}

            {status === "installed" && (
              <span className="glass-surface glass-chip inline-flex items-center gap-2 px-4 py-2.5 text-[0.875rem] leading-none text-ink">
                <CheckCircle2 className="size-[17px] shrink-0 text-trust" />
                {t("home.app.installed", "App already install hai — icon se kholiye")}
              </span>
            )}

            {status === "android" && (
              <button
                type="button"
                onClick={install}
                disabled={installing}
                className={cn(
                  "accent-primary group inline-flex h-12 items-center justify-center gap-2 rounded-full px-7",
                  "text-[0.9375rem] font-semibold transition-transform duration-200",
                  "ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 disabled:opacity-60",
                )}
              >
                {installing ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Download className="size-4" />
                )}
                {t("home.app.installApp", "Install App")}
                <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </button>
            )}

            {status === "ios" && (
              <ol className="chip-rail">
                <li className="glass-surface glass-chip inline-flex items-center gap-2 px-3.5 py-2 text-[0.8125rem] leading-none text-ink sm:px-4 sm:py-2.5 sm:text-[0.875rem]">
                  <Share className="size-[15px] shrink-0" aria-hidden />
                  <span className="whitespace-nowrap">
                    1 · {t("home.app.iosStep1", "Neeche Share dabaiye")}
                  </span>
                </li>
                <li className="glass-surface glass-chip inline-flex items-center gap-2 px-3.5 py-2 text-[0.8125rem] leading-none text-ink sm:px-4 sm:py-2.5 sm:text-[0.875rem]">
                  <SquarePlus className="size-[15px] shrink-0" aria-hidden />
                  <span className="whitespace-nowrap">
                    2 · {t("home.app.iosStep2", "Add to Home Screen chuniye")}
                  </span>
                </li>
              </ol>
            )}

            {status === "unavailable" && (
              <p className="max-w-md text-[0.875rem] leading-snug text-subtle">
                {t(
                  "home.app.unavailable",
                  "Is browser me install ka option nahi hai. Phone ke Chrome me ye page kholiye — install ka button yahin aa jayega.",
                )}
              </p>
            )}
          </div>

          {androidApkHref && status !== "checking" && !ios && (
            <div className="mt-6 max-w-lg">
              <p className="text-[0.8125rem] font-semibold text-muted">
                {t("home.app.apkLead", "Ya Android ka alag, native app:")}
              </p>
              {/* A plain anchor, not next/link: this is a redirect to a file,
                  not a page to prefetch or render client-side. */}
              <a
                href={androidApkHref}
                className="glass-surface glass-chip mt-2.5 inline-flex h-11 items-center gap-2 px-5 text-[0.875rem] font-semibold leading-none text-ink"
              >
                <Smartphone className="size-4 shrink-0 text-gold" aria-hidden />
                {t("home.app.downloadApk", "Download Android App (APK)")}
              </a>
              <p className="mt-2 text-[0.8125rem] leading-snug text-subtle">
                {t(
                  "home.app.apkNote",
                  "Ye file Play Store ke bahar se aati hai, isliye install karte waqt phone 'unknown apps' ki ijaazat maangega.",
                )}
              </p>
            </div>
          )}
        </div>

        <div className="grid min-w-0 gap-2.5">
          {PERKS.map(({ icon: Icon, title, desc }, i) => (
            <div
              key={title}
              className={cn(
                "glass-surface glass-card--soft flex items-start gap-3.5 px-4 py-3.5 [--surface-radius:18px]",
                i === 0 && "[--surface-alpha:0.62]",
              )}
            >
              <span className="glass-seal grid size-9 shrink-0 place-items-center text-gold">
                <Icon className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-[0.9375rem] font-semibold leading-snug text-ink">{title}</p>
                <p className="mt-0.5 text-[0.875rem] leading-snug text-muted">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
