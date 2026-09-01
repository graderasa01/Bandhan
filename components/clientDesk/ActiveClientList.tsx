import Link from "next/link";
import { CalendarClock, ChevronRight, Inbox, ShieldCheck, UserRoundCheck } from "lucide-react";
import Card from "@/components/ui/Card";
import type { ClientSummary } from "@/lib/services/clientDesk/clientDeskService";

/**
 * The partner's assigned clients — people who claimed a profile and then chose
 * to keep this partner on.
 *
 * A server component with no interactivity: everything here is a link into one
 * desk, and shipping a client bundle for a list of links would be paying for
 * nothing. The counts are the only numbers a partner needs at this level —
 * how ready the profile is, how many suggestions are waiting on an answer, and
 * how long the access lasts.
 */
export default function ActiveClientList({ clients }: { clients: ClientSummary[] }) {
  if (clients.length === 0) {
    return (
      <Card variant="soft" padding="lg" className="text-center">
        <UserRoundCheck className="mx-auto size-10 text-gold-600" aria-hidden />
        <p className="mt-3 font-semibold text-ink">Abhi koi active client nahi.</p>
        <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-muted">
          Jab koi apna draft claim karke aapko access dete hain, wo yahan aate hain. Access unka hai — wo jab
          chahein hata sakte hain.
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {clients.map((c) => (
        <Link key={c.ownerUserId} href={`/partner/clients/desk/${c.ownerUserId}`} className="block">
          <Card variant="interactive" padding="md">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-trust/15 text-trust">
                <ShieldCheck className="size-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-semibold text-ink">{c.displayName}</p>
                  {c.pendingProposals > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-warn/40 bg-warn-bg px-2 py-0.5 text-[0.6875rem] font-medium text-warn">
                      <Inbox className="size-3" aria-hidden />
                      {c.pendingProposals} jawaab baaki
                    </span>
                  )}
                </div>

                <p className="mt-1 text-xs leading-relaxed text-muted">
                  {c.permissionLabels.length} permission
                  {c.permissionLabels.length > 1 ? "s" : ""} · profile {c.completionPercent}%
                  {c.profileLive ? " · live" : " · abhi live nahi"}
                </p>

                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.75rem] text-muted">
                  {c.daysLeft !== null && (
                    <span className="inline-flex items-center gap-1">
                      <CalendarClock className="size-3.5" aria-hidden />
                      {c.daysLeft} din baaki
                    </span>
                  )}
                  {c.acceptedProposals > 0 && <span>{c.acceptedProposals} accept hue</span>}
                  {c.activeBookings > 0 && <span>{c.activeBookings} booking chal rahi</span>}
                </div>
              </div>
              <ChevronRight className="mt-1 size-4 shrink-0 text-muted" aria-hidden />
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}
