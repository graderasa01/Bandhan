import "server-only";
import type { Partner } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getPartnerLeads } from "@/lib/data/partnerData";
import { listPartnerInvites } from "@/lib/services/outreach/inviteService";
import { listDraftsForCreator } from "@/lib/services/managedProfile/managedDraftService";
import { listClientsForPartner } from "@/lib/services/clientDesk/clientDeskService";
import { listRoomsForHelper } from "@/lib/services/rishta/roomParticipantService";
import { firstNameOf } from "@/lib/partner/visibility";
import { noopT, type Translate } from "@/lib/i18n/translate";

/**
 * The Partner Journey (D-90): one list of families and one set-up checklist,
 * assembled from the services that already own each piece.
 *
 * Before this, a partner's families were spread over five screens — invites,
 * leads, client drafts, active clients, rooms — and the same family could sit
 * on three of them under three different words. Here every family is one row,
 * at the furthest stage any of those sources puts it, with one next step.
 *
 * ## Privacy
 *
 * Rows are merged on the member's user id, which is read here only to join and
 * is never put in a row. A row carries what `toPartnerLead`'s boundary already
 * allows — a first name, a city the lead list already showed, progress — and
 * links only to pages the partner could already open (a lead, a draft, a
 * client desk, a room), with the same URLs those pages already use.
 */

export type FamilyStage =
  | "INVITED"
  | "DRAFT"
  | "CLAIM_SENT"
  | "CLAIMED"
  | "JOINED"
  | "PROFILE_READY"
  | "CLIENT"
  | "RISHTA";

/** The journey's order. A family sits at the furthest stage any source puts it in. */
export const FAMILY_STAGE_ORDER: FamilyStage[] = [
  "INVITED",
  "DRAFT",
  "CLAIM_SENT",
  "CLAIMED",
  "JOINED",
  "PROFILE_READY",
  "CLIENT",
  "RISHTA",
];

export type FamilyRow = {
  /** Opaque, for React keys. Never a user id. */
  key: string;
  firstName: string;
  city: string | null;
  stage: FamilyStage;
  /** Where they are, in one line. */
  detail: string;
  /** Has paid at least once — the commission ledger (see `paidReferredUserIds`). */
  paid: boolean;
  next: { label: string; href: string } | null;
};

export type FamilyPipeline = {
  rows: FamilyRow[];
  stages: { stage: FamilyStage; label: string; count: number }[];
};

export function familyStageLabel(stage: FamilyStage, t: Translate = noopT): string {
  switch (stage) {
    case "INVITED":
      return t("partnerJourney.stage.INVITED", "Invite bheja");
    case "DRAFT":
      return t("partnerJourney.stage.DRAFT", "Profile bana rahe");
    case "CLAIM_SENT":
      return t("partnerJourney.stage.CLAIM_SENT", "Claim link gaya");
    case "CLAIMED":
      return t("partnerJourney.stage.CLAIMED", "Profile sambhal li");
    case "JOINED":
      return t("partnerJourney.stage.JOINED", "Join kiya");
    case "PROFILE_READY":
      return t("partnerJourney.stage.PROFILE_READY", "Profile poori");
    case "CLIENT":
      return t("partnerJourney.stage.CLIENT", "Client");
    case "RISHTA":
      return t("partnerJourney.stage.RISHTA", "Rishta chal raha");
  }
}

const rank = (stage: FamilyStage) => FAMILY_STAGE_ORDER.indexOf(stage);

/** `t()` has no interpolation, so placeholders are filled after lookup — the codebase's `{date}` pattern. */
function fill(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), template);
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/**
 * One source failing must not blank the whole list — the same best-effort rule
 * the dashboard applies to the payout ledger. It is logged, not swallowed.
 */
async function bestEffort<T>(label: string, run: () => Promise<T[]>): Promise<T[]> {
  try {
    return await run();
  } catch (err) {
    console.error(`[partner-journey] ${label} failed:`, err instanceof Error ? err.message : String(err));
    return [];
  }
}

