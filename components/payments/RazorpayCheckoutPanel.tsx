"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { CreditCard, Loader2, ShieldCheck } from "lucide-react";
import Button from "@/components/ui/Button";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * Razorpay Checkout, mounted.
 *
 * Razorpay's modal is an overlay this page opens, not a page we navigate to,
 * so this component is the whole payment UI: it loads their script, opens the
 * modal as soon as it can, and owns what the user sees in every state the
 * modal can leave them in — including the one nobody designs for, where they
 * close it without paying.
 *
 * It grants nothing. On success it forwards Razorpay's three callback fields
 * to `/api/checkout/razorpay/confirm`, which re-verifies them against Razorpay
 * itself before any entitlement moves.
 */

interface RazorpaySuccess {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayInstance {
  open(): void;
  on(event: "payment.failed", handler: (resp: { error?: { description?: string } }) => void): void;
}

interface RazorpayConstructor {
  new (options: Record<string, unknown>): RazorpayInstance;
}

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

/**
 * The modal's accent, taken from the live theme pack rather than hardcoded, so
 * switching packs in /admin/theme recolours Razorpay too. Safe to read
 * directly because `--bt-accent` is authored as a plain hex in globals.css —
 * Razorpay rejects anything else, so the literal fallback is not decorative.
 */
function themeColor(): string {
  if (typeof window === "undefined") return "#4a1119";
  const value = getComputedStyle(document.documentElement).getPropertyValue("--bt-accent").trim();
  return /^#[0-9a-f]{6}$/i.test(value) ? value : "#4a1119";
}

type Phase = "loading" | "open" | "verifying" | "dismissed" | "failed";

export default function RazorpayCheckoutPanel({
  keyId,
  orderId,
  amountPaise,
  productName,
  prefill,
}: {
  keyId: string;
  orderId: string;
  amountPaise: number;
  /**
   * Complete product name as it should read on the gateway's own screen —
   * "Basic Plan" or "Discovery Week", already formatted by `describePayment`.
   * It used to be `planName` and the panel appended " Plan" itself, which
   * turned the first à-la-carte item into "Discovery Week Plan".
   */
  productName: string;
  prefill: { name: string; email: string; contact: string };
}) {
  const t = useT();
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [note, setNote] = useState<string | null>(null);
  // `onReady` fires on every mount once the script exists, and React remounts
  // components in dev StrictMode. Without this the user gets two stacked
  // Razorpay overlays and closing one leaves the other behind.
  const opened = useRef(false);

  const confirm = useCallback(
    async (resp: RazorpaySuccess) => {
      setPhase("verifying");
      try {
        const res = await fetch("/api/checkout/razorpay/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(resp),
        });
        const json = (await res.json()) as { ok?: boolean; status?: string; message?: string };

        if (res.ok && json.ok && json.status === "captured") {
          router.push("/user/subscription?success=1");
          return;
        }
        if (res.ok && json.ok && json.status === "pending") {
          // Authorised but not captured. The webhook finishes this, so the
          // honest thing is to say "shortly", not "done" and not "failed".
          router.push("/user/subscription?pending=1");
          return;
        }
        if (res.ok && json.ok && json.status === "failed") {
          router.push("/user/subscription?failed=1");
          return;
        }

        // Verification itself failed. The payment may well have gone through —
        // saying "payment failed" here would be a guess, and the wrong one is
        // the one that makes someone pay twice.
        setPhase("failed");
        setNote(
          json.message ??
            t(
              "payments.razorpay.verifyFailed",
              "Payment ho gaya hoga, par hum confirm nahi kar paye. Paisa kata hai to plan thodi der me khud active ho jayega — dobara pay mat kijiye.",
            ),
        );
      } catch {
        setPhase("failed");
        setNote(
          t(
            "payments.razorpay.networkDuringVerify",
            "Internet check kijiye. Agar paisa kat chuka hai to plan apne aap active ho jayega — dobara pay mat kijiye.",
          ),
        );
      }
    },
    [router, t],
  );

