import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import AdminShell from "@/components/layout/AdminShell";
import AdminServiceConsole from "@/components/marketplace/AdminServiceConsole";
import { prisma } from "@/lib/db/prisma";
import { listBookingsForAdmin } from "@/lib/services/marketplace/bookingService";
import { listPendingListings } from "@/lib/services/marketplace/partnerListingService";

export const dynamic = "force-dynamic";

/**
 * The partner-services desk.
 *
 * Its own page rather than a tab on /admin/payments: a booking dispute is a
 * *fulfilment* decision that happens to move money, and the payments screen is
 * organised around gateway state. Folding the two together would put "did this
 * partner actually do the work" next to "did Razorpay capture this", which are
 * answered by different people looking at different evidence.
 */
export default async function AdminServiceBookingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login?next=/admin/service-bookings");
  if (user.role !== "ADMIN") redirect("/");

  const [bookings, listings, reviews] = await Promise.all([
    listBookingsForAdmin(),
    listPendingListings(),
    prisma.serviceReview.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        author: { select: { fullName: true } },
        partner: { select: { fullName: true, organizationName: true } },
      },
    }),
  ]);

  return (
    <AdminShell adminName={user.fullName}>
      <AdminServiceConsole
        bookings={bookings.map((b) => ({
          id: b.id,
          status: b.status,
          serviceName: b.service.name,
          partnerName: b.partner.organizationName?.trim() || b.partner.fullName,
          buyerName: b.buyer.fullName,
          pricePaise: b.pricePaise,
          partnerAmountPaise: b.partnerAmountPaise,
          allocationStatus: b.allocation?.status ?? null,
          createdAt: b.createdAt.toISOString(),
          disputeReason: b.disputeReason,
          resolutionNote: b.resolutionNote,
        }))}
        listings={listings.map((l) => ({
          partnerId: l.partnerId,
          partnerName: l.partner.fullName,
          city: `${l.partner.city}, ${l.partner.state}`,
          headline: l.headline,
          about: l.about,
          languages: l.languages,
          areas: l.areas,
          services: l.services.map((s) => ({
            id: s.id,
            kind: s.kind,
            name: s.name,
            priceInPaise: s.priceInPaise,
            adminPricePaise: s.adminPricePaise,
            adminPriceNote: s.adminPriceNote,
            deliverables: s.deliverables,
          })),
        }))}
        reviews={reviews.map((r) => ({
          id: r.id,
          partnerName: r.partner.organizationName?.trim() || r.partner.fullName,
          authorFirstName: r.author.fullName.split(" ")[0],
          rating: r.rating,
          body: r.body,
          hidden: Boolean(r.hiddenAt),
          createdAt: r.createdAt.toISOString(),
        }))}
      />
    </AdminShell>
  );
}
