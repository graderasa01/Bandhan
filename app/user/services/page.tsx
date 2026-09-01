import { redirect } from "next/navigation";
import UserShell from "@/components/layout/UserShell";
import MyServicesClient from "@/components/marketplace/MyServicesClient";
import { getCurrentUser } from "@/lib/auth/session";
import { listBookingsForBuyer } from "@/lib/services/marketplace/bookingService";
import { listThreadsForUser } from "@/lib/services/marketplace/enquiryService";

export const dynamic = "force-dynamic";

export default async function MyServicesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/user/services");

  // `listBookingsForBuyer` settles on read — a missed SLA refunds itself the
  // moment the buyer opens this page, with no scheduler involved.
  const [bookings, threads] = await Promise.all([
    listBookingsForBuyer(user.id),
    listThreadsForUser(user.id),
  ]);

  return (
    <UserShell userName={user.fullName}>
      <MyServicesClient
        bookings={bookings.map((b) => ({
          id: b.id,
          status: b.status,
          pricePaise: b.pricePaise,
          createdAt: b.createdAt.toISOString(),
          acceptBySla: b.acceptBySla?.toISOString() ?? null,
          refundWindowEndsAt: b.refundWindowEndsAt?.toISOString() ?? null,
          partnerId: b.partnerId,
          partnerName: b.partner.organizationName?.trim() || b.partner.fullName,
          serviceName: b.service.name,
          hasReview: Boolean(b.review),
          milestones: b.milestones.map((m) => ({
            id: m.id,
            title: m.title,
            status: m.status,
            submittedNote: m.submittedNote,
          })),
        }))}
        threads={threads.map((t) => ({
          id: t.id,
          partnerId: t.partnerId,
          partnerName: t.partner.organizationName?.trim() || t.partner.fullName,
          lastMessageAt: t.lastMessageAt.toISOString(),
          unread: t.userUnreadCount,
          status: t.status,
        }))}
      />
    </UserShell>
  );
}
