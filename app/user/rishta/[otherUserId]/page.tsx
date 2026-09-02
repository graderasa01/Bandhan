import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  BadgeCheck,
  Bot,
  MessageCircle,
  ShieldCheck,
  User as UserIcon,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getRishtaRoom } from "@/lib/data/rishtaRoomData";
import UserShell from "@/components/layout/UserShell";
import Avatar from "@/components/ui/Avatar";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import RishtaStageStrip from "@/components/rishta/RishtaStageStrip";
import RoomHumanHelp from "@/components/rishta/RoomHumanHelp";
import RoomMeetings from "@/components/rishta/RoomMeetings";
import RoomNotes from "@/components/rishta/RoomNotes";
import RoomParticipants from "@/components/rishta/RoomParticipants";
import RoomRequests from "@/components/rishta/RoomRequests";
import RoomServices from "@/components/rishta/RoomServices";
import RoomTasks from "@/components/rishta/RoomTasks";
import RoomVerification from "@/components/rishta/RoomVerification";
import RoomTopics from "@/components/rishta/RoomTopics";
import { daysAgoLabel } from "@/lib/profile/rishtaTime";
import type { NextStepTarget } from "@/lib/profile/rishtaNextStep";

/**
 * The Rishta Room — one rishta, everything about it, in one place.
 *
 * ## What this replaces
 *
 * Nothing was missing before this page; it was *scattered*. The stage lived in
 * a strip above one chat thread, unresolved topics were seeded by the
 * Compatibility Lab and visible almost nowhere, meetings and private notes had
 * tables and a write API but no screen at all, the family's shortlist and notes
 * sat on the family portal, and asking a human for help was a card on the
 * billing page. Six surfaces, one relationship.
 *
 * So this page adds no new capability. It is the room those six things were
 * always supposed to be standing in.
 *
 * ## What Phase 4 added, and what it did not
 *
 * Four sections: who else is in this room, what has to be done and by whom,
 * what those helpers have asked the owner for, and the paid services attached
 * to this one rishta. Every one of them is still the viewer's own data. A
 * helper standing in this room reads a much smaller page of their own
 * (`getParticipantRoomView`) — never this one — and nothing below was widened
 * to accommodate them.
 *
 * ## Why it is per-user, and stays that way
 *
 * A "shared room" for two people is the obvious design and it is the one thing
 * this must never become. `RishtaJourney` is keyed on `(userId, otherUserId)`
 * because Rahul marking "ghar wale jud gaye" says nothing about Priya's family
 * — and a shared row would let each of them read the other's private stage off
 * their own screen. Everything on this page is the viewer's own data: their
 * stage, their topics, their notes, their family's notes about a candidate.
 *
 * The genuinely shared parts of a rishta — the chat, the contact share — keep
 * living where they already do, and this page links to them.
 *
 * ## The one sentence at the top
 *
 * `nextStepFor` decides it, deterministically, from rows. Not Grio: a model
 * asked "what next" always finds something to advise, and the honest answer is
 * frequently "unka jawab aana hai, aapko kuch nahi karna" — which no model
 * volunteers.
 */

export const dynamic = "force-dynamic";

/** Where the next step's button goes. Anchors stay on the page; the rest leave it. */
function targetHref(target: NextStepTarget, matchId: string | null): string | null {
  switch (target) {
    case "chat":
      return matchId ? `/user/messages/${matchId}` : null;
    case "topics":
      return "#topics";
    case "meeting":
      return "#meetings";
    case "family":
      return "/user/family";
    case "stage":
      return "#stage";
    case "interests":
      return "/user/interests";
    default:
      return null;
  }
}

const TARGET_CTA: Record<NextStepTarget, string> = {
  chat: "Open chat",
  topics: "See topics",
  meeting: "Plan a meeting",
  family: "Open Family",
  stage: "Update stage",
  interests: "Open Interests",
  none: "",
};

