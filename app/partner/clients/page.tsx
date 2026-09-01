import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { requirePartner } from "@/lib/auth/requirePartner";
import PartnerShell from "@/components/layout/PartnerShell";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { getActivePartnerCode } from "@/components/partner/_shared/getActivePartnerCode";
import DraftList from "@/components/managed/DraftList";
import ActiveClientList from "@/components/clientDesk/ActiveClientList";
import { listClientsForPartner } from "@/lib/services/clientDesk/clientDeskService";
import { getPartnerDraftEligibility } from "@/lib/services/managedProfile/managedEligibility";
import { listDraftsForCreator } from "@/lib/services/managedProfile/managedDraftService";
import { DRAFT_CREATOR_PARTNER_STATUSES } from "@/lib/services/managedProfile/managedEligibility";

export const dynamic = "force-dynamic";

/**
 * The partner's client desk.
 *
 * `requirePartner` gates the page and `getPartnerDraftEligibility` gates the
 * *work* — a partner who is in an allowed status but whose contact is not
 * verified reaches the screen and is told exactly what to fix, rather than
 * being bounced somewhere with no explanation.
 */
export default async function PartnerClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { user, partner, redirectTo } = await requirePartner([...DRAFT_CREATOR_PARTNER_STATUSES]);
  if (!partner || !user) redirect(redirectTo);

  const [eligibility, partnerCode] = await Promise.all([
    getPartnerDraftEligibility(user.id),
    getActivePartnerCode(partner.id),
  ]);

  if (!eligibility.ok) {
    return (
      <PartnerShell partnerName={partner.fullName} partnerCode={partnerCode}>
        <div className="mx-auto max-w-md">
          <Card variant="warning" padding="lg" className="text-center">
            <ShieldAlert className="mx-auto size-10 text-warn" aria-hidden />
            <h1 className="mt-3 text-xl font-semibold text-ink">Ek step baaki hai</h1>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">{eligibility.message}</p>
            {eligibility.ctaHref && (
              <div className="mt-5">
                <Link href={eligibility.ctaHref}>
                  <Button>Continue</Button>
                </Link>
              </div>
            )}
          </Card>
        </div>
      </PartnerShell>
    );
  }

  const { tab } = await searchParams;
  const activeTab = tab === "active" ? "active" : "drafts";

  const [drafts, clients] = await Promise.all([
    listDraftsForCreator(user.id),
    listClientsForPartner(partner.id),
  ]);

  return (
    <PartnerShell partnerName={partner.fullName} partnerCode={partnerCode}>
      <div className="mx-auto max-w-2xl">
        {/* Server-rendered tabs — two links, no client bundle. Drafts are
            people who have not claimed yet; Active clients are people who did
            and then chose to keep this partner on. The two are genuinely
            different relationships and the counts make that visible. */}
        <div className="mb-5 flex gap-2">
          <TabLink href="/partner/clients" active={activeTab === "drafts"} label={`Drafts (${drafts.length})`} />
          <TabLink
            href="/partner/clients?tab=active"
            active={activeTab === "active"}
            label={`Active clients (${clients.length})`}
          />
        </div>
      </div>

      {activeTab === "active" ? (
        <div className="mx-auto max-w-2xl">
          <ActiveClientList clients={clients} />
        </div>
      ) : (
        <DraftList
          drafts={drafts}
          newHref="/partner/clients/new"
          detailHrefPrefix="/partner/clients"
          title="Clients"
          ctaLabel="New Client Draft"
          emptyBody="Client ki details aap yahan tayyar kar sakte hain. Unhe ek claim link bhejiye — profile tabhi live hoti hai jab wo khud claim aur confirm karein."
        />
      )}
    </PartnerShell>
  );
}

function TabLink({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={
        active
          ? "min-h-12 rounded-full border border-transparent bg-gradient-to-r from-gold-400 to-gold-600 px-4 py-3 text-sm font-medium text-primary-fg"
          : "min-h-12 rounded-full border border-line-strong bg-surface px-4 py-3 text-sm font-medium text-ink"
      }
    >
      {label}
    </Link>
  );
}
