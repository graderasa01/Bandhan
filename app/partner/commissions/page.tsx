import { redirect } from "next/navigation";
import { requirePartner } from "@/lib/auth/requirePartner";
import { prisma } from "@/lib/db/prisma";
import { getPartnerCommissions } from "@/lib/data/partnerData";
import { paiseToRupeeDisplay } from "@/lib/utils/money";
import PartnerShell from "@/components/layout/PartnerShell";
import Card from "@/components/ui/Card";
import Pill from "@/components/ui/Pill";
import type { PartnerCommissionStatusLabel } from "@/lib/contracts/partner";

const STATUS_TONE: Record<PartnerCommissionStatusLabel, "gold" | "trust" | "danger"> = {
  "Aane wala": "gold",
  "Mil gaya": "trust",
  Cancel: "danger",
};

export default async function PartnerCommissionsPage() {
  const { partner, redirectTo } = await requirePartner(["APPROVED", "ACTIVE", "INACTIVE"]);
  if (!partner) redirect(redirectTo);

  const [code, data] = await Promise.all([
    prisma.referralCode.findFirst({ where: { partnerId: partner.id, active: true }, select: { code: true } }),
    getPartnerCommissions(partner.id),
  ]);

  return (
    <PartnerShell partnerName={partner.fullName} partnerCode={code?.code ?? null}>
      <div className="mx-auto max-w-2xl">
        <section className="mb-6">
          <h1 className="text-2xl font-bold text-wine-700">Commissions</h1>
          <p className="mt-2 text-sm text-muted">Aapke referral se liye gaye plans ki commission yahan dikhegi.</p>
        </section>

        <div className="mb-6 grid grid-cols-2 gap-3">
          <Card variant="soft" padding="md" className="text-center">
            <p className="text-[2rem] font-bold leading-none text-wine-700">
              {paiseToRupeeDisplay(data.summary.earnedPaise)}
            </p>
            <p className="mt-1.5 text-[0.8125rem] text-muted">Total mila</p>
          </Card>
          <Card variant="soft" padding="md" className="text-center">
            <p className="text-[2rem] font-bold leading-none text-wine-700">
              {paiseToRupeeDisplay(data.summary.pendingPaise)}
            </p>
            <p className="mt-1.5 text-[0.8125rem] text-muted">Aane wala</p>
          </Card>
        </div>

        {data.rows.length === 0 ? (
          <Card variant="soft" padding="lg" className="text-center">
            <p className="font-semibold text-ink">Abhi koi commission nahi bani.</p>
            <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted">
              Jaise hi aapke referral se koi plan lega, commission yahan dikhegi.
            </p>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {data.rows.map((row) => (
              <Card key={row.commissionId} padding="sm" className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{row.firstName}</p>
                  <p className="mt-0.5 text-[0.75rem] text-subtle">{row.paidAt ?? row.createdAt}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2.5">
                  <p className="text-[0.9375rem] font-bold text-wine-700">{paiseToRupeeDisplay(row.amountPaise)}</p>
                  <Pill tone={STATUS_TONE[row.statusLabel]} size="sm">
                    {row.statusLabel}
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
