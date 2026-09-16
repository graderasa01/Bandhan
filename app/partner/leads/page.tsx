import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePartner } from "@/lib/auth/requirePartner";
import { getPartnerLeads } from "@/lib/data/partnerData";
import { getT } from "@/lib/i18n/server";
import PartnerShell from "@/components/layout/PartnerShell";
import LeadRow from "@/components/partner/LeadRow";
import AutoOutreachToggle from "@/components/partner/AutoOutreachToggle";
import PartnerSpaceTabs from "@/components/partner/PartnerSpaceTabs";
import { getActivePartnerCode } from "@/components/partner/_shared/getActivePartnerCode";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";

export default async function PartnerLeadsPage() {
  const { partner, redirectTo } = await requirePartner(["APPROVED", "ACTIVE"]);
  if (!partner) redirect(redirectTo);

  const t = await getT();
  const [leads, partnerCode] = await Promise.all([
    getPartnerLeads(partner.id),
    getActivePartnerCode(partner.id),
  ]);

  return (
    <PartnerShell partnerName={partner.fullName} partnerCode={partnerCode}>
      <PartnerSpaceTabs space="families" current="/partner/leads" />
      <div className="mx-auto max-w-2xl">
        <section className="mb-6">
          <h1 className="text-2xl font-bold text-wine-700">{t("partnerPage.leads.title", "My Leads")}</h1>
          <p className="mt-2 text-base text-muted">
            {leads.length === 0
              ? t("partnerPage.leads.none", "Aapke referral se abhi tak koi join nahi hua.")
              : `${leads.length} ${t("partnerPage.leads.count", "log aapke referral se aaye hain.")}`}
          </p>
        </section>

        {leads.length === 0 ? (
          <Card variant="soft" padding="lg" className="mb-6 text-center">
            <p className="font-semibold text-ink">{t("partnerPage.leads.emptyTitle", "Abhi koi lead nahi hai.")}</p>
            <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted">
              {t(
                "partnerPage.leads.emptyBody",
                "Apna referral link ya QR share karein — jo log uske through register karenge wo yahan dikhenge.",
              )}
            </p>
            <div className="mt-4">
              <Link href="/partner/referral-tools">
                <Button variant="primary" size="md">
                  {t("partnerPage.leads.openReferralTools", "Open Referral Tools")}
                </Button>
              </Link>
            </div>
          </Card>
        ) : (
          <div className="mb-6 flex flex-col gap-2">
            {leads.map((lead) => (
              <LeadRow key={lead.leadId} lead={lead} partnerName={partner.fullName} />
            ))}
          </div>
        )}

        <div className="mb-4">
          <AutoOutreachToggle enabled={partner.autoOutreachEnabled} />
        </div>

        <Card variant="soft" padding="md">
          <p className="text-sm text-muted">
            🛡{" "}
            {t(
              "partnerPage.leads.privacy",
              "Members ki privacy suraksha ke liye aapko sirf pehla naam, city aur progress dikhaya jaata hai — contact details, photo ya unki activity kabhi nahi.",
            )}
          </p>
        </Card>
      </div>
    </PartnerShell>
  );
}
