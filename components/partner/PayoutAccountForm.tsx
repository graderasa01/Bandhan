"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Landmark, ShieldAlert, Smartphone } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Pill from "@/components/ui/Pill";
import { Select } from "@/components/ui/Controls";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/components/i18n/LanguageProvider";

export type PayoutAccountCurrent = {
  method: "UPI" | "BANK";
  accountHolderName: string;
  maskedTarget: string;
  ifsc: string | null;
  bankName: string | null;
  verified: boolean;
  rejectedNote: string | null;
} | null;

/**
 * Where the money should go.
 *
 * Two things this screen never does: show a stored account number back (the
 * server only ever sends the last four), and let details change while a
 * withdrawal is in flight (the API 409s — the destination of money already
 * approved must not move underneath it).
 *
 * Re-saving always clears verification. That is deliberate friction: without
 * it, a verified account could be swapped for someone else's after the check.
 */
export default function PayoutAccountForm({
  current,
  locked,
}: {
  current: PayoutAccountCurrent;
  /** A withdrawal is open — editing is refused server-side, so the form says why up front. */
  locked: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const { toast } = useToast();

  const [editing, setEditing] = useState(current === null);
  const [method, setMethod] = useState<"UPI" | "BANK">(current?.method ?? "UPI");
  const [holder, setHolder] = useState(current?.accountHolderName ?? "");
  const [upiId, setUpiId] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [ifsc, setIfsc] = useState(current?.ifsc ?? "");
  const [bankName, setBankName] = useState(current?.bankName ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const body =
        method === "UPI"
          ? { method, accountHolderName: holder, upiId }
          : { method, accountHolderName: holder, accountNumber, ifsc, bankName: bankName || null };

      const res = await fetch("/api/partner/payout-account", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: t("partner.payoutAccount.saveError", "Save nahi hua"), description: json.message, tone: "error" });
        return;
      }
      // Cleared immediately — no reason for an account number to sit in React
      // state once it has been stored.
      setUpiId("");
      setAccountNumber("");
      setEditing(false);
      toast({
        title: t("partner.payoutAccount.saveSuccessTitle", "Details save ho gayi"),
        description: t("partner.payoutAccount.saveSuccessDesc", "Admin verify karega, phir withdraw kar paayenge."),
        tone: "success",
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const valid =
    holder.trim().length >= 2 &&
    (method === "UPI" ? /^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(upiId.trim()) : /^\d{6,20}$/.test(accountNumber.replace(/\s/g, "")) && /^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(ifsc.trim()));

  return (
    <Card variant="default" padding="lg">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-wine-700">
            {t("partner.payoutAccount.title", "Paisa kahan bhejein")}
          </h2>
          <p className="mt-1 text-[0.8125rem] text-muted">
            {t(
              "partner.payoutAccount.subtitle",
              "Account number encrypted rehta hai — screen par sirf aakhri 4 ank dikhte hain.",
            )}
          </p>
        </div>
        {current && (
          <Pill tone={current.verified ? "trust" : "gold"} size="sm">
            {current.verified
              ? t("partner.payoutAccount.verified", "Verified")
              : t("partner.payoutAccount.pendingVerification", "Verify hona baaki")}
          </Pill>
        )}
      </div>

      {current?.rejectedNote && (
        <div className="mt-3 flex items-start gap-2 rounded-md bg-danger-bg px-3 py-2">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
          <p className="text-[0.8125rem] text-danger">{current.rejectedNote}</p>
        </div>
      )}

      {current && !editing && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <div className="flex items-center gap-2.5">
            {current.method === "UPI" ? (
              <Smartphone className="size-5 text-trust" aria-hidden />
            ) : (
              <Landmark className="size-5 text-trust" aria-hidden />
            )}
            <div>
              <p className="font-medium text-ink">
                {current.accountHolderName} · <span className="font-mono">{current.maskedTarget}</span>
              </p>
              <p className="text-[0.8125rem] text-muted">
                {current.method === "UPI"
                  ? t("partner.payoutAccount.upi", "UPI")
                  : [current.bankName, current.ifsc].filter(Boolean).join(" · ") ||
                    t("partner.payoutAccount.bankAccount", "Bank account")}
              </p>
            </div>
          </div>
          <Button size="sm" variant="secondary" disabled={locked} onClick={() => setEditing(true)}>
            {t("partner.payoutAccount.change", "Change")}
          </Button>
        </div>
      )}

      {locked && (
        <p className="mt-3 text-[0.8125rem] text-muted">
          {t(
            "partner.payoutAccount.lockedNote",
            "Ek withdrawal chal rahi hai — wo poori hone ke baad hi details badal sakte hain.",
          )}
        </p>
      )}

      {editing && !locked && (
        <div className="mt-4 flex flex-col gap-2 border-t border-line pt-4">
          <Select
            selectSize="sm"
            value={method}
            onChange={(e) => setMethod(e.target.value as "UPI" | "BANK")}
            options={[
              { value: "UPI", label: t("partner.payoutAccount.upi", "UPI") },
              { value: "BANK", label: t("partner.payoutAccount.bankAccount", "Bank account") },
            ]}
          />
          <Input
            inputSize="sm"
            label={t("partner.payoutAccount.holderLabel", "Account holder ka naam")}
            placeholder={t("partner.payoutAccount.holderPlaceholder", "Jaise bank me likha hai")}
            value={holder}
            onChange={(e) => setHolder(e.target.value)}
          />
          {method === "UPI" ? (
            <Input
              inputSize="sm"
              label={t("partner.payoutAccount.upiIdLabel", "UPI id")}
              placeholder={t("partner.payoutAccount.upiIdPlaceholder", "naam@bank")}
              autoComplete="off"
              value={upiId}
              onChange={(e) => setUpiId(e.target.value)}
            />
          ) : (
            <>
              <Input
                inputSize="sm"
                label={t("partner.payoutAccount.accountNumberLabel", "Account number")}
                inputMode="numeric"
                autoComplete="off"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
              />
              <Input
                inputSize="sm"
                label={t("partner.payoutAccount.ifscLabel", "IFSC")}
                placeholder={t("partner.payoutAccount.ifscPlaceholder", "SBIN0001234")}
                autoComplete="off"
                value={ifsc}
                onChange={(e) => setIfsc(e.target.value.toUpperCase())}
              />
              <Input
                inputSize="sm"
                label={t("partner.payoutAccount.bankNameLabel", "Bank ka naam (optional)")}
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
              />
            </>
          )}

          <div className="mt-1 flex flex-wrap gap-2">
            <Button size="sm" variant="primary" disabled={!valid || busy} loading={busy} onClick={save}>
              {t("partner.payoutAccount.saveButton", "Save Details")}
            </Button>
            {current && (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEditing(false)}>
                {t("partner.payoutAccount.cancelButton", "Cancel")}
              </Button>
            )}
          </div>
          <p className="flex items-start gap-1.5 text-xs text-subtle">
            <BadgeCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {t(
              "partner.payoutAccount.footerNote",
              "Save karne ke baad admin ek baar check karega. Details badalne par verification dobara hoga.",
            )}
          </p>
        </div>
      )}
    </Card>
  );
}
