import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePartner } from "@/lib/auth/requirePartner";
import { getT } from "@/lib/i18n/server";
import PartnerShell from "@/components/layout/PartnerShell";
import Card from "@/components/ui/Card";
import HelperRoomPanel from "@/components/rishta/HelperRoomPanel";
import { getActivePartnerCode } from "@/components/partner/_shared/getActivePartnerCode";
import { getParticipantRoomView, resolveRoomAccess } from "@/lib/services/rishta/roomParticipantService";

export const dynamic = "force-dynamic";

/**
 * One room, from the partner's side.
 *
 * `resolveRoomAccess` is the whole gate: it re-reads the delegation, so a
 * client who revoked access this morning has a partner who cannot open this
 * page this afternoon — no cache to wait out, and a 404 rather than an
 * explanation, because "this room exists but is not yours" is itself a fact
 * about somebody's marriage.
 */
export default async function PartnerRoomPage({
  params,
}: {
  params: Promise<{ participantId: string }>;
}) {
  const { partner, redirectTo } = await requirePartner(["APPROVED", "ACTIVE"]);
  if (!partner) redirect(redirectTo);

  const { participantId } = await params;
  const access = await resolveRoomAccess({ participantId, partnerId: partner.id });
  if (!access) notFound();
  const t = await getT();

  const [room, partnerCode] = await Promise.all([
    getParticipantRoomView(access),
    getActivePartnerCode(partner.id),
  ]);

  return (
    <PartnerShell partnerName={partner.fullName} partnerCode={partnerCode}>
      <div className="mx-auto max-w-2xl">
        <Link
          href="/partner/rooms"
          className="mb-4 inline-flex items-center gap-1.5 text-[0.8125rem] text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="size-3.5" />
          {t("rishtaRoom.partnerRoomsPage.title", "Rishte")}
        </Link>

        <h1 className="text-xl font-bold text-ink">
          {room.ownerName} <span className="font-normal text-muted">—</span> {room.personName}
        </h1>

        <Card padding="md" className="mt-4">
          <HelperRoomPanel room={room} apiBase="/api/partner/rooms" />
        </Card>
      </div>
    </PartnerShell>
  );
}
