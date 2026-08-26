import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowRight, ShieldAlert } from "lucide-react";
import { requirePartner } from "@/lib/auth/requirePartner";
import { getKycGate, getPartnerKycView } from "@/lib/services/payouts/kycService";
import {
  getPartnerBalance,
  getPayoutAccount,
  listPartnerWithdrawals,
} from "@/lib/services/payouts/payoutService";
import { paiseToRupeeDisplay } from "@/lib/utils/money";
import PartnerShell from "@/components/layout/PartnerShell";
import KycPanel from "@/components/partner/KycPanel";
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

  const [partnerCode, balance, account, withdrawals, kyc, kycGate] = await Promise.all([
    getActivePartnerCode(partner.id),
    getPartnerBalance(partner.id),
    getPayoutAccount(partner.id),
    listPartnerWithdrawals(partner.id),
    getPartnerKycView(partner.id),
    getKycGate(partner.id),
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

        {balance.contactVerificationNeeded && (
          <Card variant="default" padding="lg" className="border-gold-500 ring-1 ring-gold-500/30">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 size-5 shrink-0 text-gold-600" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink">Pehle contact verify kariye</p>
                <p className="mt-1 text-sm text-muted">
                  Paisa bhejne se pehle hum ye pakka karte hain ki aap tak pahuncha ja sake. Ek baar ka kaam hai.
                </p>
                <Link
                  href="/partner/verify-contact"
                  className="mt-3 inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-5 text-[0.8125rem] font-semibold text-primary-fg transition-colors hover:bg-primary-hover"
                >
                  Verify Now
                  <ArrowRight className="size-4" />
                </Link>
              </div>
            </div>
          </Card>
        )}

        <WithdrawPanel
          available={paiseToRupeeDisplay(balance.availablePaise)}
          inFlight={paiseToRupeeDisplay(balance.inFlightPaise)}
          paid={paiseToRupeeDisplay(balance.paidPaise)}
          minimum={paiseToRupeeDisplay(balance.minWithdrawalPaise)}
          canRequest={balance.canRequest}
          blockedReason={balance.blockedReason}
        />

        {/* Bank/UPI details first: this is the only one of the two that can
            stop a withdrawal. KYC follows it as the optional extra it now is —
            putting the optional form above the required one was fine when both
            were mandatory and is misleading now. */}
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

        <KycPanel
          state={{
            status: kyc.status,
            legalName: kyc.legalName,
            panMasked: kyc.panMasked,
            panOnFile: kyc.panOnFile,
            rejectionNote: kyc.rejectionNote,
            required: kycGate.required,
            documents: kyc.documents.map((d) => ({
              id: d.id,
              kind: d.kind,
              status: d.status,
              uploadedAt: fmt(d.uploadedAt),
              rejectionNote: d.rejectionNote,
            })),
          }}
        />

        <section>
          <h2 className="mb-3 text-lg font-semibold text-ink">Withdrawal history</h2>
          {withdrawals.length === 0 ? (
            <Card variant="soft" padding="lg" className="text-center">
              <p className="font-semibold text-ink">Abhi tak koi withdrawal nahi hui.</p>
              <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted">
                Bank ya UPI detail bhar kar ₹{Math.round(balance.minWithdrawalPaise / 100)} se upar ka balance kabhi
                bhi withdraw kar sakte hain.
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
