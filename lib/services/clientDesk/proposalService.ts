import "server-only";
import { prisma } from "@/lib/db/prisma";
import { getFitBreakdown } from "@/lib/services/match/fitBreakdown";
import { hasDelegatedPermission } from "@/lib/services/managedProfile/delegationService";
import { recordConsentEvent } from "@/lib/services/managedProfile/consentLog";
import { createNotice } from "@/lib/services/notice/noticeService";
import {
  MAX_DRAFT_MESSAGE_CHARS,
  MAX_PENDING_PROPOSALS,
  MAX_PROPOSAL_REASON_CHARS,
  MIN_PROPOSAL_REASON_CHARS,
} from "./clientDeskPolicy";
import type { CandidateProposal, ProposalSource } from "@prisma/client";

/**
 * A partner putting one candidate in front of one owner, and the owner
 * deciding.
 *
 * ## Nothing leaves the platform without the owner's tap
 *
 * This is the phase's central rule and it is enforced by what the file does
 * *not* import. There is no `sendInterest` here, no message write, no
 * `Match`. A proposal is a row the owner reads. Accepting it writes exactly
 * one thing — a `Shortlist` row on the owner's own shortlist, stamped with
 * `addedByPartnerId` so "kisne isko shortlist kiya" stays answerable. Sending
 * an interest from there is the owner's own existing button on their own
 * existing screen, with their own monthly budget, exactly as before.
 *
 * The draft message is the sharpest version of the same idea: the partner can
 * *write* a first message and can never send one. It arrives in the owner's
 * message box as pre-filled text they edit and send themselves.
 *
 * ## The score is code's, the reason is the partner's
 *
 * `fitScore` is frozen from `getFitBreakdown` — the same deterministic D-33
 * L2 numbers that rank the Reel, computed at proposal time and stored. It sits
 * next to the partner's own sentence deliberately: an enthusiastic reason
 * beside a 31% fit is information the owner is entitled to, and hiding the
 * disagreement would make the platform an accomplice to the pitch.
 *
 * ## Revocation
 *
 * Pending proposals from a delegate whose access ended are expired on read
 * (`expireOrphanedProposals`). What is *not* undone is anything the owner
 * already accepted: that shortlist row is theirs, and "the owner can use the
 * full product without the partner after revocation" means exactly that they
 * keep it.
 */

export type ProposalResult<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string; message: string; status: number };

function fail(error: string, message: string, status = 422) {
  return { ok: false as const, error, message, status };
}

/* ------------------------------------------------------------------ */
/* Propose                                                             */
/* ------------------------------------------------------------------ */

export interface ProposeInput {
  partnerUserId: string;
  partnerId: string;
  partnerLabel: string;
  ownerUserId: string;
  candidateProfileId: string;
  reason: string;
  source: ProposalSource;
  draftMessage?: string | null;
}

