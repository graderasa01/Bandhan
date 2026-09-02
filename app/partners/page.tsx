import type { Metadata } from "next";
import PublicShell from "@/components/layout/PublicShell";
import PartnerBrowser from "@/components/marketplace/PartnerBrowser";
import { getMarketplaceFacets, searchPartnersWithCoverage } from "@/lib/services/marketplace/marketplaceSearchService";

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
/**
 * `?city=` is honoured on the server, not just in the client's filter state.
 *
 * Phase 7 gave this page two links that arrive with a city already chosen: the
 * "khulte hi bata dijiye" notice sends a signed-out visitor through login and
 * back, and the notice a waitlisted member receives when their city opens links
 * straight here. Both would land on an unfiltered nationwide list — and the
 * second would be a message saying "Kochi is open" followed by a page that
 * never mentions Kochi.
 */
export default async function PartnersPage({
  searchParams,
}: {
  searchParams: Promise<{ city?: string }>;
}) {
  const { city } = await searchParams;
  const requested = city?.trim() || "";

  const [result, facets] = await Promise.all([
    searchPartnersWithCoverage({ city: requested || null }),
    getMarketplaceFacets(),
  ]);

  return (
    <PublicShell>
      <PartnerBrowser
        initialPartners={result.partners}
        initialCoverage={result.coverage}
        initialCity={requested}
        facets={facets}
      />
    </PublicShell>
  );
}
