"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/components/i18n/LanguageProvider";

function withFlag(href: string, flag: string): string {
  return `${href}${href.includes("?") ? "&" : "?"}${flag}`;
}

/**
 * The two buttons the dummy checkout offers instead of a card form: "Pay" and
 * "Simulate Failure". Both call the exact webhook code path a real gateway
 * would (see /api/checkout/dummy/complete) — this component only decides
 * which outcome to ask for.
 *
 * `returnHref` comes from `describePayment`, so a Chat Unlock lands back in
 * its thread and everything else on the plans page, same as Razorpay.
 */
export default function DummyCheckoutPanel({
  orderId,
  returnHref = "/user/subscription",
}: {
  orderId: string;
  returnHref?: string;
}) {
  const t = useT();
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<"success" | "failure" | null>(null);

  async function complete(outcome: "success" | "failure") {
    setBusy(outcome);
    try {
      const res = await fetch("/api/checkout/dummy/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, outcome }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: t("payments.dummyCheckout.errorTitle", "Something went wrong"), description: json.message, tone: "error" });
        setBusy(null);
        return;
      }
      router.push(withFlag(returnHref, outcome === "success" ? "success=1" : "failed=1"));
    } catch {
      toast({
        title: t("payments.dummyCheckout.networkErrorTitle", "Network error"),
        description: t("payments.dummyCheckout.networkErrorDesc", "Please try again."),
        tone: "error",
      });
      setBusy(null);
    }
  }

  return (
    <div className="mt-6 flex flex-col gap-2">
      <Button
        variant="primary"
        size="md"
        fullWidth
        disabled={busy !== null}
        onClick={() => complete("success")}
        icon={busy === "success" ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
      >
        {t("payments.dummyCheckout.payNow", "Pay Now")}
      </Button>
      <Button
        variant="ghost"
        size="md"
        fullWidth
        disabled={busy !== null}
        onClick={() => complete("failure")}
        icon={busy === "failure" ? <Loader2 className="size-4 animate-spin" /> : <XCircle className="size-4" />}
      >
        {t("payments.dummyCheckout.simulateFailure", "Simulate Failure")}
      </Button>
    </div>
  );
}
