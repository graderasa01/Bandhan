"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Wallet } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

/**
 * The balance tiles plus the one button that asks for the money.
 *
 * Three numbers, not one, because "kitna mila" has three honest answers and
 * collapsing them is what makes a partner think they are owed more than they
 * are: what they can take now, what is still inside the refund window (with
 * the date it unlocks — a real date, never "kuch din me"), and what is already
 * on its way.
 */
export default function WithdrawPanel({
  available,
  held,
  inFlight,
  paid,
  nextUnlock,
  minimum,
  canRequest,
  blockedReason,
}: {
  available: string;
  held: string;
  inFlight: string;
  paid: string;
  /** Pre-formatted date the oldest held commission unlocks; null when nothing is held. */
  nextUnlock: string | null;
  minimum: string;
  canRequest: boolean;
  blockedReason: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function request() {
    setBusy(true);
    try {
      const res = await fetch("/api/partner/withdrawals", { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Request nahi ja payi", description: json.message, tone: "error" });
        return;
      }
      toast({
        title: "Withdrawal request bhej di",
        description: "Admin approve karega, phir bank me paisa aayega.",
        tone: "success",
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card variant="default" padding="lg">
      <h2 className="text-base font-semibold text-wine-700">Aapki kamai</h2>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Withdraw kar sakte hain" value={available} strong />
        <Tile label={nextUnlock ? `Hold par · ${nextUnlock} tak` : "Hold par"} value={held} />
        <Tile label="Bheja ja raha hai" value={inFlight} />
        <Tile label="Ab tak mila" value={paid} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <Button size="md" variant="primary" disabled={!canRequest || busy} loading={busy} onClick={request}>
          <Wallet className="size-4" aria-hidden />
          Withdraw
        </Button>
        <p className="text-[0.8125rem] text-muted">
          {blockedReason ?? `Aapka poora available balance ek saath request ho jaayega.`}
        </p>
      </div>

      <p className="mt-2 text-xs text-subtle">
        Har payment ke baad commission {" "}
        <strong>refund window</strong> me hold rehti hai — us waqt tak koi refund ho sakta hai. Window khatam hote hi
        wo apne aap withdraw karne layak ho jaati hai. Minimum {minimum}.
      </p>
    </Card>
  );
}

function Tile({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-md bg-bg-subtle px-3 py-2.5 text-center">
      <p className={strong ? "text-xl font-bold leading-none text-wine-700" : "text-lg font-semibold leading-none text-ink"}>
        {value}
      </p>
      <p className="mt-1.5 text-[0.6875rem] leading-snug text-muted">{label}</p>
    </div>
  );
}