export async function getFamilyPipeline(
  partner: Pick<Partner, "id" | "userId">,
  t: Translate = noopT,
): Promise<FamilyPipeline> {
  const [invites, leads, drafts, clients, rooms] = await Promise.all([
    bestEffort("invites", () => listPartnerInvites(partner.id, 200)),
    bestEffort("leads", () => getPartnerLeads(partner.id)),
    bestEffort("drafts", () => listDraftsForCreator(partner.userId)),
    bestEffort("clients", () => listClientsForPartner(partner.id)),
    bestEffort("rooms", () => listRoomsForHelper({ partnerId: partner.id })),
  ]);

  // Join keys only. Scoped to this partner where the row has a partner column,
  // so a stray id can never pull in somebody else's family.
  const [inviteUsers, leadUsers, draftUsers, roomUsers] = await Promise.all([
    prisma.partnerInvite.findMany({
      where: { partnerId: partner.id, id: { in: invites.map((i) => i.id) } },
      select: { id: true, convertedUserId: true },
    }),
    prisma.partnerReferral.findMany({
      where: { partnerId: partner.id, id: { in: leads.map((l) => l.leadId) } },
      select: { id: true, userId: true },
    }),
    prisma.managedProfileDraft.findMany({
      where: { creatorUserId: partner.userId, id: { in: drafts.map((d) => d.id) } },
      select: { id: true, claimedByUserId: true },
    }),
    prisma.rishtaParticipant.findMany({
      where: { id: { in: rooms.map((r) => r.participantId) } },
      select: { id: true, journey: { select: { userId: true } } },
    }),
  ]);
  const inviteUser = new Map(inviteUsers.map((r) => [r.id, r.convertedUserId]));
  const leadUser = new Map(leadUsers.map((r) => [r.id, r.userId]));
  const draftUser = new Map(draftUsers.map((r) => [r.id, r.claimedByUserId]));
  const roomUser = new Map(roomUsers.map((r) => [r.id, r.journey.userId]));

  // Pushed from the furthest source down, so on a tie the richer row (a room
  // over a desk over a lead) is the one kept.
  const candidates: { familyKey: string; row: FamilyRow }[] = [];
  const push = (familyKey: string, row: FamilyRow) => candidates.push({ familyKey, row });

  // Rooms — one row per family however many rishtey are open.
  const roomsByUser = new Map<string, typeof rooms>();
  for (const room of rooms) {
    const userId = roomUser.get(room.participantId);
    if (!userId) continue;
    roomsByUser.set(userId, [...(roomsByUser.get(userId) ?? []), room]);
  }
  for (const [userId, list] of roomsByUser) {
    const first = list[0];
    const openTasks = list.reduce((sum, r) => sum + r.openTasks, 0);
    const pendingRequests = list.reduce((sum, r) => sum + r.pendingRequests, 0);
    push(`u:${userId}`, {
      key: `room:${first.participantId}`,
      firstName: firstNameOf(first.ownerName, null),
      city: null,
      stage: "RISHTA",
      detail:
        openTasks > 0
          ? fill(t("partnerJourney.room.tasks", "{n} kaam aapke zimme"), { n: openTasks })
          : pendingRequests > 0
            ? fill(t("partnerJourney.room.requests", "{n} request jawab ke intezaar me"), { n: pendingRequests })
            : list.length > 1
              ? fill(t("partnerJourney.room.many", "{n} rishte chal rahe"), { n: list.length })
              : fill(t("partnerJourney.room.stage", "Stage: {stage}"), { stage: first.stageLabel }),
      paid: false,
      next:
        list.length === 1
          ? { label: t("partnerJourney.cta.openRishta", "Open Rishta"), href: `/partner/rooms/${first.participantId}` }
          : { label: t("partnerJourney.cta.openRishte", "Open Rishte"), href: "/partner/rooms" },
    });
  }

  for (const c of clients) {
    push(`u:${c.ownerUserId}`, {
      key: `client:${c.delegationId}`,
      firstName: firstNameOf(c.displayName, null),
      city: null,
      stage: "CLIENT",
      detail:
        c.pendingProposals > 0
          ? fill(t("partnerJourney.client.pending", "{n} suggestion unke jawab ke intezaar me"), { n: c.pendingProposals })
          : !c.profileLive
            ? fill(t("partnerJourney.client.notLive", "Profile {n}% — abhi live nahi"), { n: c.completionPercent })
            : c.activeBookings > 0
              ? fill(t("partnerJourney.client.bookings", "{n} booking chal rahi"), { n: c.activeBookings })
              : t("partnerJourney.client.live", "Profile live — rishte dhoondhne me madad kijiye"),
      paid: false,
      // Same URL ActiveClientList links with.
      next: { label: t("partnerJourney.cta.openDesk", "Open Desk"), href: `/partner/clients/desk/${c.ownerUserId}` },
    });
  }

  for (const lead of leads) {
    const userId = leadUser.get(lead.leadId);
    const complete = lead.completionBucket === "Complete";
    const reminder = lead.status !== "PAID";
    push(userId ? `u:${userId}` : `lead:${lead.leadId}`, {
      key: `lead:${lead.leadId}`,
      firstName: lead.firstName,
      city: lead.city,
      stage: complete ? "PROFILE_READY" : "JOINED",
      detail:
        lead.status === "JOINED"
          ? t("partnerJourney.lead.notStarted", "Profile shuru nahi ki")
          : lead.status === "INACTIVE"
            ? fill(t("partnerJourney.lead.inactive", "Aakhri baar: {bucket}"), { bucket: lead.activityBucket })
            : complete
              ? t("partnerJourney.lead.ready", "Profile poori — ab rishte dekh sakte hain")
              : fill(t("partnerJourney.lead.started", "Profile {bucket}"), { bucket: lead.completionBucket }),
      paid: lead.hasPaid,
      next: {
        label: reminder
          ? t("partnerJourney.cta.sendReminder", "Send Reminder")
          : t("partnerJourney.cta.open", "Open"),
        href: `/partner/leads/${lead.leadId}`,
      },
    });
  }

  for (const d of drafts) {
    if (d.status === "CANCELLED" || d.status === "EXPIRED") continue;
    const href = `/partner/clients/${d.id}`;
    const base = { key: `draft:${d.id}`, firstName: firstNameOf(d.displayLabel, null), city: null, paid: false };
    if (d.status === "DRAFT") {
      push(`draft:${d.id}`, {
        ...base,
        stage: "DRAFT",
        detail: fill(t("partnerJourney.draft.filled", "{n}% bhari"), { n: d.completionPercent }),
        next: { label: t("partnerJourney.cta.continue", "Continue"), href },
      });
    } else if (d.status === "INVITED") {
      push(`draft:${d.id}`, {
        ...base,
        stage: "CLAIM_SENT",
        detail: d.claimLinkExpiresAt
          ? fill(t("partnerJourney.draft.claimUntil", "Claim link {date} tak chalega"), { date: shortDate(d.claimLinkExpiresAt) })
          : t("partnerJourney.draft.claimWaiting", "Unke link kholne ka intezaar"),
        next: { label: t("partnerJourney.cta.open", "Open"), href },
      });
    } else {
      const owner = draftUser.get(d.id) ?? null;
      push(owner ? `u:${owner}` : `draft:${d.id}`, {
        ...base,
        stage: "CLAIMED",
        detail:
          d.status === "CONFIRMED"
            ? t("partnerJourney.draft.confirmed", "Profile confirm — ab ye unki hai")
            : d.reviewPending > 0
              ? fill(t("partnerJourney.draft.reviewing", "{n} baatein unke review me"), { n: d.reviewPending })
              : t("partnerJourney.draft.claimed", "Unhone profile claim kar li"),
        next: { label: t("partnerJourney.cta.open", "Open"), href },
      });
    }
  }

  for (const inv of invites) {
    const userId = inviteUser.get(inv.id) ?? null;
    push(userId ? `u:${userId}` : `invite:${inv.id}`, {
      key: `invite:${inv.id}`,
      firstName: firstNameOf(inv.fullName, null),
      city: null,
      stage: inv.status === "JOINED" ? "JOINED" : "INVITED",
      detail:
        inv.status === "FAILED"
          ? t("partnerJourney.invite.failed", "Invite nahi gaya — dobara bhejein")
          : inv.status === "OPENED"
            ? t("partnerJourney.invite.opened", "Link khola — join hone ka intezaar")
            : inv.status === "SENT"
              ? t("partnerJourney.invite.sent", "Invite bhej diya — join hone ka intezaar")
              : inv.status === "JOINED"
                ? t("partnerJourney.invite.joined", "Invite se join kiya")
                : t("partnerJourney.invite.pending", "Link bana — aapne khud bhejna hai"),
      paid: false,
      next:
        inv.status === "FAILED"
          ? { label: t("partnerJourney.cta.inviteAgain", "Invite Again"), href: "/partner/invite" }
          : null,
    });
  }

  const merged = new Map<string, FamilyRow>();
  for (const { familyKey, row } of candidates) {
    const held = merged.get(familyKey);
    if (!held) {
      merged.set(familyKey, row);
      continue;
    }
    const winner = rank(row.stage) > rank(held.stage) ? row : held;
    merged.set(familyKey, { ...winner, paid: held.paid || row.paid, city: held.city ?? row.city });
  }

  const rows = [...merged.values()].sort((a, b) => rank(b.stage) - rank(a.stage));
  const stages = FAMILY_STAGE_ORDER.map((stage) => ({
    stage,
    label: familyStageLabel(stage, t),
    count: rows.filter((r) => r.stage === stage).length,
  }));
  return { rows, stages };
}

