"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

/**
 * The à-la-carte grid on /user/subscription — one card per thing you can buy
 * once, next to (not inside) the plan grid.
 *
 * Deliberately does **not** own the post-payment toast: both gateways return
 * to `/user/subscription?success=1`, and `PlanCheckoutGrid` already reads that
 * param. Two components reacting to the same query string would fire two
 * toasts for one payment.
 *
 * An item the user cannot buy is shown, disabled, with the reason written out.
 * Hiding it would answer "why can't I see Discovery Week any more" with
 * silence, and the commonest reason for the block — "your plan already
 * includes this" — is good news worth saying out loud.
 */
export interface ServiceItemView {
  code: string;
  name: string;
  description: string;
  /** Already formatted, e.g. "₹149". */
  price: string;
  /** What you get, in one line, derived from the item's own config. */
  promise: string;
  buyable: boolean;
  blockedReason: string | null;
}

export default function ServiceItemGrid({ items }: { items: ServiceItemView[] }) {
  const { toast } = useToast();
  const [busyCode, setBusyCode] = useState<string | null>(null);

  async function buy(code: string) {
    setBusyCode(code);
    try {
      const res = await fetch("/api/items/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemCode: code }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Could not start checkout", description: json.message, tone: "error" });
        setBusyCode(null);
        return;
      }
      window.location.href = json.checkoutUrl;
    } catch {
      toast({ title: "Network error", description: "Please try again.", tone: "error" });
      setBusyCode(null);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <Card key={item.code} variant="default" padding="md" className="flex flex-col">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-[0.9375rem] font-semibold text-ink">{item.name}</h3>
            <span className="shrink-0 text-lg font-bold text-wine-700">{item.price}</span>
          </div>

          <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-muted">{item.description}</p>

          <p className="mt-3 rounded-md bg-bg-subtle px-3 py-2 text-[0.75rem] font-medium text-ink">
            {item.promise}
          </p>

          <div className="mt-4 flex-1" />

          {item.buyable ? (
            <Button
              variant="primary"
              size="sm"
              fullWidth
              loading={busyCode === item.code}
              disabled={busyCode !== null}
              onClick={() => buy(item.code)}
            >
              Buy {item.name}
            </Button>
          ) : (
            <p className="flex items-start gap-2 text-[0.75rem] leading-relaxed text-subtle">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>{item.blockedReason}</span>
            </p>
          )}
        </Card>
      ))}
    </div>
  );
}
