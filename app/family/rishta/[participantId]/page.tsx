import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentFamilyMember } from "@/lib/auth/familySession";
import { prisma } from "@/lib/db/prisma";
import FamilyHeader from "@/components/family/FamilyHeader";
import NotJoinedCard from "@/components/family/NotJoinedCard";
import Card from "@/components/ui/Card";
import HelperRoomPanel from "@/components/rishta/HelperRoomPanel";
import { getParticipantRoomView, resolveRoomAccess } from "@/lib/services/rishta/roomParticipantService";

export const dynamic = "force-dynamic";

/**
 * One rishta, from a family member's side.
 *
 * A sub-route of the family portal rather than a variant of `/user/rishta/…`,
 * for the same reason the portal itself is its own tree: this page is reached
 * with a family cookie, not a user session, and it must never be able to
 * inherit a screen built for the person who owns the profile.
 *
 * What a parent gets here is deliberately much less than the Rishta Room: the
 * stage, the tasks their child gave them, and the ability to say "ab ghar walon
 * ko jodna chahiye" and wait to be answered.
 */
export default async function FamilyRoomPage({
  params,
}: {
  params: Promise<{ participantId: string }>;
}) {
  const member = await getCurrentFamilyMember();
  if (!member) return <NotJoinedCard />;

  const { participantId } = await params;
  const access = await resolveRoomAccess({ participantId, familyMemberId: member.id });
  if (!access) notFound();

  const [room, owner] = await Promise.all([
    getParticipantRoomView(access),
    prisma.user.findUnique({ where: { id: member.ownerUserId }, select: { fullName: true } }),
  ]);

  return (
    <div className="min-h-dvh bg-bg-subtle">
      <FamilyHeader ownerName={owner?.fullName ?? "Unka"} relation={member.relation} />

      <div className="mx-auto max-w-2xl space-y-3 px-4 py-5">
        <Link
          href="/family"
          className="inline-flex items-center gap-1.5 text-[0.8125rem] text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="size-3.5" />
          Wapas
        </Link>

        <h1 className="text-xl font-bold text-ink">{room.personName}</h1>

        <Card padding="md">
          <HelperRoomPanel room={room} apiBase="/api/family-portal/rooms" />
        </Card>
      </div>
    </div>
  );
}