export async function proposeCandidate(input: ProposeInput): Promise<ProposalResult<{ proposalId: string }>> {
  const mayPropose = await hasDelegatedPermission(input.partnerUserId, input.ownerUserId, "PROPOSE_SHORTLIST");
  if (!mayPropose) {
    return fail("FORBIDDEN", "Is client ke liye suggestion bhejne ki permission nahi hai.", 403);
  }

  const reason = input.reason.trim();
  if (reason.length < MIN_PROPOSAL_REASON_CHARS) {
    return fail("REASON_TOO_SHORT", `Wajah kam se kam ${MIN_PROPOSAL_REASON_CHARS} characters ki likhiye.`);
  }
  if (reason.length > MAX_PROPOSAL_REASON_CHARS) {
    return fail("REASON_TOO_LONG", `Wajah ${MAX_PROPOSAL_REASON_CHARS} characters se kam rakhiye.`);
  }

  let draftMessage: string | null = null;
  if (input.draftMessage?.trim()) {
    // The permission is checked at *write* time, not just in the UI: a partner
    // without DRAFT_MESSAGE who posts one anyway has it dropped, and is told
    // so, rather than having it silently stored and shown later.
    const mayDraft = await hasDelegatedPermission(input.partnerUserId, input.ownerUserId, "DRAFT_MESSAGE");
    if (!mayDraft) {
      return fail("FORBIDDEN", "Message draft karne ki permission nahi hai.", 403);
    }
    draftMessage = input.draftMessage.trim().slice(0, MAX_DRAFT_MESSAGE_CHARS);
  }

  const candidate = await prisma.profile.findUnique({
    where: { id: input.candidateProfileId },
    select: { id: true, userId: true, isVisible: true, deletedAt: true, profileStatus: true },
  });
  if (!candidate || candidate.deletedAt || !candidate.isVisible || candidate.profileStatus === "DRAFT") {
    return fail("NOT_FOUND", "Ye profile ab available nahi hai.", 404);
  }
  if (candidate.userId === input.ownerUserId) {
    return fail("SELF", "Client ki apni profile suggest nahi ki ja sakti.", 422);
  }

  const existing = await prisma.candidateProposal.findUnique({
    where: {
      ownerUserId_candidateProfileId: {
        ownerUserId: input.ownerUserId,
        candidateProfileId: input.candidateProfileId,
      },
    },
    select: { id: true, status: true },
  });
  if (existing) {
    // The anti-nag rule from the schema, said in the partner's words. A "no"
    // that can be re-asked next week is not a no.
    return fail(
      "ALREADY_PROPOSED",
      existing.status === "PROPOSED"
        ? "Ye profile pehle se unke saamne hai."
        : "Ye profile pehle suggest ki ja chuki hai — dobara nahi bheji ja sakti.",
      409,
    );
  }

  const pending = await prisma.candidateProposal.count({
    where: { ownerUserId: input.ownerUserId, partnerId: input.partnerId, status: "PROPOSED" },
  });
  if (pending >= MAX_PENDING_PROPOSALS) {
    return fail(
      "QUEUE_FULL",
      `${MAX_PENDING_PROPOSALS} suggestions pehle se unke jawaab ka intezaar kar rahe hain. Koi purana wapas lijiye.`,
      429,
    );
  }

  // Frozen at proposal time — the same numbers that rank the Reel, so the
  // owner is comparing like with like rather than a partner's own metric.
  const fit = await getFitBreakdown(input.ownerUserId, input.candidateProfileId);
  const fitScore = fit ? weightedScore(fit) : null;

  const proposal = await prisma.candidateProposal.create({
    data: {
      ownerUserId: input.ownerUserId,
      partnerId: input.partnerId,
      proposedByUserId: input.partnerUserId,
      candidateProfileId: input.candidateProfileId,
      source: input.source,
      reason,
      draftMessage,
      fitScore,
      fitSummary: fit?.sochLine ?? null,
    },
    select: { id: true },
  });

  await recordConsentEvent({
    kind: "CANDIDATE_PROPOSED",
    ownerUserId: input.ownerUserId,
    actorUserId: input.partnerUserId,
    actorLabel: input.partnerLabel,
    detail: fitScore !== null ? `Fit ${fitScore}%` : null,
  });

  await createNotice({
    userId: input.ownerUserId,
    kind: "MATCHMAKER_UPDATE",
    title: "Aapke partner ne ek rishta suggest kiya",
    body: `${input.partnerLabel} ne ek profile aapke saamne rakhi hai. Dekh kar haan ya na kar dijiye.`,
    href: "/user/proposals",
    relatedId: proposal.id,
  });

  return { ok: true, proposalId: proposal.id };
}

/** The one number, weighted the way `scoreCandidates` weights it. */
function weightedScore(fit: Awaited<ReturnType<typeof getFitBreakdown>>): number | null {
  if (!fit) return null;
  const total = fit.signals.reduce((sum, s) => sum + (s.score * s.weightPercent) / 100, 0);
  const weight = fit.signals.reduce((sum, s) => sum + s.weightPercent, 0);
  if (weight === 0) return null;
  return Math.round((total / weight) * 100);
}

