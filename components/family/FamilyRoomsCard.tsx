import Link from "next/link";
import { CalendarClock, DoorOpen } from "lucide-react";
import Card from "@/components/ui/Card";
import type { HelperRoomCard } from "@/lib/services/rishta/roomParticipantService";

/**
 * The rishtey a family member has been invited into.
 *
 * Rendered only when there is at least one, and that is the important part: a
 * parent who has not been invited into any rishta should not see an empty
 * "Rishte" section teaching them that such a thing exists and they are being
 * kept out of it. Being in a room is something their child chose to offer, not
 * a feature the portal advertises.
 */
export default function FamilyRoomsCard({ rooms }: { rooms: HelperRoomCard[] }) {
  if (rooms.length === 0) return null;

  return (
    <Card padding="md">
      <h2 className="text-sm font-semibold text-ink">Jin rishton me aapko jodha gaya hai</h2>
      <ul className="mt-2.5 flex flex-col gap-2">
        {rooms.map((r) => (
          <li key={r.participantId}>
            <Link
              href={`/family/rishta/${r.participantId}`}
              className="block rounded-md border border-line/70 bg-surface-2 px-3 py-2.5 transition-colors hover:border-gold-400"
            >
              <div className="flex flex-wrap items-center gap-2">
                <DoorOpen className="size-4 shrink-0 text-muted" aria-hidden />
                <span className="text-[0.875rem] font-semibold text-ink">{r.personName}</span>
                <span className="text-[0.75rem] text-muted">{r.stageLabel}</span>
              </div>
              {(r.openTasks > 0 || r.nextMeetingAt) && (
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.75rem] text-muted">
                  {r.openTasks > 0 && <span>{r.openTasks} kaam aapke zimme</span>}
                  {r.nextMeetingAt && (
                    <span className="flex items-center gap-1">
                      <CalendarClock className="size-3.5" aria-hidden />
                      {new Date(r.nextMeetingAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </span>
                  )}
                </p>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
