import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getAdminPartnerDetail } from "@/lib/services/partner/adminPartnerDetail";
import { TIER_LABEL } from "@/lib/partner/tier";
import AdminShell from "@/components/layout/AdminShell";
import PartnerDetailView from "@/components/admin/PartnerDetailView";

function fmt(d: Date): string {
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default async function AdminPartnerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) redirect(`/admin/login?next=/admin/partners/${id}`);
  // Same bar as the queue itself (M10 §23): SUPPORT may read, only ADMIN acts.
  if (user.role !== "ADMIN" && user.role !== "SUPPORT") redirect("/");

  const partner = await getAdminPartnerDetail(id);
  if (!partner) notFound();

  return (
    <AdminShell adminName={user.fullName}>
      <div className="mx-auto max-w-4xl">
        <Link
          href="/admin/partners"
          className="mb-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Saare partners
        </Link>

        <PartnerDetailView
          id={partner.id}
          userId={partner.userId}
          fullName={partner.fullName}
          maskedMobile={partner.maskedMobile}
          maskedEmail={partner.maskedEmail}
          city={partner.city}
          state={partner.state}
          partnerType={partner.partnerType}
          organizationName={partner.organizationName}
          experienceYears={partner.experienceYears}
          expectedMonthlyReferrals={partner.expectedMonthlyReferrals}
          knownCommunityOrArea={partner.knownCommunityOrArea}
          notesFromPartner={partner.notesFromPartner}
          status={partner.status}
          rejectionReason={partner.rejectionReason}
          suspensionReason={partner.suspensionReason}
          autoOutreachEnabled={partner.autoOutreachEnabled}
          appliedAt={fmt(partner.appliedAt)}
          timeline={partner.timeline.map((t) => ({ label: t.label, at: fmt(t.at), by: t.by }))}
          activeCode={partner.activeCode}
          clickCount={partner.clickCount}
          leadCount={partner.leadCount}
          subscribedCount={partner.subscribedCount}
          leads={partner.leads.map((l) => ({ ...l, joinedAt: fmt(l.joinedAt) }))}
          paidConversions={partner.paidConversions}
          tier={partner.tier.tier}
          tierRemaining={partner.tier.remaining}
          nextTier={partner.tier.nextTier ? TIER_LABEL[partner.tier.nextTier] : null}
          effectiveBps={partner.effectiveBps}
          tierBps={partner.tierBps}
          commissionBpsOverride={partner.commissionBpsOverride}
          earnings={partner.earnings}
          recentCommissions={partner.recentCommissions.map((c) => ({
            id: c.id,
            amountPaise: c.amountPaise,
            basePaise: c.basePaise,
            percentBpsApplied: c.percentBpsApplied,
            status: c.status,
            createdAt: fmt(c.createdAt),
          }))}
          outreach={partner.outreach.map((o) => ({
            channel: o.channel,
            templateKey: o.templateKey,
            status: o.status,
            createdAt: fmt(o.createdAt),
          }))}
          invites={partner.invites.map((i) => ({
            fullName: i.fullName,
            status: i.status,
            createdAt: fmt(i.createdAt),
          }))}
          canManage={user.role === "ADMIN"}
        />
      </div>
    </AdminShell>
  );
}
