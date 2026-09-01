import "server-only";
import { prisma } from "@/lib/db/prisma";
import { PROFILE_FULL_INCLUDE } from "@/lib/services/profile/profileInclude";
import { computeCompletion } from "@/lib/services/profile/completionService";
import { isDelegationLive } from "@/lib/services/managedProfile/delegationService";
import { PERMISSION_LABELS } from "@/lib/services/managedProfile/managedProfilePolicy";
import { MAX_CLIENT_NOTE_CHARS } from "./clientDeskPolicy";
import type { ProfileDelegatePermission } from "@prisma/client";

/**
 * The Partner Client Desk: who this partner is currently assigned to, and what
 * they are allowed to see about each of them.
 *
 * ## Assignment is a live delegation, nothing else
 *
 * There is no "assigned clients" table. A client is somebody whose `ACTIVE`,
 * unexpired `ProfileDelegation` names this partner — the same row the owner
 * revokes on `/user/profile/access`. That is deliberate: a second source of
 * "who are my clients" is a second thing revocation would have to remember to
 * clear, and the one it forgot would be the one that mattered.
 *
 * A booking does **not** make someone a client here. Paying for a curated
 * shortlist and granting profile access are two separate consents (Phase 2's
 * `DATA_SHARED_NOTE` says so at checkout), and folding them together would
 * make payment a permission grant after all.
 *
 * ## What the desk shows, and what it refuses to
 *
 * Readiness and confirmation gaps come from the same `computeCompletion` the
 * owner's own screens use — *field labels only*, never values, unless the
 * partner holds `VIEW_CONFIRMED_PROFILE`. The desk never shows contact
 * details, photos, messages, private Rishta notes or the owner's other
 * partners. Those are not filtered out at render time; they are never loaded.
 */

export interface ClientSummary {
  ownerUserId: string;
  delegationId: string;
  displayName: string;
  permissions: ProfileDelegatePermission[];
  permissionLabels: string[];
  expiresAt: string | null;
  daysLeft: number | null;
  /** Required-field completion of the owner's real profile. */
  completionPercent: number;
  missingRequiredLabels: string[];
  profileLive: boolean;
  pendingProposals: number;
  acceptedProposals: number;
  activeBookings: number;
  lastActivityAt: string | null;
}

/** Live delegations naming this partner — the definition of "my clients". */
export async function listClientsForPartner(partnerId: string): Promise<ClientSummary[]> {
  const rows = await prisma.profileDelegation.findMany({
    where: { partnerId, status: "ACTIVE" },
    orderBy: { updatedAt: "desc" },
    include: { owner: { select: { id: true, fullName: true } } },
  });

  const now = new Date();
  const live = rows.filter((r) => isDelegationLive(r, now));

  return Promise.all(
    live.map(async (d) => {
      const [profile, pending, accepted, bookings] = await Promise.all([
        prisma.profile.findUnique({ where: { userId: d.ownerUserId }, include: PROFILE_FULL_INCLUDE }),
        prisma.candidateProposal.count({ where: { ownerUserId: d.ownerUserId, partnerId, status: "PROPOSED" } }),
        prisma.candidateProposal.count({ where: { ownerUserId: d.ownerUserId, partnerId, status: "ACCEPTED" } }),
        prisma.serviceBooking.count({
          where: {
            partnerId,
            buyerUserId: d.ownerUserId,
            status: { in: ["PAID", "ACCEPTED", "IN_PROGRESS", "DELIVERED", "DISPUTED"] },
          },
        }),
      ]);

      const completion = profile ? computeCompletion(profile) : null;

      return {
        ownerUserId: d.ownerUserId,
        delegationId: d.id,
        // The owner's own display name, which they chose and which their
        // matches already see. Never their contact.
        displayName: profile?.displayName ?? d.owner.fullName,
        permissions: d.permissions,
        permissionLabels: d.permissions.map((p) => PERMISSION_LABELS[p]),
        expiresAt: d.expiresAt?.toISOString() ?? null,
        daysLeft: d.expiresAt
          ? Math.max(0, Math.ceil((d.expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)))
          : null,
        completionPercent: completion?.percent ?? 0,
        missingRequiredLabels: completion?.missingFields ?? [],
        profileLive: completion?.isLive ?? false,
        pendingProposals: pending,
        acceptedProposals: accepted,
        activeBookings: bookings,
        lastActivityAt: d.updatedAt.toISOString(),
      };
    }),
  );
}

export type DeskAccess =
  | { ok: true; client: ClientSummary }
  | { ok: false; error: string; message: string; status: number };

/**
 * The desk's one authorisation point.
 *
 * A partner reaching a client id they no longer hold a live delegation for
 * gets the same 404 as one that never existed — an owner-user id must not be
 * a lookup service, and the difference between "revoked" and "never yours" is
 * information the partner is not owed.
 */
export async function openClientDesk(partnerId: string, ownerUserId: string): Promise<DeskAccess> {
  const clients = await listClientsForPartner(partnerId);
  const client = clients.find((c) => c.ownerUserId === ownerUserId);
  if (!client) {
    return { ok: false, error: "NOT_FOUND", message: "Ye client nahi mila.", status: 404 };
  }
  return { ok: true, client };
}

/* ------------------------------------------------------------------ */
/* Private notes                                                       */
/* ------------------------------------------------------------------ */

export interface ClientNoteView {
  id: string;
  body: string;
  createdAt: string;
}

/**
 * The partner's own working memory about a client.
 *
 * Never rendered to the member, never fed to a model, never copied into a
 * proposal reason or a profile field. "Private partner service notes, never
 * shown as user statements" is the plan's wording and this is the whole of the
 * mechanism: nothing else in the codebase reads this table.
 */
export async function listClientNotes(partnerId: string, ownerUserId: string): Promise<ClientNoteView[]> {
  const rows = await prisma.partnerClientNote.findMany({
    where: { partnerId, ownerUserId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return rows.map((r) => ({ id: r.id, body: r.body, createdAt: r.createdAt.toISOString() }));
}

export async function addClientNote(params: {
  partnerId: string;
  authorUserId: string;
  ownerUserId: string;
  body: string;
}): Promise<{ ok: true; noteId: string } | { ok: false; error: string; message: string; status: number }> {
  const body = params.body.trim();
  if (body.length === 0) return { ok: false, error: "EMPTY", message: "Kuch likhiye.", status: 422 };

  // The note is still about a real person, so writing one requires a live
  // assignment — a revoked partner does not keep taking notes on somebody.
  const access = await openClientDesk(params.partnerId, params.ownerUserId);
  if (!access.ok) return access;

  const row = await prisma.partnerClientNote.create({
    data: {
      partnerId: params.partnerId,
      ownerUserId: params.ownerUserId,
      authorUserId: params.authorUserId,
      body: body.slice(0, MAX_CLIENT_NOTE_CHARS),
    },
    select: { id: true },
  });
  return { ok: true, noteId: row.id };
}

export async function deleteClientNote(
  partnerId: string,
  noteId: string,
): Promise<{ ok: true } | { ok: false; error: string; message: string; status: number }> {
  const deleted = await prisma.partnerClientNote.deleteMany({ where: { id: noteId, partnerId } });
  if (deleted.count === 0) return { ok: false, error: "NOT_FOUND", message: "Note nahi mila.", status: 404 };
  return { ok: true };
}
