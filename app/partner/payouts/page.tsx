import { redirect } from "next/navigation";
import { requirePartner } from "@/lib/auth/requirePartner";
import { prisma } from "@/lib/db/prisma";
import { getPartnerPayoutStatus } from "@/lib/data/partnerData";
import { paiseToRupeeDisplay } from "@/lib/utils/money";
import PartnerShell from "@/components/layout/PartnerShell";
import PayoutStatusCard from "@/components/partner/PayoutStatusCard";
import Card from "@/components/ui/Card";
import Pill from "@/components/ui/Pill";

export default async function PartnerPayoutsPage() {
  const { partner, redirectTo } = await requirePartner(["APPROVED", "ACTIVE", "INACTIVE"]);
  if (!partner) redirect(redirectTo);

  const [code, data] = await Promise.all([
    prisma.referralCode.findFirst({ where: { partnerId: partner.id, active: true }, select: { code: true } }),
    getPartnerPayoutStatus(partner.id),
  ]);

  return (
    <PartnerShell partnerName={partner.fullName} partnerCode={code?.code ?? null}>
      <div className="mx-auto max-w-2xl">
        <section className="mb-6">
          <h1 className="text-2xl font-bold text-wine-700">Payouts</h1>
          <p className="mt-2 text-sm text-muted">Approve hui commission ka payout status yahan dikhega.</p>
        </section>

        <PayoutStatusCard
          eligibleAmount={paiseToRupeeDisplay(data.readyPaise)}
          paidAmount={paiseToRupeeDisplay(data.totalPaidPaise)}
          status={
            data.readyPaise > 0 ? "Ready" : data.totalPaidPaise > 0 ? "Paid" : "Pending"
          }
          lastPayoutDate={data.history[0]?.paidAt}
        />

        <h2 className="mb-3 mt-6 text-lg font-semibold text-ink">Pichle payouts</h2>
        {data.history.length === 0 ? (
          <Card variant="soft" padding="lg" className="text-center">
            <p className="font-semibold text-ink">Abhi koi payout nahi hua.</p>
            <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted">
              Commission approve hone ke baad, admin verification se payout hota hai.
            </p>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {data.history.map((row) => (
              <Card key={row.commissionId} padding="sm" className="flex items-center justify-between gap-3">
                <p className="text-[0.8125rem] text-muted">{row.paidAt}</p>
                <div className="flex shrink-0 items-center gap-2.5">
                  <p className="text-[0.9375rem] font-bold text-wine-700">{paiseToRupeeDisplay(row.amountPaise)}</p>
                  <Pill tone="trust" size="sm">
                    Mil gaya
                  </Pill>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </PartnerShell>
  );
}