export default async function RishtaRoomPage({
  params,
}: {
  params: Promise<{ otherUserId: string }>;
}) {
  const user = await getCurrentUser();
  const { otherUserId } = await params;
  if (!user) redirect(`/login?next=/user/rishta/${otherUserId}`);

  const room = await getRishtaRoom(user.id, otherUserId);
  // Null means these two have no relationship at all. A 404 rather than an
  // empty room, for the same reason the API returns one: an empty room would
  // confirm that an arbitrary user id is real.
  if (!room) notFound();

  const { summary, nextStep, person } = room;
  const href = targetHref(nextStep.target, summary.matchId);
  const ago = daysAgoLabel(summary.lastInteractionAt);
  const totalMessages = summary.messagesFromUser + summary.messagesFromOther;

  return (
    <UserShell userName={user.fullName}>
      <div className="mx-auto max-w-2xl px-4 py-6">
        <Link
          href="/user/matches"
          className="mb-4 inline-flex items-center gap-1.5 text-[0.8125rem] text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="size-3.5" />
          My Rishte
        </Link>

        {/* ---- Who ---- */}
        <section className="mb-5 flex items-start gap-3">
          <Avatar name={person.name} photoUrl={person.photoUrl} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-ink">
                {person.name}
                {person.age ? `, ${person.age}` : ""}
              </h1>
              {person.verified && (
                <Badge variant="verified" size="sm" icon={<BadgeCheck className="size-3" />}>
                  Verified
                </Badge>
              )}
            </div>
            <p className="mt-0.5 text-sm text-muted">
              {[person.city, totalMessages > 0 ? `${totalMessages} message` : null, ago ? `aakhri baat ${ago}` : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {person.profileId && (
              <Link
                href={`/user/profile/${person.profileId}`}
                className="mt-1.5 inline-flex items-center gap-1.5 text-[0.75rem] font-medium text-muted transition-colors hover:text-ink"
              >
                <UserIcon className="size-3.5" />
                Full profile
              </Link>
            )}
          </div>
        </section>

        {/* ---- The one sentence ---- */}
        <Card variant="luxe" padding="md" className="mb-5">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted">
            {nextStep.who === "you"
              ? "Agla kadam aapka"
              : nextStep.who === "them"
                ? "Agla kadam unka"
                : nextStep.who === "both"
                  ? "Agla kadam dono ka"
                  : "Ye rishta poora ho chuka"}
          </p>
          <h2 className="mt-1 text-lg font-bold text-ink">{nextStep.title}</h2>
          <p className="mt-1 text-[0.875rem] leading-relaxed text-muted">{nextStep.detail}</p>
          {href && (
            <Link
              href={href}
              className="mt-3 inline-flex min-h-10 items-center rounded-md border border-line bg-surface px-4 text-[0.8125rem] font-semibold text-ink transition-colors hover:border-gold-500"
            >
              {TARGET_CTA[nextStep.target]}
            </Link>
          )}
        </Card>

        {/* ---- What has been asked of the owner ----
            Above the stage, because it is the only thing on this page somebody
            else is waiting on. Rendered only when there is something to answer
            or a history to read — an empty approval queue is not a section. */}
        {room.requests.length > 0 && (
          <section id="room-requests" className="mb-5 scroll-mt-20">
            <h2 className="mb-2 text-sm font-semibold text-ink">Aapse kya poochha gaya</h2>
            <Card padding="md">
              <RoomRequests otherUserId={otherUserId} requests={room.requests} />
            </Card>
          </section>
        )}

        {/* ---- Stage ---- */}
        <section id="stage" className="mb-5 scroll-mt-20">
          <h2 className="mb-2 text-sm font-semibold text-ink">Kahan tak pahunche</h2>
          <RishtaStageStrip initial={summary} />
        </section>

        {/* ---- Kaam ---- */}
        <section id="room-tasks" className="mb-5 scroll-mt-20">
          <h2 className="mb-2 text-sm font-semibold text-ink">Kaam — kisko kya karna hai</h2>
          <Card padding="md">
            <RoomTasks otherUserId={otherUserId} tasks={room.tasks} participants={room.participants} />
          </Card>
        </section>

        {/* ---- Topics ---- */}
        <section id="topics" className="mb-5 scroll-mt-20">
          <h2 className="mb-2 text-sm font-semibold text-ink">Baatein jo abhi clear nahi</h2>
          <Card padding="md">
            <RoomTopics summary={summary} />
          </Card>
        </section>

        {/* ---- Meetings ---- */}
        <section id="meetings" className="mb-5 scroll-mt-20">
          <h2 className="mb-2 text-sm font-semibold text-ink">Mulaqatein</h2>
          <Card padding="md">
            <RoomMeetings summary={summary} personProfileId={person.profileId} />
          </Card>
        </section>

        {/* ---- Verification ----
            Between the meetings and the people helping: this is the question
            somebody asks once a rishta is real, and the answer belongs beside
            the meeting they are deciding whether to go to. */}
        <section id="room-verification" className="mb-5 scroll-mt-20">
          <h2 className="mb-2 text-sm font-semibold text-ink">Kya check hua hai</h2>
          <Card padding="md">
            <RoomVerification
              otherUserId={otherUserId}
              personName={person.name}
              badges={room.verificationBadges}
              asked={room.verificationAsked}
            />
          </Card>
        </section>

        {/* ---- Who else is in this room ---- */}
        <section id="room-participants" className="mb-5 scroll-mt-20">
          <h2 className="mb-2 text-sm font-semibold text-ink">Is rishtey me aur kaun</h2>
          <Card padding="md">
            <RoomParticipants
              otherUserId={otherUserId}
              participants={room.participants}
              admittable={room.admittableHelpers}
            />
          </Card>
        </section>

        {/* ---- Family ---- */}
        <section className="mb-5">
          <h2 className="mb-2 text-sm font-semibold text-ink">Ghar walon ki taraf se</h2>
          <Card padding="md">
            {room.shortlistedBy && (
              <p className="text-[0.8125rem] text-ink">
                <strong className="font-semibold">{room.shortlistedBy}</strong> ne inhe aapke liye shortlist
                kiya tha.
              </p>
            )}
            {room.familyNotes.length > 0 ? (
              <ul className={`flex flex-col gap-2.5 ${room.shortlistedBy ? "mt-3" : ""}`}>
                {room.familyNotes.map((n) => (
                  <li key={n.id} className="rounded-md border border-line/70 bg-surface-2 px-3 py-2">
                    <p className="whitespace-pre-wrap text-[0.8125rem] leading-relaxed text-ink">{n.body}</p>
                    <p className="mt-1 text-[0.6875rem] text-muted">
                      {n.author} · {daysAgoLabel(n.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              !room.shortlistedBy && (
                <p className="text-[0.8125rem] leading-relaxed text-muted">
                  Ghar walon ne is rishtey par abhi kuch nahi likha.{" "}
                  <Link href="/user/family" className="font-medium text-ink underline underline-offset-2">
                    Family Circle
                  </Link>{" "}
                  se unhe jodiye — wo profile dekh kar apni raay yahin chhod sakte hain.
                </p>
              )
            )}
          </Card>
        </section>

        {/* ---- Paid help on this rishta ---- */}
        {room.bookings.length > 0 && (
          <section className="mb-5">
            <h2 className="mb-2 text-sm font-semibold text-ink">Is rishtey ke liye li gayi service</h2>
            <Card padding="md">
              <RoomServices bookings={room.bookings} />
            </Card>
          </section>
        )}

        {/* ---- Private notes ---- */}
        <section className="mb-5">
          <h2 className="mb-2 text-sm font-semibold text-ink">Mere apne note</h2>
          <Card padding="md">
            <RoomNotes summary={summary} />
          </Card>
        </section>

        {/* ---- Help ---- */}
        {room.canAskHuman && (
          <section className="mb-5">
            <h2 className="mb-2 text-sm font-semibold text-ink">Madad chahiye?</h2>
            <Card padding="md">
              <RoomHumanHelp personName={person.name} openRequests={room.openHumanRequests} />
            </Card>
          </section>
        )}

        {/* ---- Where else to go ---- */}
        <section className="mb-5 flex flex-wrap gap-2">
          {summary.matchId && (
            <Link
              href={`/user/messages/${summary.matchId}`}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-line bg-surface px-3.5 text-[0.8125rem] font-medium text-ink transition-colors hover:border-gold-400"
            >
              <MessageCircle className="size-4" />
              Chat
            </Link>
          )}
          {/* Seeds the composer and stops there — Grio never auto-sends a
              question a button on another screen decided to ask. */}
          <Link
            href={`/user/concierge?q=${encodeURIComponent(`${person.name} wale rishtey me ab kya karna chahiye?`)}`}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-line bg-surface px-3.5 text-[0.8125rem] font-medium text-ink transition-colors hover:border-gold-400"
          >
            <Bot className="size-4" />
            Ask Grio
          </Link>
        </section>

        <Card variant="soft" padding="md">
          <p className="flex items-start gap-2 text-xs leading-relaxed text-muted">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-trust" />
            Is page par jo kuch bhi hai — stage, baatein, mulaqat, note — wo sirf aapka hai. Saamne wale
            ko na ye dikhta hai, na unka apna record aapko dikhta hai. Jinhe aapne is rishtey me jodha hai,
            unhe sirf stage, kaam aur tay hui mulaqat dikhti hai.
          </p>
        </Card>
      </div>
    </UserShell>
  );
}
