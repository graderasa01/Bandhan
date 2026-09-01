import { redirect } from "next/navigation";
import { requirePartner } from "@/lib/auth/requirePartner";
import PartnerShell from "@/components/layout/PartnerShell";
import { getActivePartnerCode } from "@/components/partner/_shared/getActivePartnerCode";
import ListingEditor from "@/components/marketplace/ListingEditor";
import { getListing } from "@/lib/services/marketplace/partnerListingService";

export const dynamic = "force-dynamic";

export default async function PartnerListingPage() {
  const { partner, redirectTo } = await requirePartner(["APPROVED", "ACTIVE"]);
  if (!partner) redirect(redirectTo);

  const [listing, partnerCode] = await Promise.all([
    getListing(partner.id),
    getActivePartnerCode(partner.id),
  ]);

  return (
    <PartnerShell partnerName={partner.fullName} partnerCode={partnerCode}>
      <ListingEditor
        initialListing={{
          isListed: listing.profile?.isListed ?? false,
          headline: listing.profile?.headline ?? "",
          about: listing.profile?.about ?? "",
          languages: listing.profile?.languages ?? [],
          cities: listing.areas.map((a) => a.city),
          acceptingBookings: listing.availability?.acceptingBookings ?? true,
          weeklyCapacity: listing.availability?.weeklyCapacity ?? 5,
          capacityNote: listing.availability?.note ?? "",
          approved: Boolean(listing.profile?.approvedAt),
          rejectionNote: listing.profile?.rejectionNote ?? null,
          awaitingReview: Boolean(listing.profile?.isListed) && !listing.profile?.approvedAt,
          readinessMissing: listing.readiness.missing,
        }}
        initialServices={listing.services.map((s) => ({
          kind: s.kind,
          name: s.name,
          scope: s.scope ?? "",
          deliverables: s.deliverables,
          priceInPaise: s.priceInPaise,
          deliveryDays: s.deliveryDays,
          isActive: s.isActive,
        }))}
      />
    </PartnerShell>
  );
}
