import type { Metadata } from "next";
import PublicShell from "@/components/layout/PublicShell";
import PartnerBrowser from "@/components/marketplace/PartnerBrowser";
import { getMarketplaceFacets, searchPartners } from "@/lib/services/marketplace/marketplaceSearchService";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Verified partners — BandhanTak",
  description:
    "Verified pandit ji, marriage bureau aur rishta consultants. Har service ki keemat, deliverable aur refund ka niyam pehle se saaf.",
};

/**
 * The public marketplace.
 *
 * Deliberately reachable without a login. A shopfront that demands an account
 * before it will show who is available is a shopfront nobody finds, and there
 * is nothing member-owned on this page to protect — see
 * `marketplaceSearchService`'s note on what a card may contain. Booking is
 * where authentication starts to matter, and that is where it is required.
 */
export default async function PartnersPage() {
  const [partners, facets] = await Promise.all([searchPartners(), getMarketplaceFacets()]);

  return (
    <PublicShell>
      <PartnerBrowser initialPartners={partners} facets={facets} />
    </PublicShell>
  );
}
