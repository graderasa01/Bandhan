import "server-only";
import { prisma } from "@/lib/db/prisma";
import { completionPercent, isProfileLive, missingRequired } from "@/lib/profile/stages";
import { recordConsentEvent } from "./consentLog";
import { hasDelegatedPermission } from "./delegationService";
import {
  CREATOR_EDITABLE_STATUSES,
  MANAGED_DRAFT_FIELD_KEYS,
  isManagedDraftField,
} from "./managedProfilePolicy";
import type {
  ManagedDraftCreatorKind,
  ManagedProfileDraft,
  ManagedProfileDraftField,
  Prisma,
  SignalSource,
} from "@prisma/client";

/**
 * The private staging area itself: create, read, autosave, cancel.
 *
 * ## What this table is not
 *
 * It is not a Profile, and nothing here ever writes one. That is the whole
 * safety property behind "an unclaimed draft cannot enter discovery" — Reel,
 * Discover, search, matching and Spotlight all start from `Profile`/
 * `ProfileEmbedding` rows, and a managed draft produces neither until an owner
 * has claimed it and confirmed values through `ownerReviewService`.
 *
 * ## Why the creator's own profile can never be hit
 *
 * Every write in this file is keyed by `draftId`. There is no code path from a
 * managed-draft request to `saveDraft(userId, …)`, and the client provider
 * that drives the deck in managed mode (`lib/profile/managedDraftState.tsx`)
 * posts to `/api/managed-profile/drafts/[id]/fields` and never to
 * `/api/profile/save-draft`. Those are two separate facts and both are checked
 * by `scripts/managed-profile-check.ts`.
 */

/* ------------------------------------------------------------------ */
/* Source vocabulary                                                   */
/* ------------------------------------------------------------------ */

/**
 * The small vocabulary a browser may use, mapped server-side — the same shape
 * `provenanceService.SOURCE_MAP` uses, and for the same reason: a request body
 * must not be able to *name* a `SignalSource`. In particular there is no input
 * here that produces `PARTNER_ENTERED`/`FAMILY_ENTERED`; those are stamped by
 * `ownerReviewService` when the owner accepts, never by a contributor.
 */
const CONTRIBUTION_SOURCE_MAP: Record<string, SignalSource> = {
  user: "USER_ENTERED",
  ai: "BIODATA_EXTRACTED",
  inferred: "AI_INFERRED",
};

export function resolveContributionSource(raw: unknown): SignalSource {
  return (typeof raw === "string" && CONTRIBUTION_SOURCE_MAP[raw]) || "USER_ENTERED";
}

/* ------------------------------------------------------------------ */
/* Lazy expiry                                                         */
/* ------------------------------------------------------------------ */

/**
 * A draft whose every issued claim link has died, and which nobody claimed, is
 * EXPIRED. Computed on read and written through, the same no-cron pattern
 * `CircleEvent` and `Poll` use — a deployment with no background workers still
 * shows the truthful status.
 */
async function applyLazyExpiry(draft: ManagedProfileDraft): Promise<ManagedProfileDraft> {
  if (draft.status !== "INVITED") return draft;
  const now = new Date();
  const live = await prisma.managedDraftClaimToken.count({
    where: { draftId: draft.id, usedAt: null, revokedAt: null, expiresAt: { gt: now } },
  });
  if (live > 0) return draft;
  // No live link left, but the draft itself is still perfectly good — the
  // creator can regenerate. EXPIRED here means "the invitation lapsed", not
  // "the work is gone", which is why nothing is deleted.
  return prisma.managedProfileDraft.update({
    where: { id: draft.id },
    data: { status: "EXPIRED", expiredAt: now },
  });
}

/* ------------------------------------------------------------------ */
/* Access                                                              */
/* ------------------------------------------------------------------ */

export type DraftActorRole = "CREATOR" | "OWNER";

export interface DraftAccess {
  draft: ManagedProfileDraft;
  role: DraftActorRole;
  /** May see the proposed values themselves. */
  canReadValues: boolean;
  /** May add/change proposals. */
  canWriteValues: boolean;
  /** May issue/revoke claim links. */
  canManageClaimLink: boolean;
}

export type AccessResult =
  | { ok: true; access: DraftAccess }
  | { ok: false; error: string; message: string; status: number };

const NOT_FOUND = {
  ok: false as const,
  error: "NOT_FOUND",
  message: "Ye draft nahi mila.",
  status: 404,
};

