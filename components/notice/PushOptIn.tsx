"use client";

import { useEffect, useState } from "react";
import { BellOff, BellRing, Check, Loader2 } from "lucide-react";
import Card from "@/components/ui/Card";
import {
  disablePush,
  enablePush,
  isSubscribedHere,
  permissionState,
  pushSupport,
  type EnableResult,
} from "@/lib/notices/pushClient";
import { useT } from "@/components/i18n/LanguageProvider";
import type { Translate } from "@/lib/i18n/translate";

/**
 * The one place a user turns notifications on.
 *
 * ## Why it renders nothing until it knows
 *
 * The three facts this card depends on — browser support, permission state,
 * whether *this* browser is already subscribed — are all client-only, so the
 * server render cannot know any of them. Rendering an optimistic "Turn on
 * notifications" and then yanking it away on hydration is the worst version;
 * `state: "loading"` renders a stable skeleton-height card instead, and the
 * whole thing disappears if the browser can't do push at all.
 *
 * ## Why "denied" gets its own copy
 *
 * A browser hands out the permission prompt exactly once. Once denied, calling
 * `requestPermission()` again resolves instantly with "denied" and shows the
 * user nothing — so a button that says "Turn On" would simply do nothing
 * forever. The denied state says what actually has to happen instead: the
 * browser's own site settings.
 */

type State =
  | { kind: "loading" }
  | { kind: "hidden" }
  | { kind: "off" }
  | { kind: "on"; deviceCount: number }
  | { kind: "denied" }
  | { kind: "not-configured" }
  | { kind: "error"; message: string };

type FailReason = Extract<EnableResult, { ok: false }>["reason"];

function reasonCopy(t: Translate, reason: FailReason): string {
  const copy: Record<FailReason, string> = {
    unsupported: t("notice.pushOptIn.reasonUnsupported", "Ye browser push notifications support nahi karta."),
    "insecure-context": t("notice.pushOptIn.reasonInsecureContext", "Notifications ke liye HTTPS chahiye."),
    denied: "denied",
    "not-configured": "not-configured",
    failed: t("notice.pushOptIn.reasonFailed", "Notification chaalu nahi ho paaya. Ek baar phir try kijiye."),
  };
  return copy[reason];
}