  const openCheckout = useCallback(() => {
    if (!window.Razorpay) return;
    setNote(null);

    const rzp = new window.Razorpay({
      key: keyId,
      order_id: orderId,
      amount: amountPaise,
      currency: "INR",
      name: "BandhanTak",
      description: productName,
      prefill: {
        name: prefill.name,
        // Razorpay shows an empty field rather than a wrong one when these are
        // blank, which is what we want for accounts created without an email.
        email: prefill.email || undefined,
        contact: prefill.contact || undefined,
      },
      theme: { color: themeColor() },
      handler: (resp: RazorpaySuccess) => void confirm(resp),
      modal: {
        ondismiss: () => setPhase("dismissed"),
        // Closing by accident mid-payment is how people end up paying twice.
        confirm_close: true,
      },
    });

    rzp.on("payment.failed", (resp) => {
      setPhase("failed");
      setNote(
        resp.error?.description ??
          t("payments.razorpay.declined", "Payment poora nahi ho paya. Kuch bhi charge nahi hua."),
      );
    });

    setPhase("open");
    rzp.open();
  }, [amountPaise, confirm, keyId, orderId, productName, prefill, t]);

  function retry() {
    openCheckout();
  }

  return (
    <div className="mt-6 flex flex-col gap-3">
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        strategy="afterInteractive"
        onReady={() => {
          if (opened.current) return;
          opened.current = true;
          openCheckout();
        }}
        onError={() => {
          setPhase("failed");
          setNote(
            t(
              "payments.razorpay.scriptFailed",
              "Payment window load nahi ho payi. Internet check karke dobara try kijiye.",
            ),
          );
        }}
      />

      {phase === "loading" && (
        <p className="flex items-center justify-center gap-2 text-[0.8125rem] text-muted">
          <Loader2 className="size-4 animate-spin" />
          {t("payments.razorpay.opening", "Payment window khul raha hai…")}
        </p>
      )}

      {phase === "open" && (
        <>
          <p className="text-center text-[0.8125rem] text-muted">
            {t("payments.razorpay.completeInWindow", "Payment window me apna payment poora kijiye.")}
          </p>
          {/*
            Razorpay's overlay covers this, so it is invisible in the normal
            case — it exists for the case where the overlay never appeared
            (order rejected, script half-loaded, popup blocked). Without it that
            user is left staring at "complete your payment in the window" with
            no window and no way back.
          */}
          <Button variant="ghost" size="md" fullWidth onClick={() => router.push("/user/subscription")}>
            {t("payments.razorpay.back", "Back to Plans")}
          </Button>
        </>
      )}

      {phase === "verifying" && (
        <p className="flex items-center justify-center gap-2 text-[0.8125rem] text-muted">
          <Loader2 className="size-4 animate-spin" />
          {t("payments.razorpay.verifying", "Payment confirm ki ja rahi hai — page band mat kijiye.")}
        </p>
      )}

      {(phase === "dismissed" || phase === "failed") && (
        <>
          <p className="text-center text-[0.8125rem] leading-snug text-muted">
            {note ??
              t("payments.razorpay.dismissed", "Payment window band ho gayi. Kuch bhi charge nahi hua.")}
          </p>
          <Button variant="primary" size="md" fullWidth onClick={retry} icon={<CreditCard className="size-4" />}>
            {t("payments.razorpay.tryAgain", "Try Again")}
          </Button>
          <Button variant="ghost" size="md" fullWidth onClick={() => router.push("/user/subscription")}>
            {t("payments.razorpay.back", "Back to Plans")}
          </Button>
        </>
      )}

      <p className="mt-1 flex items-center justify-center gap-1.5 text-[0.75rem] text-subtle">
        <ShieldCheck className="size-3.5" />
        {t("payments.razorpay.secureNote", "Payment Razorpay par hota hai — card details hum tak nahi aate.")}
      </p>
    </div>
  );
}