export async function withdrawProposal(
  partnerUserId: string,
  partnerId: string,
  partnerLabel: string,
  proposalId: string,
): Promise<ProposalResult> {
  const row = await prisma.candidateProposal.findUnique({ where: { id: proposalId } });
  if (!row || row.partnerId !== partnerId) return fail("NOT_FOUND", "Ye suggestion nahi mila.", 404);
  if (row.status !== "PROPOSED") return fail("BAD_STATE", "Is par faisla ho chuka hai.", 409);

  await prisma.candidateProposal.update({ where: { id: proposalId }, data: { status: "WITHDRAWN" } });
  await recordConsentEvent({
    kind: "PROPOSAL_WITHDRAWN",
    ownerUserId: row.ownerUserId,
    actorUserId: partnerUserId,
    actorLabel: partnerLabel,
  });
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Owner decides                                                       */
/* ------------------------------------------------------------------ */

export type OwnerDecision = "accept" | "reject";

export async function decideProposal(
  ownerUserId: string,
  proposalId: string,
  decision: OwnerDecision,
  note?: string | null,
): Promise<ProposalResult<{ shortlistId: string | null }>> {
  const row = await prisma.candidateProposal.findUnique({
    where: { id: proposalId },
    include: {
      partner: { select: { id: true, fullName: true, organizationName: true, userId: true } },
      candidateProfile: { select: { id: true, displayName: true, isVisible: true, deletedAt: true } },
    },
  });
  if (!row || row.ownerUserId !== ownerUserId) return fail("NOT_FOUND", "Ye suggestion nahi mila.", 404);
  if (row.status !== "PROPOSED") return fail("BAD_STATE", "Is par faisla ho chuka hai.", 409);

  const now = new Date();
  const partnerLabel = row.partner.organizationName?.trim() || row.partner.fullName;

  if (decision === "reject") {
    await prisma.candidateProposal.update({
      where: { id: proposalId },
      data: { status: "REJECTED", ownerDecidedAt: now, ownerNote: note?.trim()?.slice(0, 500) || null },
    });
    await recordConsentEvent({
      kind: "PROPOSAL_REJECTED",
      ownerUserId,
      actorUserId: ownerUserId,
      actorLabel: partnerLabel,
    });
    // The partner is told the answer, never the reason unless the owner chose
    // to write one — "why not" is the owner's to volunteer, not to owe.
    await createNotice({
      userId: row.partner.userId,
      kind: "MATCHMAKER_UPDATE",
      title: "Client ne ek suggestion par mana kiya",
      body: note?.trim() ? `Unhone likha: ${note.trim().slice(0, 200)}` : "Koi wajah nahi di gayi.",
      href: "/partner/clients?tab=active",
      relatedId: proposalId,
    });
    return { ok: true, shortlistId: null };
  }

  if (row.candidateProfile.deletedAt || !row.candidateProfile.isVisible) {
    return fail("NOT_FOUND", "Ye profile ab available nahi hai.", 404);
  }

  /*
   * Accepting writes exactly one thing: a row on the owner's own shortlist.
   *
   * Not an interest, not a message, not a match. Those all have their own
   * budgets, their own consent and their own screens, and a partner's
   * suggestion turning into an outgoing interest on one tap is precisely the
   * "approval required before external effect" line this phase draws.
   */
  const shortlist = await prisma.shortlist.upsert({
    where: { userId_targetProfileId: { userId: ownerUserId, targetProfileId: row.candidateProfileId } },
    create: {
      userId: ownerUserId,
      targetProfileId: row.candidateProfileId,
      addedByPartnerId: row.partnerId,
      note: row.reason.slice(0, 300),
    },
    update: { addedByPartnerId: row.partnerId },
    select: { id: true },
  });

  await prisma.candidateProposal.update({
    where: { id: proposalId },
    data: {
      status: "ACCEPTED",
      ownerDecidedAt: now,
      ownerNote: note?.trim()?.slice(0, 500) || null,
      shortlistId: shortlist.id,
    },
  });

  await recordConsentEvent({
    kind: "PROPOSAL_ACCEPTED",
    ownerUserId,
    actorUserId: ownerUserId,
    actorLabel: partnerLabel,
  });

  await createNotice({
    userId: row.partner.userId,
    kind: "MATCHMAKER_UPDATE",
    title: "Client ne aapka suggestion accept kiya",
    body: "Wo ab unki shortlist me hai. Aage ka faisla unka hai.",
    href: "/partner/clients?tab=active",
    relatedId: proposalId,
  });

  return { ok: true, shortlistId: shortlist.id };
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

/**
 * Pending proposals whose delegation has ended are closed on read.
 *
 * No cron, same as everywhere else in this codebase. The point is not
 * tidiness: a revoked partner's suggestion sitting in the owner's queue still
 * carries that partner's words and still asks for a decision on their behalf,
 * which is influence surviving the revocation that was supposed to end it.
 */
export async function expireOrphanedProposals(ownerUserId: string): Promise<void> {
  const pending = await prisma.candidateProposal.findMany({
    where: { ownerUserId, status: "PROPOSED" },
    select: { id: true, proposedByUserId: true },
  });
  if (pending.length === 0) return;

  const stale: string[] = [];
  for (const p of pending) {
    if (!(await hasDelegatedPermission(p.proposedByUserId, ownerUserId, "PROPOSE_SHORTLIST"))) {
      stale.push(p.id);
    }
  }
  if (stale.length > 0) {
    await prisma.candidateProposal.updateMany({
      where: { id: { in: stale } },
      data: { status: "EXPIRED" },
    });
  }
}

export interface ProposalView {
  id: string;
  status: CandidateProposal["status"];
  source: CandidateProposal["source"];
  reason: string;
  draftMessage: string | null;
  fitScore: number | null;
  fitSummary: string | null;
  partnerName: string;
  candidateProfileId: string;
  candidateName: string;
  candidateAge: number | null;
  candidateCity: string | null;
  createdAt: string;
  ownerDecidedAt: string | null;
  ownerNote: string | null;
}

function ageOf(dob: Date | null): number | null {
  if (!dob) return null;
  const years = Math.floor((Date.now() - dob.getTime()) / (365.25 * 86_400_000));
  return years > 0 && years < 120 ? years : null;
}

export async function listProposalsForOwner(ownerUserId: string): Promise<ProposalView[]> {
  await expireOrphanedProposals(ownerUserId);

  const rows = await prisma.candidateProposal.findMany({
    where: { ownerUserId },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 60,
    include: {
      partner: { select: { fullName: true, organizationName: true } },
      candidateProfile: { select: { id: true, displayName: true, dateOfBirth: true, currentCity: true } },
    },
  });

  return rows.map(toView);
}

export async function listProposalsForPartner(partnerId: string, ownerUserId: string): Promise<ProposalView[]> {
  const rows = await prisma.candidateProposal.findMany({
    where: { partnerId, ownerUserId },
    orderBy: { createdAt: "desc" },
    take: 60,
    include: {
      partner: { select: { fullName: true, organizationName: true } },
      candidateProfile: { select: { id: true, displayName: true, dateOfBirth: true, currentCity: true } },
    },
  });
  return rows.map(toView);
}

type ProposalRow = CandidateProposal & {
  partner: { fullName: string; organizationName: string | null };
  candidateProfile: { id: string; displayName: string | null; dateOfBirth: Date | null; currentCity: string | null };
};

function toView(r: ProposalRow): ProposalView {
  return {
    id: r.id,
    status: r.status,
    source: r.source,
    reason: r.reason,
    draftMessage: r.draftMessage,
    fitScore: r.fitScore,
    fitSummary: r.fitSummary,
    partnerName: r.partner.organizationName?.trim() || r.partner.fullName,
    candidateProfileId: r.candidateProfile.id,
    candidateName: r.candidateProfile.displayName ?? "Profile",
    candidateAge: ageOf(r.candidateProfile.dateOfBirth),
    candidateCity: r.candidateProfile.currentCity,
    createdAt: r.createdAt.toISOString(),
    ownerDecidedAt: r.ownerDecidedAt?.toISOString() ?? null,
    ownerNote: r.ownerNote,
  };
}