export default function PushOptIn({ className }: { className?: string }) {
  const t = useT();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [tested, setTested] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (pushSupport() !== "supported") {
        if (!cancelled) setState({ kind: "hidden" });
        return;
      }

      const config = await fetch("/api/push/subscribe")
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      if (cancelled) return;

      if (!config?.configured) {
        setState({ kind: "not-configured" });
        return;
      }
      if (permissionState() === "denied") {
        setState({ kind: "denied" });
        return;
      }
      const subscribed = await isSubscribedHere();
      if (cancelled) return;
      setState(
        subscribed ? { kind: "on", deviceCount: Number(config.deviceCount) || 1 } : { kind: "off" },
      );
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function turnOn() {
    setBusy(true);
    setTested(null);
    const result = await enablePush();
    setBusy(false);
    if (result.ok) {
      setState({ kind: "on", deviceCount: result.deviceCount });
      return;
    }
    if (result.reason === "denied") setState({ kind: "denied" });
    else if (result.reason === "not-configured") setState({ kind: "not-configured" });
    else setState({ kind: "error", message: reasonCopy(t, result.reason) });
  }

  async function turnOff() {
    setBusy(true);
    setTested(null);
    await disablePush();
    setBusy(false);
    setState({ kind: "off" });
  }

  async function sendTest() {
    setBusy(true);
    const res = await fetch("/api/push/test", { method: "POST" })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    setBusy(false);
    setTested(Number(res?.delivered) || 0);
  }

  if (state.kind === "hidden" || state.kind === "not-configured") return null;

  return (
    <Card variant="soft" padding="md" className={className}>
      <div className="flex items-start gap-3">
        <span
          className={
            state.kind === "on"
              ? "grid size-9 shrink-0 place-items-center rounded-full bg-trust/15 text-trust"
              : "grid size-9 shrink-0 place-items-center rounded-full bg-gold-100 text-gold-700 dark:bg-gold-900/40 dark:text-gold-200"
          }
        >
          {state.kind === "on" ? <BellRing className="size-4" /> : <BellOff className="size-4" />}
        </span>

        <div className="min-w-0 flex-1">
          {state.kind === "loading" && (
            <p className="text-[0.875rem] text-muted">
              {t("notice.pushOptIn.loading", "Notification setting dekh rahe hain…")}
            </p>
          )}

          {state.kind === "off" && (
            <>
              <p className="text-[0.9375rem] font-semibold text-ink">
                {t("notice.pushOptIn.offTitle", "App band ho tab bhi khabar milti rahe")}
              </p>
              <p className="mt-1 text-[0.8125rem] leading-snug text-muted">
                {t(
                  "notice.pushOptIn.offDescription",
                  "Naya match, voice note, ya koi sawaal aaye to phone par turant pata chal jaayega. Naam kabhi notification me nahi likha jaata — sirf itna ki kuch aaya hai.",
                )}
              </p>
              <button
                type="button"
                onClick={turnOn}
                disabled={busy}
                className="mt-3 inline-flex min-h-12 items-center gap-2 rounded-full bg-gradient-to-r from-gold-400 to-gold-600 px-5 text-sm font-semibold text-primary-fg shadow-gold disabled:opacity-60"
              >
                {busy && <Loader2 className="size-4 animate-spin" />}
                {t("notice.pushOptIn.turnOn", "Turn On Notifications")}
              </button>
            </>
          )}

          {state.kind === "on" && (
            <>
              <p className="text-[0.9375rem] font-semibold text-ink">
                {t("notice.pushOptIn.onTitle", "Notifications chaalu hain")}
              </p>
              <p className="mt-1 text-[0.8125rem] leading-snug text-muted">
                {state.deviceCount > 1
                  ? `${state.deviceCount}${t("notice.pushOptIn.onMultiDevice", " device par chaalu hai.")}`
                  : t("notice.pushOptIn.onSingleDevice", "Is device par chaalu hai.")}
                {tested !== null &&
                  (tested > 0
                    ? `${t("notice.pushOptIn.testSentPre", " Test bheja gaya — ")}${tested}${t("notice.pushOptIn.testSentPost", " device par pahuncha.")}`
                    : t(
                        "notice.pushOptIn.testSentNone",
                        " Test bhej diya, par kisi device tak nahi pahuncha. Phone ki settings me BandhanTak ke notifications check kijiye.",
                      ))}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={sendTest}
                  disabled={busy}
                  className="inline-flex min-h-12 items-center gap-2 rounded-full border border-line px-4 text-sm font-semibold text-ink transition-colors hover:bg-bg-subtle disabled:opacity-60"
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                  {t("notice.pushOptIn.sendTest", "Send Test")}
                </button>
                <button
                  type="button"
                  onClick={turnOff}
                  disabled={busy}
                  className="inline-flex min-h-12 items-center px-3 text-sm font-medium text-muted transition-colors hover:text-ink disabled:opacity-60"
                >
                  {t("notice.pushOptIn.turnOff", "Turn Off")}
                </button>
              </div>
            </>
          )}

          {state.kind === "denied" && (
            <>
              <p className="text-[0.9375rem] font-semibold text-ink">
                {t("notice.pushOptIn.deniedTitle", "Notifications block ho rakhe hain")}
              </p>
              <p className="mt-1 text-[0.8125rem] leading-snug text-muted">
                {t(
                  "notice.pushOptIn.deniedDescription",
                  'Browser ne is site ke notifications band kar rakhe hain, isliye app yahan se dobara nahi poochh sakta. Address bar ke taale (🔒) par tap karke "Notifications" ko Allow kar dijiye, phir page refresh kijiye.',
                )}
              </p>
            </>
          )}

          {state.kind === "error" && (
            <>
              <p className="text-[0.9375rem] font-semibold text-ink">{state.message}</p>
              <button
                type="button"
                onClick={turnOn}
                disabled={busy}
                className="mt-3 inline-flex min-h-12 items-center gap-2 rounded-full border border-line px-4 text-sm font-semibold text-ink disabled:opacity-60"
              >
                {t("notice.pushOptIn.tryAgain", "Try Again")}
              </button>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
