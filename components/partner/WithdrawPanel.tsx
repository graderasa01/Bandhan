"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Wallet } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * The balance tiles plus the one button that asks for the money.
 *
 * Three numbers, not one, because "kitna mila" has three honest answers and
 * collapsing them is what makes a partner think they are owed more than they
 * are: what they can take now, what is already on its way, and what has
 * already landed.
 *
 * There used to be a fourth — "Hold par", the refund window — with the date it
 * unlocked. That hold was removed on 2026-08-26, so the tile would now always
 * read ₹0 and the date would always be absent. A permanently empty tile is
 * worse than no tile: it invites the question "why is my money on hold" about
 * money that isn't.
 */
export default function WithdrawPanel({
  available,
  inFlight,
  owed,
  paid,
  minimum,
  canRequest,
  blockedReason,
}: {
  available: string;
  inFlight: string;
  /** Outstanding recoveries, pre-formatted. Absent when there are none. */
  owed?: string | null;
  paid: string;
  minimum: string;
  canRequest: boolean;
  blockedReason: string | null;
}) {
  const t = useT();
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function request() {
    setBusy(true);
    try {
      const res = await fetch("/api/partner/withdrawals", { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: t("partner.withdraw.requestErrorTitle", "Request nahi ja payi"), description: json.message, tone: "error" });
        return;
      }
      toast({
        title: t("partner.withdraw.requestSuccessTitle", "Withdrawal request bhej di"),
        description: t("partner.withdraw.requestSuccessDesc", "Admin approve karega, phir bank me paisa aayega."),
        tone: "success",
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card variant="default" padding="lg">
      <h2 className="text-base font-semibold text-wine-700">{t("partner.withdraw.heading", "Aapki kamai")}</h2>

      <div className={`mt-3 grid gap-3 ${owed ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}>
        <Tile label={t("partner.withdraw.tileAvailable", "Withdraw kar sakte hain")} value={available} strong />
        <Tile label={t("partner.withdraw.tileInFlight", "Bheja ja raha hai")} value={inFlight} />
        <Tile label={t("partner.withdraw.tilePaid", "Ab tak mila")} value={paid} />
        {/* Only when there is one. A permanent "₹0 owed" tile would teach every
            partner that owing the platform money is a normal state. */}
        {owed && <Tile label={t("partner.withdraw.tileOwed", "Refund ki wajah se katega")} value={owed} />}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <Button size="md" variant="primary" disabled={!canRequest || busy} loading={busy} onClick={request}>
          <Wallet className="size-4" aria-hidden />
          {t("partner.withdraw.withdrawButton", "Withdraw")}
        </Button>
        <p className="text-[0.8125rem] text-muted">
          {blockedReason ??
            t("partner.withdraw.fullBalanceNote", "Aapka poora available balance ek saath request ho jaayega.")}
        </p>
      </div>

      <p className="mt-2 text-xs text-subtle">
        {t(
          "partner.withdraw.footerNote",
          "Commission turant withdraw karne layak hoti hai — koi intezaar nahi. Minimum",
        )}{" "}
        {minimum}
        {t(
          "partner.withdraw.footerNoteTail",
          ". Request bhejne par admin check karke aapke bank ya UPI me paisa bhej dega.",
        )}
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
