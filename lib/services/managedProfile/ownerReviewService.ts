import "server-only";
import { prisma } from "@/lib/db/prisma";
import { FIELD_BY_KEY } from "@/lib/profile/fields";
import { isAnswered } from "@/lib/profile/stages";
import { saveDraft } from "@/lib/services/profile/draftService";
import { PROFILE_FULL_INCLUDE } from "@/lib/services/profile/profileInclude";
import { computeCompletion } from "@/lib/services/profile/completionService";
import { submitProfile } from "@/lib/services/profile/submitService";
import { saveContributedFieldProvenance } from "@/lib/services/profile/provenanceService";
import { createNotice } from "@/lib/services/notice/noticeService";
import { recordConsentEvent, recordConsentEvents, type ConsentEventInput } from "./consentLog";
import { labelFor, requiresIndividualConfirmation } from "./managedProfilePolicy";
import type { ManagedProfileDraft, RespondentType, SignalSource } from "@prisma/client";

/**
 * The owner's review — the only door between a third party's claims and a real
 * profile.
 *
 * ## Two decisions, two provenances
 *
 * Accepting keeps the contributor as the source (`PARTNER_ENTERED` /
 * `FAMILY_ENTERED`) and sets `confirmed`. Correcting writes the owner's own
 * value with `USER_ENTERED` / `SELF`, because that is literally what happened —
 * the value on the profile is now the owner's words, not the helper's. The
 * superseded proposal is not deleted: it stays on the draft row, so "partner
 * ne kya likha tha" remains answerable without keeping a stale claim alive on
 * the profile itself.
 *
 * ## Sensitive facts are decided one at a time — enforced here, not in the UI
 *
 * `bulkAcceptOrdinary` chooses its own field list from the database and
 * ignores anything the caller sends, so it structurally cannot sweep up a
 * sensitive field. `decideFields` accepts either any number of ordinary
 * decisions **or exactly one sensitive decision and nothing else** — which is
 * what "individually confirmed" means when the client is untrusted. A UI that
 * tried to batch fifteen sensitive confirmations gets a 422, not a silent
 * partial write.
 *
 * ## Nothing reaches discovery early
 *
 * Values are written through `saveDraft` — the same mapping/completion service
 * the owner's own profile builder uses — only for decisions that landed on
 * ACCEPTED or REPLACED. A PROPOSED row has no route to a `Profile` column at
 * all.
 */

/* ------------------------------------------------------------------ */
/* Read                                                                */
/* ------------------------------------------------------------------ */

export interface ReviewItem {
  fieldKey: string;
  label: string;
  /** What the helper proposed. */
  proposedValue: string;
  /** Present only once the owner replaced it. */
  ownerValue: string | null;
  sensitive: boolean;
  reviewState: "PROPOSED" | "ACCEPTED" | "REJECTED" | "REPLACED";
  contributorLabel: string;
  /** The field's own catalog metadata the review card needs to render an editor. */
  type: string;
  options: string[] | null;
  whyNeeded: string | null;
}

export interface ReviewView {
  draftId: string;
  status: ManagedProfileDraft["status"];
  helperName: string;
  helperKind: ManagedProfileDraft["creatorKind"];
  ordinaryPending: ReviewItem[];
  sensitivePending: ReviewItem[];
  decided: ReviewItem[];
  pendingCount: number;
  /** Required fields still unanswered on the *owner's real profile* after
   *  everything decided so far — what actually stands between them and live. */
  missingRequiredLabels: string[];
  isLive: boolean;
  photosPending: boolean;
}

export type ReviewResult<T> = { ok: true; data: T } | { ok: false; error: string; message: string; status: number };

function contributorLabelFor(draft: { creatorKind: ManagedProfileDraft["creatorKind"] }, helperName: string): string {
  return draft.creatorKind === "PARTNER" ? `${helperName} (partner) ne bhara` : `${helperName} (family) ne bhara`;
}

