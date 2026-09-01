import "server-only";
import { prisma } from "@/lib/db/prisma";
import { labelFor } from "./managedProfilePolicy";
import type { ConsentEventKind, Prisma } from "@prisma/client";

/**
 * The owner-facing consent trail.
 *
 * ## What may never go in here
 *
 * Raw claim tokens, field *values*, identity documents, contact details. The
 * signature enforces the important half of that: `fieldKey` is a key, and
 * there is no parameter that could carry a value. A log that recorded
 * "annualIncome rejected: ₹8–12 LPA" would have permanently stored the exact
 * fact its owner just refused to publish — the rejection is the event, the
 * number is not.
 *
 * `detail` exists for counts and short non-sensitive summaries ("3 ordinary
 * details accepted"), and every caller in this feature passes either a count
 * or a helper's display label.
 *
 * ## Why not AdminAuditLog
 *
 * That table is staff-facing, keyed by `actorRole`, and is never rendered to a
 * member. Consent history is the opposite: it exists to be read by the person
 * it is about. Folding one into the other would make every future admin-log
 * change a privacy review, and would put member-visible rows behind an
 * ADMIN-only page.
 */

export interface ConsentEventInput {
  kind: ConsentEventKind;
  ownerUserId?: string | null;
  actorUserId?: string | null;
  /** Human-readable, non-identifying where it can be: "Rishta Bureau (partner)". */
  actorLabel: string;
  draftId?: string | null;
  delegationId?: string | null;
  /** A `PROFILE_FIELDS` key. Never a value. */
  fieldKey?: string | null;
  detail?: string | null;
}

type Tx = Prisma.TransactionClient;

export async function recordConsentEvent(input: ConsentEventInput, tx: Tx | typeof prisma = prisma): Promise<void> {
  await tx.consentEvent.create({
    data: {
      kind: input.kind,
      ownerUserId: input.ownerUserId ?? null,
      actorUserId: input.actorUserId ?? null,
      actorLabel: input.actorLabel,
      draftId: input.draftId ?? null,
      delegationId: input.delegationId ?? null,
      fieldKey: input.fieldKey ?? null,
      detail: input.detail ?? null,
    },
  });
}

export async function recordConsentEvents(
  inputs: ConsentEventInput[],
  tx: Tx | typeof prisma = prisma,
): Promise<void> {
  if (inputs.length === 0) return;
  await tx.consentEvent.createMany({
    data: inputs.map((input) => ({
      kind: input.kind,
      ownerUserId: input.ownerUserId ?? null,
      actorUserId: input.actorUserId ?? null,
      actorLabel: input.actorLabel,
      draftId: input.draftId ?? null,
      delegationId: input.delegationId ?? null,
      fieldKey: input.fieldKey ?? null,
      detail: input.detail ?? null,
    })),
  });
}

export interface ConsentHistoryRow {
  id: string;
  kind: ConsentEventKind;
  actorLabel: string;
  /** Already resolved to the catalog label — the UI never needs the key. */
  fieldLabel: string | null;
  detail: string | null;
  at: string;
  text: string;
}

const KIND_TEXT: Record<ConsentEventKind, string> = {
  DRAFT_CREATED: "Draft banaya gaya",
  CLAIM_LINK_ISSUED: "Claim link banaya gaya",
  CLAIM_LINK_REGENERATED: "Naya claim link banaya gaya (purana band)",
  CLAIM_LINK_REVOKED: "Claim link band kiya gaya",
  DRAFT_CLAIMED: "Aapne ye draft apne account se claim kiya",
  DRAFT_CANCELLED: "Draft band kiya gaya",
  FIELD_ACCEPTED: "Ek detail confirm ki gayi",
  SENSITIVE_FIELD_ACCEPTED: "Ek zaroori detail alag se confirm ki gayi",
  FIELD_REPLACED: "Ek detail badal kar aapki apni likhi hui ki gayi",
  FIELD_REJECTED: "Ek detail reject ki gayi",
  REVIEW_COMPLETED: "Review poora hua",
  DELEGATION_GRANTED: "Permission di gayi",
  DELEGATION_EXPIRY_CHANGED: "Permission ki expiry badli gayi",
  DELEGATION_REVOKED: "Permission wapas li gayi",
  DELEGATION_DECLINED: "Permission dene se mana kiya gaya",
  // Phase 3 — the Client Desk's own trail. `PARTNER_SEARCH_RUN` is the one
  // that matters most on the owner's screen: a helper who can look through
  // your eyes should not be able to do it unobserved.
  PARTNER_SEARCH_RUN: "Partner ne aapki pasand ke filters se search chalaya",
  CANDIDATE_PROPOSED: "Partner ne ek rishta suggest kiya",
  PROPOSAL_ACCEPTED: "Aapne ek suggestion par haan ki",
  PROPOSAL_REJECTED: "Aapne ek suggestion par mana kiya",
  PROPOSAL_WITHDRAWN: "Partner ne apna suggestion wapas liya",
};

/** The owner's own history. Never exposed to a delegate — see `delegationService`. */
export async function getConsentHistory(ownerUserId: string, limit = 60): Promise<ConsentHistoryRow[]> {
  const rows = await prisma.consentEvent.findMany({
    where: { ownerUserId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    actorLabel: r.actorLabel,
    fieldLabel: r.fieldKey ? labelFor(r.fieldKey) : null,
    detail: r.detail,
    at: r.createdAt.toISOString(),
    text: KIND_TEXT[r.kind],
  }));
}

/** A draft's own trail, for the creator's detail screen. Creator-visible events
 *  only: field-level decisions are the owner's business, not the helper's. */
const CREATOR_VISIBLE_KINDS: ConsentEventKind[] = [
  "DRAFT_CREATED",
  "CLAIM_LINK_ISSUED",
  "CLAIM_LINK_REGENERATED",
  "CLAIM_LINK_REVOKED",
  "DRAFT_CLAIMED",
  "DRAFT_CANCELLED",
  "REVIEW_COMPLETED",
  "DELEGATION_GRANTED",
  "DELEGATION_REVOKED",
  "DELEGATION_DECLINED",
];

export async function getDraftHistoryForCreator(draftId: string, limit = 30): Promise<ConsentHistoryRow[]> {
  const rows = await prisma.consentEvent.findMany({
    where: { draftId, kind: { in: CREATOR_VISIBLE_KINDS } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    actorLabel: r.actorLabel,
    // Deliberately dropped for the creator: which field an owner touched is
    // part of the owner's review, and the creator is told the review happened,
    // not what was in it.
    fieldLabel: null,
    detail: r.detail,
    at: r.createdAt.toISOString(),
    text: KIND_TEXT[r.kind],
  }));
}
