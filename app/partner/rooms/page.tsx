import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarClock, DoorOpen } from "lucide-react";
import { requirePartner } from "@/lib/auth/requirePartner";
import PartnerShell from "@/components/layout/PartnerShell";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/states/EmptyState";
import { getActivePartnerCode } from "@/components/partner/_shared/getActivePartnerCode";
import { listRoomsForHelper } from "@/lib/services/rishta/roomParticipantService";

export const dynamic = "force-dynamic";

/**
 * The rishtey a partner has actually been let into.
 *
 * Deliberately not a tab on the Client Desk. A client is somebody whose profile
 * a partner may help with; a room is one relationship inside that, admitted
 * separately, and the two lists are different lengths on purpose — a bureau
 * with eight clients might be standing in two rooms. Folding them together
 * would make "my clients" quietly imply "their rishtey", which is the exact
 * over-read Phase 4's second lock exists to prevent.
 */
export default async function PartnerRoomsPage() {
  const { partner, redirectTo } = await requirePartner(["APPROVED", "ACTIVE"]);
  if (!partner) redirect(redirectTo);

  const [rooms, partnerCode] = await Promise.all([
    listRoomsForHelper({ partnerId: partner.id }),
    getActivePartnerCode(partner.id),
  ]);

  return (
    <PartnerShell partnerName={partner.fullName} partnerCode={partnerCode}>
      <div className="mx-auto max-w-2xl">
        <h1 className="text-xl font-bold text-ink">Rishte</h1>
        <p className="mt-1 text-[0.875rem] leading-relaxed text-muted">
          Wo rishtey jinme client ne aapko khud jodha hai. Har rishtey me aapko utna hi dikhta hai jitni
          unhone permission di — chat, unke private note aur mulaqat ke baad ka unka jawaab kabhi nahi.
        </p>

        {rooms.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="Abhi kisi rishtey me nahi jode gaye."
              description="Client apne Rishta Room se aapko jod sakte hain. Jab jodenge, wo rishta yahan dikhega."
            />
          </div>
        ) : (
          <ul className="mt-4 flex flex-col gap-2.5">
            {rooms.map((r) => (
              <li key={r.participantId}>
                <Link href={`/partner/rooms/${r.participantId}`} className="block">
                  <Card padding="md" className="transition-colors hover:border-gold-400">
                    <div className="flex flex-wrap items-center gap-2">
                      <DoorOpen className="size-4 shrink-0 text-muted" aria-hidden />
                      <span className="text-[0.9375rem] font-semibold text-ink">{r.ownerName}</span>
                      <span className="text-[0.8125rem] text-muted">— {r.personName} ke saath</span>
                    </div>
                    <p className="mt-1 text-[0.8125rem] text-muted">{r.stageLabel}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.75rem] text-muted">
                      {r.openTasks > 0 && <span>{r.openTasks} kaam aapke zimme</span>}
                      {r.pendingRequests > 0 && <span>{r.pendingRequests} baat unke jawaab par</span>}
                      {r.nextMeetingAt && (
                        <span className="flex items-center gap-1">
                          <CalendarClock className="size-3.5" aria-hidden />
                          {new Date(r.nextMeetingAt).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                          })}
                        </span>
                      )}
                    </p>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PartnerShell>
  );
}
