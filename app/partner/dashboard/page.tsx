import Link from "next/link";
import { redirect } from "next/navigation";
import { Lightbulb } from "lucide-react";
import { requirePartner } from "@/lib/auth/requirePartner";
import { getPartnerDashboardData } from "@/lib/data/partnerData";
import PartnerShell from "@/components/layout/PartnerShell";
import LeadRow from "@/components/partner/LeadRow";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";

export default async function PartnerDashboardPage() {
  const { partner, redirectTo } = await requirePartner(["APPROVED", "ACTIVE", "INACTIVE"]);
  if (!partner) redirect(redirectTo);

  const data = await getPartnerDashboardData(partner);

  return (
    <PartnerShell partnerName={data.partner.displayName} partnerCode={data.partner.partnerCode}>
      <div className="mx-auto max-w-3xl">
        <section className="mb-6">
          <h1 className="text-2xl font-bold text-wine-700">Dashboard</h1>
          <p className="mt-2 text-sm text-muted">{data.conversionSentence}</p>
        </section>

        {/* 2×2 per M12 spec §1 — money sits alongside the counts, not buried on another screen. */}
        <div className="mb-6 grid grid-cols-2 gap-3">
          {data.metrics.map((m) => (
            <Card key={m.label} variant="soft" padding="md" className="text-center">
              {/* ≥32px per M12 — these get read across a shop counter. */}
              <p className="text-[2rem] font-bold leading-none text-wine-700">{m.value}</p>
              <p className="mt-1.5 text-[0.8125rem] text-muted">{m.label}</p>
            </Card>
          ))}
        </div>

        {data.insight && (
          <Card variant="trust" padding="md" className="mb-6">
            <div className="flex items-start gap-2.5">
              <Lightbulb className="mt-0.5 size-4 shrink-0 text-trust" />
              <div>
                <p className="font-semibold text-ink">{data.insight.title}</p>
                <p className="mt-0.5 text-sm text-muted">{data.insight.message}</p>
              </div>
            </div>
          </Card>
        )}

        <section className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-ink">Recent leads</h2>
            {data.leads.length > 0 && (
              <Link
                href="/partner/leads"
                className="text-sm font-semibold text-primary-text underline underline-offset-2"
              >
                Sab dekhein
              </Link>
            )}
          </div>

          {data.leads.length === 0 ? (
            <Card variant="soft" padding="lg" className="text-center">
              <p className="font-semibold text-ink">Abhi tak koi log nahi aaye.</p>
              <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted">
                Apna referral code ya link share karein — jo log uske through join karenge wo yahan dikhenge.
              </p>
              <div className="mt-4">
                <Link href="/partner/referral-tools">
                  <Button variant="primary" size="md">
                    Referral tools kholein
                  </Button>
                </Link>
              </div>
            </Card>
          ) : (
            <div className="flex flex-col gap-2">
              {data.leads.map((lead) => (
                <LeadRow key={lead.leadId} lead={lead} partnerName={data.partner.displayName} />
              ))}
            </div>
          )}
        </section>

        <Card variant="soft" padding="md">
          <p className="text-xs text-muted">
            🛡 Privacy: aapko sirf pehla naam, city aur progress dikhta hai. Members ke contact details, photo ya
            unki activity kabhi share nahi ki jaati.
          </p>
        </Card>
      </div>
    </PartnerShell>
  );
}
