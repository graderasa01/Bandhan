import { redirect } from "next/navigation";
import { requirePartner } from "@/lib/auth/requirePartner";
import {
  getPartnerBalance,
  getPayoutAccount,
  listPartnerWithdrawals,
} from "@/lib/services/payouts/payoutService";
import { paiseToRupeeDisplay } from "@/lib/utils/money";
import PartnerShell from "@/components/layout/PartnerShell";
import PayoutAccountForm from "@/components/partner/PayoutAccountForm";
import WithdrawPanel from "@/components/partner/WithdrawPanel";
import { getActivePartnerCode } from "@/components/partner/_shared/getActivePartnerCode";
import Card from "@/components/ui/Card";
import Pill from "@/components/ui/Pill";

const STATUS_LABEL: Record<string, { label: string; tone: "trust" | "gold" | "danger" | "neutral" }> = {
  REQUESTED: { label: "Request bheji", tone: "gold" },
  APPROVED: { label: "Approve ho gayi", tone: "gold" },
  PAID: { label: "Mil gaya", tone: "trust" },
  REJECTED: { label: "Reject", tone: "danger" },
};

function fmt(d: Date): string {
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default async function PartnerPayoutsPage() {
  const { partner, redirectTo } = await requirePartner(["APPROVED", "ACTIVE", "INACTIVE"]);
  if (!partner) redirect(redirectTo);

  const [partnerCode, balance, account, withdrawals] = await Promise.all([
    getActivePartnerCode(partner.id),
    getPartnerBalance(partner.id),
    getPayoutAccount(partner.id),
    listPartnerWithdrawals(partner.id),
  ]);

  const withdrawalOpen = withdrawals.some((w) => w.status === "REQUESTED" || w.status === "APPROVED");

  return (
    <PartnerShell partnerName={partner.fullName} partnerCode={partnerCode}>
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <section>
          <h1 className="text-2xl font-bold text-wine-700">Payouts</h1>
          <p className="mt-2 text-sm text-muted">
            Apni kamai yahan se withdraw kariye. Paisa seedha aapke UPI ya bank account me jaayega.
          </p>
        </section>

        <WithdrawPanel
          available={paiseToRupeeDisplay(balance.availablePaise)}
          held={paiseToRupeeDisplay(balance.heldPaise)}
          inFlight={paiseToRupeeDisplay(balance.inFlightPaise)}
          paid={paiseToRupeeDisplay(balance.paidPaise)}
          nextUnlock={balance.nextUnlockAt ? fmt(balance.nextUnlockAt) : null}
          minimum={paiseToRupeeDisplay(balance.minWithdrawalPaise)}
          canRequest={balance.canRequest}
          blockedReason={balance.blockedReason}
        />

        <PayoutAccountForm
          locked={withdrawalOpen}
          current={
            account
              ? {
                  method: account.method,
                  accountHolderName: account.accountHolderName,
                  maskedTarget: account.maskedTarget,
                  ifsc: account.ifsc,
                  bankName: account.bankName,
                  verified: account.verifiedAt !== null,
                  rejectedNote: account.rejectedNote,
                }
              : null
          }
        />

        <section>
          <h2 className="mb-3 text-lg font-semibold text-ink">Withdrawal history</h2>
          {withdrawals.length === 0 ? (
            <Card variant="soft" padding="lg" className="text-center">
              <p className="font-semibold text-ink">Abhi tak koi withdrawal nahi hui.</p>
              <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted">
                Commission refund window ke baad withdraw karne layak ho jaati hai.
              </p>
            </Card>
          ) : (
            <div className="flex flex-col gap-2">
              {withdrawals.map((w) => {
                const s = STATUS_LABEL[w.status] ?? { label: w.status, tone: "neutral" as const };
                return (
                  <Card key={w.id} padding="md">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-[0.9375rem] font-bold text-wine-700">
                          {paiseToRupeeDisplay(w.amountPaise)}
                        </p>
                        <p className="text-[0.8125rem] text-muted">
                          {fmt(w.requestedAt)}
                          {w.paidAt ? ` · bheja ${fmt(w.paidAt)}` : ""}
                        </p>
                        {w.utr && <p className="text-xs text-subtle">Reference: {w.utr}</p>}
                        {w.rejectionReason && <p className="text-xs text-danger">{w.rejectionReason}</p>}
                      </div>
                      <Pill tone={s.tone} size="sm">
                        {s.label}
                      </Pill>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </PartnerShell>
  );
}