export async function getReviewView(ownerUserId: string, draftId: string): Promise<ReviewResult<ReviewView>> {
  const draft = await prisma.managedProfileDraft.findUnique({
    where: { id: draftId },
    include: {
      partner: { select: { fullName: true } },
      creator: { select: { fullName: true } },
      fields: { orderBy: { fieldKey: "asc" } },
    },
  });

  if (!draft || draft.claimedByUserId !== ownerUserId) {
    return { ok: false, error: "NOT_FOUND", message: "Ye draft nahi mila.", status: 404 };
  }

  const helperName = draft.partner?.fullName ?? draft.creator.fullName;
  const contributorLabel = contributorLabelFor(draft, helperName);

  const items: ReviewItem[] = draft.fields.map((f) => {
    const def = FIELD_BY_KEY[f.fieldKey];
    return {
      fieldKey: f.fieldKey,
      label: def?.label ?? f.fieldKey,
      proposedValue: f.value,
      ownerValue: f.ownerValue,
      sensitive: requiresIndividualConfirmation(f.fieldKey),
      reviewState: f.reviewState,
      contributorLabel,
      type: def?.type ?? "text",
      options: def?.options ?? null,
      whyNeeded: def?.whyNeeded ?? null,
    };
  });

  const profile = await prisma.profile.findUnique({
    where: { userId: ownerUserId },
    include: PROFILE_FULL_INCLUDE,
  });

  let missingRequiredLabels: string[] = [];
  let isLive = false;
  if (profile) {
    const completion = computeCompletion(profile);
    missingRequiredLabels = completion.missingFields;
    isLive = completion.isLive;
  } else {
    missingRequiredLabels = Object.values(FIELD_BY_KEY)
      .filter((f) => f.required && f.type !== "photo")
      .map((f) => f.label);
  }

  const pending = items.filter((i) => i.reviewState === "PROPOSED");

  return {
    ok: true,
    data: {
      draftId: draft.id,
      status: draft.status,
      helperName,
      helperKind: draft.creatorKind,
      ordinaryPending: pending.filter((i) => !i.sensitive),
      sensitivePending: pending.filter((i) => i.sensitive),
      decided: items.filter((i) => i.reviewState !== "PROPOSED"),
      pendingCount: pending.length,
      missingRequiredLabels,
      isLive,
      // Photos are never in a managed draft (see MANAGED_DRAFT_FIELD_KEYS), so
      // uploading one is an owner task surfaced here rather than a gap the
      // helper could have filled.
      photosPending: (profile?.photos.filter((p) => !p.deletedAt).length ?? 0) === 0,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Decide                                                              */
/* ------------------------------------------------------------------ */

export type DecisionAction = "accept" | "reject" | "replace";

export interface FieldDecision {
  fieldKey: string;
  action: DecisionAction;
  /** Required for `replace`. */
  value?: string;
}

export interface DecisionOutcome {
  applied: number;
  rejected: number;
  replaced: number;
  /** Field labels a bulk sweep left alone because the value is not a valid
   *  catalog answer — they come back as individual cards to correct. */
  skipped: string[];
  isLive: boolean;
  justActivated: boolean;
  pendingCount: number;
}

/**
 * Apply a batch of owner decisions.
 *
 * The batching rule (see the file header) is enforced first, before anything
 * is written — a request that mixes a sensitive decision with others is
 * refused whole rather than partially honoured.
 */
export async function decideFields(
  ownerUserId: string,
  ownerName: string,
  draftId: string,
  decisions: FieldDecision[],
): Promise<ReviewResult<DecisionOutcome>> {
  if (decisions.length === 0) {
    return { ok: false, error: "VALIDATION_FAILED", message: "Koi decision nahi bheja gaya.", status: 422 };
  }

  const sensitive = decisions.filter((d) => requiresIndividualConfirmation(d.fieldKey));
  if (sensitive.length > 0 && decisions.length > 1) {
    return {
      ok: false,
      error: "SENSITIVE_MUST_BE_INDIVIDUAL",
      message: "Zaroori details ek-ek karke hi confirm hoti hain.",
      status: 422,
    };
  }

  return applyDecisions(ownerUserId, ownerName, draftId, decisions, { skipInvalid: false });
}

/**
 * "Confirm all ordinary details".
 *
 * The field list is read from the database, never from the request — so this
 * endpoint has no input a caller could use to smuggle a sensitive key in.
 */
export async function bulkAcceptOrdinary(
  ownerUserId: string,
  ownerName: string,
  draftId: string,
): Promise<ReviewResult<DecisionOutcome>> {
  const rows = await prisma.managedProfileDraftField.findMany({
    where: { draftId, reviewState: "PROPOSED" },
    select: { fieldKey: true },
  });
  const ordinary = rows
    .map((r) => r.fieldKey)
    .filter((k) => !requiresIndividualConfirmation(k))
    .map<FieldDecision>((fieldKey) => ({ fieldKey, action: "accept" }));

  if (ordinary.length === 0) {
    return { ok: false, error: "NOTHING_TO_DO", message: "Confirm karne ko koi aam detail baaki nahi hai.", status: 409 };
  }

  // `skipInvalid` is the whole difference between the two entry points. An
  // explicit per-field decision that names an unusable value is a 422 the
  // owner should see; a sweep the *server* assembled must not be blocked
  // wholesale because one proposal happens to sit outside its catalog's option
  // list (a helper typed a rare answer, or the catalog moved under an old
  // draft). Those stay PROPOSED and come back as individual cards.
  return applyDecisions(ownerUserId, ownerName, draftId, ordinary, { skipInvalid: true });
}

const SOURCE_FOR_KIND: Record<ManagedProfileDraft["creatorKind"], SignalSource> = {
  PARTNER: "PARTNER_ENTERED",
  FAMILY: "FAMILY_ENTERED",
};

const RESPONDENT_FOR_KIND: Record<ManagedProfileDraft["creatorKind"], RespondentType> = {
  PARTNER: "PARTNER",
  FAMILY: "PARENT",
};

async function applyDecisions(
  ownerUserId: string,
  ownerName: string,
  draftId: string,
  decisions: FieldDecision[],
  opts: { skipInvalid: boolean },
): Promise<ReviewResult<DecisionOutcome>> {
  const draft = await prisma.managedProfileDraft.findUnique({
    where: { id: draftId },
    include: { fields: true, partner: { select: { fullName: true, userId: true } }, creator: { select: { fullName: true } } },
  });

  if (!draft || draft.claimedByUserId !== ownerUserId) {
    return { ok: false, error: "NOT_FOUND", message: "Ye draft nahi mila.", status: 404 };
  }
  if (draft.status === "CANCELLED") {
    return { ok: false, error: "CANCELLED", message: "Ye draft band ho chuka hai.", status: 409 };
  }

  const byKey = new Map(draft.fields.map((f) => [f.fieldKey, f]));
  const now = new Date();

  const valuesToApply: Record<string, string> = {};
  const provenance: Parameters<typeof saveContributedFieldProvenance>[1] = [];
  const events: ConsentEventInput[] = [];
  const helperName = draft.partner?.fullName ?? draft.creator.fullName;

  let applied = 0;
  let rejected = 0;
  let replaced = 0;
  const skipped: string[] = [];

  for (const decision of decisions) {
    const row = byKey.get(decision.fieldKey);
    if (!row || row.reviewState !== "PROPOSED") continue;
    const def = FIELD_BY_KEY[decision.fieldKey];
    if (!def) continue;

    if (decision.action === "reject") {
      await prisma.managedProfileDraftField.update({
        where: { id: row.id },
        data: { reviewState: "REJECTED", reviewedAt: now },
      });
      rejected++;
      events.push({
        kind: "FIELD_REJECTED",
        ownerUserId,
        actorUserId: ownerUserId,
        actorLabel: ownerName,
        draftId,
        fieldKey: decision.fieldKey,
      });
      continue;
    }

    if (decision.action === "replace") {
      const value = (decision.value ?? "").trim();
      if (!value) {
        return {
          ok: false,
          error: "VALIDATION_FAILED",
          message: `${def.label} ke liye nayi value chahiye.`,
          status: 422,
        };
      }
      // A corrected select answer still has to be a real catalog option — the
      // same rule `isAnswered` applies to every other value on the profile.
      if (!isAnswered(def, { [def.key]: value })) {
        if (opts.skipInvalid) {
          skipped.push(def.label);
          continue;
        }
        return {
          ok: false,
          error: "VALIDATION_FAILED",
          message: `${def.label} ki ye value list me nahi hai.`,
          status: 422,
        };
      }
      await prisma.managedProfileDraftField.update({
        where: { id: row.id },
        data: { reviewState: "REPLACED", reviewedAt: now, ownerValue: value },
      });
      valuesToApply[decision.fieldKey] = value;
      provenance.push({
        fieldKey: decision.fieldKey,
        source: "USER_ENTERED",
        respondentType: "SELF",
        confirmed: true,
        sourceContext: null,
      });
      replaced++;
      events.push({
        kind: "FIELD_REPLACED",
        ownerUserId,
        actorUserId: ownerUserId,
        actorLabel: ownerName,
        draftId,
        fieldKey: decision.fieldKey,
      });
      continue;
    }

    // accept
    if (!isAnswered(def, { [def.key]: row.value })) {
      if (opts.skipInvalid) {
        skipped.push(def.label);
        continue;
      }
      return {
        ok: false,
        error: "VALIDATION_FAILED",
        message: `${def.label} ki value list me nahi hai — "Change" se theek kar dijiye.`,
        status: 422,
      };
    }
    await prisma.managedProfileDraftField.update({
      where: { id: row.id },
      data: { reviewState: "ACCEPTED", reviewedAt: now },
    });
    valuesToApply[decision.fieldKey] = row.value;
    provenance.push({
      fieldKey: decision.fieldKey,
      source: SOURCE_FOR_KIND[draft.creatorKind],
      respondentType: RESPONDENT_FOR_KIND[draft.creatorKind],
      confirmed: true,
      sourceContext: row.sourceContext,
      confidence: row.confidence,
    });
    applied++;
    events.push({
      kind: requiresIndividualConfirmation(decision.fieldKey) ? "SENSITIVE_FIELD_ACCEPTED" : "FIELD_ACCEPTED",
      ownerUserId,
      actorUserId: ownerUserId,
      actorLabel: helperName,
      draftId,
      fieldKey: decision.fieldKey,
    });
  }

  let isLive = false;
  let justActivated = false;

  if (Object.keys(valuesToApply).length > 0) {
    // The existing owner-side write path, unchanged — mapping, sub-table
    // upserts and both completion columns all stay in one place.
    const profile = await saveDraft(ownerUserId, valuesToApply);
    await saveContributedFieldProvenance(profile.id, provenance);

    const completion = computeCompletion(profile);
    isLive = completion.isLive;
    if (
      completion.isFullySubmittable &&
      profile.profileStatus !== "SUBMITTED" &&
      profile.profileStatus !== "VERIFIED"
    ) {
      const result = await submitProfile(ownerUserId);
      justActivated = result.ok;
    }
  } else {
    const existing = await prisma.profile.findUnique({ where: { userId: ownerUserId } });
    isLive = Boolean(existing?.isVisible);
  }

  await recordConsentEvents(events);

  const pendingCount = await prisma.managedProfileDraftField.count({
    where: { draftId, reviewState: "PROPOSED" },
  });

  return { ok: true, data: { applied, rejected, replaced, skipped, isLive, justActivated, pendingCount } };
}

/* ------------------------------------------------------------------ */
/* Finish                                                              */
/* ------------------------------------------------------------------ */

export type FinishResult =
  | { ok: true; pendingCount: number }
  | { ok: false; error: string; message: string; status: number };

/**
 * Mark the review done. Does not require every field to be decided — an owner
 * who never wants to answer "gotra" should not be trapped on this screen
 * forever. What it does require is that nothing undecided has silently reached
 * the profile, which is true by construction.
 */
export async function finishReview(
  ownerUserId: string,
  ownerName: string,
  draftId: string,
): Promise<FinishResult> {
  const draft = await prisma.managedProfileDraft.findUnique({
    where: { id: draftId },
    include: { partner: { select: { userId: true, fullName: true } }, creator: { select: { id: true, fullName: true } } },
  });
  if (!draft || draft.claimedByUserId !== ownerUserId) {
    return { ok: false, error: "NOT_FOUND", message: "Ye draft nahi mila.", status: 404 };
  }

  const pendingCount = await prisma.managedProfileDraftField.count({
    where: { draftId, reviewState: "PROPOSED" },
  });

  await prisma.managedProfileDraft.update({
    where: { id: draftId },
    data: { status: "CONFIRMED", reviewedAt: new Date() },
  });

  await recordConsentEvent({
    kind: "REVIEW_COMPLETED",
    ownerUserId,
    actorUserId: ownerUserId,
    actorLabel: ownerName,
    draftId,
    detail: pendingCount > 0 ? `${pendingCount} details abhi bhi undecided` : "Sab details dekh li gayin",
  });

  // The creator is told the review finished. Never what was accepted, changed
  // or rejected — that is the owner's business, and a notification is exactly
  // the place a "helpful" detail leaks.
  await createNotice({
    userId: draft.creator.id,
    kind: "FAMILY_ACTION",
    title: "Client ne review poora kiya",
    body: `${draft.displayLabel} ka review poora ho gaya hai.`,
    href: draft.creatorKind === "PARTNER" ? `/partner/clients/${draftId}` : `/user/managed-drafts/${draftId}`,
    relatedId: draftId,
  });

  return { ok: true, pendingCount };
}

/** Fired right after a claim, so the owner sees the queue even if they close
 *  the tab before reviewing. */
export async function notifyOwnerReviewPending(ownerUserId: string, draftId: string, helperLabel: string): Promise<void> {
  await createNotice({
    userId: ownerUserId,
    kind: "FAMILY_ACTION",
    title: "Aapki profile ke liye details bhari gayi hain",
    body: `${helperLabel} ne kuch details bhari hain. Jab tak aap confirm nahi karte, wo aapki profile par nahi lagengi.`,
    href: `/user/profile/managed-review/${draftId}`,
    relatedId: draftId,
  });
}

export { labelFor };
