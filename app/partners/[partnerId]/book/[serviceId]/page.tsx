import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import FocusShell from "@/components/layout/FocusShell";
import BookingCheckout from "@/components/marketplace/BookingCheckout";
import { getCurrentUser } from "@/lib/auth/session";
import { quoteBooking } from "@/lib/services/marketplace/bookingService";

export const dynamic = "force-dynamic";

/**
 * Checkout. Login required — this is where a booking becomes a person's
 * obligation, and an anonymous one cannot be delivered to anybody.
 *
 * `FocusShell` rather than `PublicShell`: a page whose only job is one decision
 * should not carry a nav bar full of ways to abandon it, and the shell is
 * already the one used for the other single-decision screens (verify contact,
 * claim profile).
 */
export default async function BookServicePage({
  params,
}: {
  params: Promise<{ partnerId: string; serviceId: string }>;
}) {
  const { partnerId, serviceId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/partners/${partnerId}/book/${serviceId}`);

  const quoted = await quoteBooking(serviceId);
  if (!quoted.ok) notFound();
  if (quoted.quote.partnerId !== partnerId) notFound();

  return (
    <FocusShell>
      <div className="w-full">
        <div className="mx-auto mb-3 max-w-lg">
          <Link href={`/partners/${partnerId}`} className="text-sm text-muted hover:text-ink">
            ← Wapas
          </Link>
        </div>
        <BookingCheckout quote={quoted.quote} />
      </div>
    </FocusShell>
  );
}
