"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import PlanCard from "./PlanCard";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/components/i18n/LanguageProvider";
import type { PlanPreviewViewModel } from "@/lib/contracts/publicPages";
import type { PlanCode } from "@/lib/constants/plans";

/**
 * The paid-plan grid on /user/subscription — real checkout, not a link.
 *
 * Kept as one client component (rather than a client button inside a server
 * grid) so only one place owns "which plan is mid-checkout" — a per-card busy
 * state means only the clicked card shows a spinner, not all three.
 */
export default function PlanCheckoutGrid({
  plans,
  currentPlanCode,
  isCurrentActive,
}: {
  plans: PlanPreviewViewModel[];
  currentPlanCode: PlanCode | null;
  isCurrentActive: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();
  const [busyPlan, setBusyPlan] = useState<string | null>(null);

  // Land here after the dummy checkout page redirects back.
  useEffect(() => {
    if (params.get("success") === "1") {
      toast({
        title: t("subscription.paymentSuccess", "Payment successful"),
        description: t("subscription.paymentSuccessNote", "Aapka plan turant active ho gaya hai."),
        tone: "success",
      });
      router.replace("/user/subscription");
    } else if (params.get("failed") === "1") {
      toast({
        title: t("subscription.paymentFailed", "Payment failed"),
        description: t("subscription.paymentFailedNote", "Kuch bhi charge nahi hua — dobara try kar sakte hain."),
        tone: "error",
      });
      router.replace("/user/subscription");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  async function checkout(planCode: string) {
    setBusyPlan(planCode);
    try {
      const res = await fetch("/api/subscriptions/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planCode: planCode.toUpperCase() }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Could not start checkout", description: json.message, tone: "error" });
        setBusyPlan(null);
        return;
      }
      window.location.href = json.checkoutUrl;
    } catch {
      toast({ title: "Network error", description: "Please try again.", tone: "error" });
      setBusyPlan(null);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
      {plans.map((plan) => (
        <PlanCard
          key={plan.id}
          plan={plan}
          isCurrent={isCurrentActive && currentPlanCode?.toLowerCase() === plan.id}
          onCtaClick={() => checkout(plan.id)}
          ctaBusy={busyPlan === plan.id}
          ctaLabel={`${t("subscription.choosePlan", "Choose")} ${plan.name}`}
          t={t}
        />
      ))}
    </div>
  );
}