// ------------------------------------------------------------------ set-up checklist

export type PartnerSetupStep = {
  key: "contact" | "payout" | "share" | "family" | "listing";
  label: string;
  done: boolean;
  optional: boolean;
  href: string;
  cta: string;
};

export type PartnerSetup = { steps: PartnerSetupStep[]; doneCount: number; requiredLeft: number };

/**
 * "Shuruaat" — the five things that make a partner able to earn, each read from
 * the row that proves it, never from a flag a partner could tick themselves.
 */
export async function getPartnerSetup(
  partner: Pick<Partner, "id" | "mobileVerifiedAt" | "emailVerifiedAt">,
  t: Translate = noopT,
): Promise<PartnerSetup> {
  const [payoutAccounts, invites, referrals, drafts, codes, services] = await Promise.all([
    prisma.partnerPayoutAccount.count({ where: { partnerId: partner.id } }),
    prisma.partnerInvite.count({ where: { partnerId: partner.id } }),
    prisma.partnerReferral.count({ where: { partnerId: partner.id } }),
    prisma.managedProfileDraft.count({ where: { partnerId: partner.id } }),
    prisma.referralCode.findMany({ where: { partnerId: partner.id }, select: { code: true } }),
    prisma.partnerService.count({ where: { partnerId: partner.id, isActive: true } }),
  ]);
  const clicks = codes.length
    ? await prisma.referralClick.count({ where: { code: { in: codes.map((c) => c.code) } } })
    : 0;

  const steps: PartnerSetupStep[] = [
    {
      key: "contact",
      label: t("partnerJourney.setup.contact", "Apna contact verify karein"),
      done: Boolean(partner.mobileVerifiedAt || partner.emailVerifiedAt),
      optional: false,
      href: "/partner/verify-contact",
      cta: t("partnerJourney.setup.cta.contact", "Verify Contact"),
    },
    {
      key: "payout",
      label: t("partnerJourney.setup.payout", "Paisa lene ke liye UPI ya bank jodein"),
      done: payoutAccounts > 0,
      optional: false,
      href: "/partner/payouts",
      cta: t("partnerJourney.setup.cta.payout", "Add UPI"),
    },
    {
      key: "share",
      label: t("partnerJourney.setup.share", "Apna QR ya link kisi parivaar ko bhejein"),
      done: invites + clicks + referrals > 0,
      optional: false,
      href: "/partner/referral-tools",
      cta: t("partnerJourney.setup.cta.share", "Share QR"),
    },
    {
      key: "family",
      label: t("partnerJourney.setup.family", "Pehla parivaar jodein"),
      done: referrals + drafts > 0,
      optional: false,
      href: "/partner/invite",
      cta: t("partnerJourney.setup.cta.family", "Invite Family"),
    },
    {
      key: "listing",
      label: t("partnerJourney.setup.listing", "Apni services list karein"),
      done: services > 0,
      optional: true,
      href: "/partner/listing",
      cta: t("partnerJourney.setup.cta.listing", "Set Up Listing"),
    },
  ];

  return {
    steps,
    doneCount: steps.filter((s) => s.done).length,
    requiredLeft: steps.filter((s) => !s.done && !s.optional).length,
  };
}
