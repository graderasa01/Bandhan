"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import SubscriptionStatusCard from "./SubscriptionStatusCard";

type Status = "NONE" | "ACTIVE" | "CANCELLED" | "EXPIRED";

/**
 * Client wrapper so the server-rendered /user/subscription page can still
 * offer a real "Cancel Plan" action — cancellation takes effect at period
 * end, never immediately (see subscriptionService.cancelSubscription).
 */
export default function SubscriptionStatusPanel({
  planName,
  status,
  renewsOn,
  autoRenew,
}: {
  planName: string | null;
  status: Status;
  renewsOn?: string;
  autoRenew?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function cancel() {
    setBusy(true);
    try {
      const res = await fetch("/api/subscriptions/cancel", { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Could not cancel", description: json.message, tone: "error" });
        return;
      }
      toast({
        title: "Plan cancelled",
        description: "Aapka access period khatam hone tak chalta rahega.",
        tone: "success",
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <SubscriptionStatusCard
      planName={planName}
      status={status}
      renewsOn={renewsOn}
      autoRenew={autoRenew}
      onCancel={cancel}
      cancelling={busy}
    />
  );
}
