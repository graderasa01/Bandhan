import Link from "next/link";
import { Handshake } from "lucide-react";
import { getT } from "@/lib/i18n/server";
import type { RishtaRoomBooking } from "@/lib/data/rishtaRoomData";

/**
 * Paid help that is about *this* rishta.
 *
 * A server component with no interactivity on purpose: everything a booking can
 * do — accept a milestone, dispute it, ask for a refund — already lives on
 * `/user/services`, which owns the refund window and the SLA clock. Rebuilding
 * any of that here would be a second booking console that could disagree with
 * the first about somebody's money.
 *
 * So this is a status line and a link, and its whole job is to stop the owner
 * having to remember that the meeting coordination they paid for is tracked on
 * a different screen from the meeting it is coordinating.
 */
export default async function RoomServices({ bookings }: { bookings: RishtaRoomBooking[] }) {
  if (bookings.length === 0) return null;
  const t = await getT();

  return (
    <ul className="flex flex-col gap-2">
      {bookings.map((b) => (
        <li key={b.id} className="flex flex-wrap items-center gap-2 rounded-md border border-line/70 bg-surface-2 px-3 py-2">
          <Handshake className="size-4 shrink-0 text-muted" aria-hidden />
          <span className="text-[0.8125rem] text-ink">{b.serviceName}</span>
          <span className="text-[0.75rem] text-muted">{b.partnerName}</span>
          <span className="ml-auto text-[0.75rem] text-muted">
            {b.statusLabel}
            {b.milestonesTotal > 0 && ` · ${b.milestonesDone}/${b.milestonesTotal}`}
          </span>
        </li>
      ))}
      <li>
        <Link
          href="/user/services"
          className="text-[0.75rem] font-medium text-muted underline underline-offset-2 transition-colors hover:text-ink"
        >
          {t("rishtaRoom.services.viewAllLink", "Poori booking dekhiye")}
        </Link>
      </li>
    </ul>
  );
}