/**
 * The single authorisation point for one draft.
 *
 * Two shapes of caller, and the rules differ sharply after a claim:
 *
 *  - **Creator, before the claim.** Full read/write on the proposals — it is
 *    their own unclaimed work and there is no owner yet to have a say.
 *  - **Creator, after the claim.** Status only, unless the owner granted a
 *    permission. This is the line the whole feature turns on: the moment a
 *    real person owns this data, a helper's access stops being implicit and
 *    starts being consented, scoped and revocable.
 *  - **Owner.** Always full read of what was proposed about them, always the
 *    right to review. Never blocked by a creator.
 *
 * A stranger gets the same 404 as a non-existent id. A partner probing another
 * partner's draft ids must not be able to tell the two apart.
 */
export async function resolveDraftAccess(actorUserId: string, draftId: string): Promise<AccessResult> {
  const found = await prisma.managedProfileDraft.findUnique({ where: { id: draftId } });
  if (!found) return NOT_FOUND;

  const draft = await applyLazyExpiry(found);

  if (draft.claimedByUserId === actorUserId) {
    return {
      ok: true,
      access: {
        draft,
        role: "OWNER",
        canReadValues: true,
        // The owner edits their real profile, not the draft — the draft is a
        // record of what was proposed to them. Corrections go through
        // `ownerReviewService.decideFields`, which keeps the original proposal
        // visible beside the correction.
        canWriteValues: false,
        canManageClaimLink: false,
      },
    };
  }

  if (draft.creatorUserId !== actorUserId) return NOT_FOUND;

  const preClaim = CREATOR_EDITABLE_STATUSES.includes(draft.status) || draft.status === "EXPIRED";
  if (preClaim && !draft.claimedByUserId) {
    return {
      ok: true,
      access: {
        draft,
        role: "CREATOR",
        canReadValues: true,
        canWriteValues: draft.status !== "EXPIRED",
        canManageClaimLink: true,
      },
    };
  }

  // Claimed (or cancelled). Everything now depends on a live delegation.
  const ownerId = draft.claimedByUserId;
  const [canRead, canWrite] = ownerId
    ? await Promise.all([
        hasDelegatedPermission(actorUserId, ownerId, "VIEW_CONFIRMED_PROFILE"),
        hasDelegatedPermission(actorUserId, ownerId, "PROPOSE_PROFILE_EDIT"),
      ])
    : [false, false];

  return {
    ok: true,
    access: {
      draft,
      role: "CREATOR",
      canReadValues: canRead,
      canWriteValues: canWrite && draft.status !== "CANCELLED",
      canManageClaimLink: false,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Create                                                              */
/* ------------------------------------------------------------------ */

export interface CreateDraftInput {
  creatorUserId: string;
  creatorLabel: string;
  kind: ManagedDraftCreatorKind;
  partnerId: string | null;
  /** "Ladka" | "Ladki" — the creator's explicit choice. */
  fillingForGender: string;
  displayLabel: string;
}

export type CreateDraftResult =
  | { ok: true; draft: ManagedProfileDraft }
  | { ok: false; error: string; message: string; status: number };

const GENDER_VALUES = new Set(["Ladka", "Ladki"]);

/** How many unclaimed drafts one creator may hold at once. Not a business cap —
 *  a brake on a scripted account manufacturing drafts. */
export const MAX_OPEN_DRAFTS = 60;

export async function createManagedDraft(input: CreateDraftInput): Promise<CreateDraftResult> {
  const displayLabel = input.displayLabel.trim();
  if (displayLabel.length < 2 || displayLabel.length > 60) {
    return {
      ok: false,
      error: "VALIDATION_FAILED",
      message: "Client ka naam ya label 2 se 60 characters ka hona chahiye.",
      status: 422,
    };
  }
  if (!GENDER_VALUES.has(input.fillingForGender)) {
    return {
      ok: false,
      error: "VALIDATION_FAILED",
      message: "Ladka ya Ladki — ek chuniye.",
      status: 422,
    };
  }

  const open = await prisma.managedProfileDraft.count({
    where: { creatorUserId: input.creatorUserId, status: { in: ["DRAFT", "INVITED"] } },
  });
  if (open >= MAX_OPEN_DRAFTS) {
    return {
      ok: false,
      error: "TOO_MANY_DRAFTS",
      message: `Ek saath ${MAX_OPEN_DRAFTS} se zyada unclaimed drafts nahi rakh sakte. Purane band kariye.`,
      status: 429,
    };
  }

  const draft = await prisma.managedProfileDraft.create({
    data: {
      creatorKind: input.kind,
      creatorUserId: input.creatorUserId,
      partnerId: input.partnerId,
      fillingForGender: input.fillingForGender,
      displayLabel,
      // The creator's "kis ke liye" answer *is* the gender answer, exactly as
      // `ProfileProvider.setFillingFor` treats it for a parent filling for a
      // child. It still arrives at the owner as a proposal they must confirm
      // individually (gender is on the sensitive list), so pre-filling it
      // saves a tap without pre-empting a decision.
      fields: {
        create: {
          fieldKey: "gender",
          value: input.fillingForGender,
          source: "USER_ENTERED",
          proposedByUserId: input.creatorUserId,
        },
      },
    },
  });

  await recordConsentEvent({
    kind: "DRAFT_CREATED",
    actorUserId: input.creatorUserId,
    actorLabel: input.creatorLabel,
    draftId: draft.id,
    detail: input.kind === "PARTNER" ? "Partner ne client draft banaya" : "Family ne draft banaya",
  });

  return { ok: true, draft };
}

/* ------------------------------------------------------------------ */
/* Read                                                                */
/* ------------------------------------------------------------------ */

export function fieldsToValues(fields: Pick<ManagedProfileDraftField, "fieldKey" | "value" | "ownerValue" | "reviewState">[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) {
    if (f.reviewState === "REJECTED") continue;
    out[f.fieldKey] = f.reviewState === "REPLACED" && f.ownerValue ? f.ownerValue : f.value;
  }
  return out;
}

export interface DraftSummary {
  id: string;
  displayLabel: string;
  creatorKind: ManagedDraftCreatorKind;
  fillingForGender: string;
  status: ManagedProfileDraft["status"];
  filledCount: number;
  totalCount: number;
  completionPercent: number;
  missingRequiredLabels: string[];
  wouldBeLive: boolean;
  updatedAt: string;
  claimedAt: string | null;
  claimLinkExpiresAt: string | null;
  reviewedAt: string | null;
  /** Counts only — never which field, never the owner's decision on one. */
  reviewPending: number;
  reviewDone: number;
}

export async function summarizeDraft(draft: ManagedProfileDraft): Promise<DraftSummary> {
  const [fields, liveToken] = await Promise.all([
    prisma.managedProfileDraftField.findMany({ where: { draftId: draft.id } }),
    prisma.managedDraftClaimToken.findFirst({
      where: { draftId: draft.id, usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const values = fieldsToValues(fields);
  return {
    id: draft.id,
    displayLabel: draft.displayLabel,
    creatorKind: draft.creatorKind,
    fillingForGender: draft.fillingForGender,
    status: draft.status,
    filledCount: Object.keys(values).length,
    totalCount: MANAGED_DRAFT_FIELD_KEYS.length,
    completionPercent: completionPercent(values),
    missingRequiredLabels: missingRequired(values).map((f) => f.label),
    wouldBeLive: isProfileLive(values),
    updatedAt: draft.updatedAt.toISOString(),
    claimedAt: draft.claimedAt?.toISOString() ?? null,
    claimLinkExpiresAt: liveToken?.expiresAt.toISOString() ?? null,
    reviewedAt: draft.reviewedAt?.toISOString() ?? null,
    reviewPending: fields.filter((f) => f.reviewState === "PROPOSED").length,
    reviewDone: fields.filter((f) => f.reviewState !== "PROPOSED").length,
  };
}

export async function listDraftsForCreator(creatorUserId: string): Promise<DraftSummary[]> {
  const drafts = await prisma.managedProfileDraft.findMany({
    where: { creatorUserId },
    orderBy: { updatedAt: "desc" },
  });
  const settled = await Promise.all(drafts.map((d) => applyLazyExpiry(d)));
  return Promise.all(settled.map((d) => summarizeDraft(d)));
}

/** Every draft that has been claimed by this owner — the owner's own view. */
export async function listDraftsForOwner(ownerUserId: string) {
  const drafts = await prisma.managedProfileDraft.findMany({
    where: { claimedByUserId: ownerUserId },
    orderBy: { claimedAt: "desc" },
    include: { partner: { select: { fullName: true } }, creator: { select: { fullName: true } } },
  });
  return Promise.all(
    drafts.map(async (d) => ({
      ...(await summarizeDraft(d)),
      helperName: d.partner?.fullName ?? d.creator.fullName,
      helperKind: d.creatorKind,
    })),
  );
}

/* ------------------------------------------------------------------ */
/* Autosave                                                            */
/* ------------------------------------------------------------------ */

export interface FieldContribution {
  value: string;
  source?: unknown;
  sourceContext?: unknown;
  confidence?: unknown;
}

export type SaveFieldsResult =
  | { ok: true; written: number; ignored: string[]; version: number }
  | { ok: false; error: string; message: string; status: number };

/**
 * The managed-draft equivalent of `/api/profile/save-draft`.
 *
 * Unknown keys are **reported back** rather than silently dropped, unlike
 * `saveFieldProvenance`. The difference is who is watching: provenance rides
 * along with a value that was already accepted, while this is the only write
 * path for the draft — a typo'd key that vanished quietly would look to the
 * partner like the deck lost their answer.
 *
 * An empty value clears the proposal (the deck's "Prefer not to say" / clear),
 * which deletes the row rather than storing `""` — an empty string is not an
 * answer, and `isAnswered` would have to special-case it forever.
 */
export async function saveManagedFields(
  draftId: string,
  actorUserId: string,
  entries: Record<string, FieldContribution>,
): Promise<SaveFieldsResult> {
  const ignored: string[] = [];
  const writes: { fieldKey: string; contribution: FieldContribution }[] = [];
  const clears: string[] = [];

  for (const [fieldKey, contribution] of Object.entries(entries)) {
    if (!isManagedDraftField(fieldKey)) {
      ignored.push(fieldKey);
      continue;
    }
    const value = typeof contribution?.value === "string" ? contribution.value.trim() : "";
    if (value.length === 0) {
      clears.push(fieldKey);
      continue;
    }
    if (value.length > 2000) {
      ignored.push(fieldKey);
      continue;
    }
    writes.push({ fieldKey, contribution: { ...contribution, value } });
  }

  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    for (const { fieldKey, contribution } of writes) {
      const data = {
        value: contribution.value,
        source: resolveContributionSource(contribution.source),
        sourceContext:
          typeof contribution.sourceContext === "string" ? contribution.sourceContext.slice(0, 500) : null,
        confidence: normalizeConfidence(contribution.confidence),
        proposedByUserId: actorUserId,
        proposedAt: now,
        // A changed proposal is a new proposal: it goes back into the owner's
        // queue rather than inheriting an ACCEPTED state from the value it
        // replaced. Otherwise a helper could edit a fact *after* it was
        // confirmed and have the change ride in on the old confirmation.
        reviewState: "PROPOSED" as const,
        reviewedAt: null,
        ownerValue: null,
      };
      await tx.managedProfileDraftField.upsert({
        where: { draftId_fieldKey: { draftId, fieldKey } },
        create: { draftId, fieldKey, ...data },
        update: data,
      });
    }

    if (clears.length > 0) {
      await tx.managedProfileDraftField.deleteMany({
        where: { draftId, fieldKey: { in: clears } },
      });
    }

    return tx.managedProfileDraft.update({
      where: { id: draftId },
      data: { version: { increment: 1 } },
      select: { version: true },
    });
  });

  return { ok: true, written: writes.length + clears.length, ignored, version: updated.version };
}

function normalizeConfidence(raw: unknown): number | null {
  if (typeof raw !== "number" || Number.isNaN(raw)) return null;
  const scaled = raw <= 1 ? raw * 100 : raw;
  return Math.max(0, Math.min(100, Math.round(scaled)));
}

export async function getDraftValues(draftId: string): Promise<Record<string, string>> {
  const fields = await prisma.managedProfileDraftField.findMany({ where: { draftId } });
  return fieldsToValues(fields);
}

/* ------------------------------------------------------------------ */
/* Cancel                                                              */
/* ------------------------------------------------------------------ */

export async function cancelDraft(
  draftId: string,
  actorUserId: string,
  actorLabel: string,
): Promise<{ ok: true } | { ok: false; error: string; message: string; status: number }> {
  const draft = await prisma.managedProfileDraft.findUnique({ where: { id: draftId } });
  if (!draft) return NOT_FOUND;
  if (draft.creatorUserId !== actorUserId) return NOT_FOUND;
  if (draft.claimedByUserId) {
    return {
      ok: false,
      error: "ALREADY_CLAIMED",
      message: "Claim hone ke baad ye draft unka hai — ise aap band nahi kar sakte.",
      status: 409,
    };
  }

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.managedDraftClaimToken.updateMany({
      where: { draftId, usedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await tx.managedProfileDraft.update({
      where: { id: draftId },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
  });

  await recordConsentEvent({
    kind: "DRAFT_CANCELLED",
    actorUserId,
    actorLabel,
    draftId,
  });

  return { ok: true };
}
