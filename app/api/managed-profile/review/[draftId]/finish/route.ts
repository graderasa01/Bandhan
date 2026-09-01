import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { prisma } from "@/lib/db/prisma";
import { appOrigin } from "@/lib/utils/appOrigin";
import { finishReview } from "@/lib/services/managedProfile/ownerReviewService";
import { grantDelegation } from "@/lib/services/managedProfile/delegationService";
import { recordConsentEvent } from "@/lib/services/managedProfile/consentLog";
import { DEFAULT_DELEGATION_DAYS, sanitizePermissions } from "@/lib/services/managedProfile/managedProfilePolicy";
import { inviteFamilyMember } from "@/lib/services/family/familyService";
import { createNotice } from "@/lib/services/notice/noticeService";

export const runtime = "nodejs";

const BodySchema = z.object({
  /** Whether the helper may keep helping. Default is no — this is opt-in. */
  grant_access: z.boolean(),
  permissions: z.array(z.string()).optional(),
  days: z.number().int().positive().optional(),
  /** FAMILY drafts only — how this person is seated in the Family Circle. */
  family_relation: z.enum(["PARENT", "SIBLING", "GUARDIAN"]).optional(),
  family_display_name: z.string().trim().min(1).max(40).optional(),
});

/**
 * Finish the review, and decide what happens to the helper.
 *
 * ## Two different afterlives, on purpose
 *
 * A **partner** gets a `ProfileDelegation` and nothing else: their own login
 * already exists, and the scope is exactly the three Phase 1 permissions.
 *
 * A **family** helper gets a `FamilyMember` invite *as well as* the
 * delegation, and the delegation points at that row. This is the one place the
 * plan's "do not invent a second parallel family-auth system" rule actually
 * bites: continued family access has to run through D-03's existing portal —
 * its seat limits, its view-only permission table, and above all its
 * structural "family session can never present the member cookie, therefore
 * can never reach chat" property. A managed draft is how a parent *starts* a
 * profile; it is not a new way for them to keep reading one.
 *
 * ## Not granting is a first-class outcome
 *
 * `grant_access: false` finishes the review and leaves the helper with
 * nothing. No delegation row, no pending invite, no "we'll ask again later".
 */
export async function POST(req: Request, { params }: { params: Promise<{ draftId: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { draftId } = await params;
  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = BodySchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_FAILED", message: "Galat input." }, { status: 422 });
  }

  const draft = await prisma.managedProfileDraft.findUnique({
    where: { id: draftId },
    include: { partner: { select: { id: true, fullName: true, userId: true } }, creator: { select: { id: true, fullName: true } } },
  });
  if (!draft || draft.claimedByUserId !== user.id) {
    return NextResponse.json({ error: "NOT_FOUND", message: "Ye draft nahi mila." }, { status: 404 });
  }

  const finished = await finishReview(user.id, user.fullName, draftId);
  if (!finished.ok) {
    return NextResponse.json({ error: finished.error, message: finished.message }, { status: finished.status });
  }

  if (!parsed.data.grant_access) {
    await recordConsentEvent({
      kind: "DELEGATION_DECLINED",
      ownerUserId: user.id,
      actorUserId: user.id,
      actorLabel: draft.partner?.fullName ?? draft.creator.fullName,
      draftId,
    });
    return NextResponse.json({ pendingCount: finished.pendingCount, granted: false, familyInviteUrl: null });
  }

  const permissions = sanitizePermissions(parsed.data.permissions ?? ["VIEW_CONFIRMED_PROFILE", "VIEW_REVIEW_STATUS"]);
  const days = parsed.data.days ?? DEFAULT_DELEGATION_DAYS;
  const helperName = draft.partner?.fullName ?? draft.creator.fullName;

  let familyMemberId: string | null = null;
  let familyInviteUrl: string | null = null;

  if (draft.creatorKind === "FAMILY") {
    const displayName = parsed.data.family_display_name ?? helperName.slice(0, 40);
    const invite = await inviteFamilyMember(user.id, {
      displayName,
      relation: parsed.data.family_relation ?? "PARENT",
    });
    if (!invite.ok) {
      // Seat limit or a duplicate name — a real, explainable refusal. The
      // review is already finished, so nothing is lost by saying so plainly.
      return NextResponse.json(
        { error: invite.error, message: invite.message, pendingCount: finished.pendingCount, granted: false },
        { status: invite.status },
      );
    }
    familyMemberId = invite.member.id;
    familyInviteUrl = `${appOrigin()}/f/${invite.member.inviteToken}`;
  }

  const granted = await grantDelegation({
    ownerUserId: user.id,
    actorUserId: user.id,
    draftId,
    partnerId: draft.partner?.id ?? null,
    familyMemberId,
    delegateUserId: draft.partner?.userId ?? draft.creator.id,
    permissions,
    days,
    helperLabel: helperName,
  });

  if (!granted.ok) {
    return NextResponse.json({ error: granted.error, message: granted.message }, { status: granted.status });
  }

  await createNotice({
    userId: draft.creator.id,
    kind: "FAMILY_ACTION",
    title: "Aapko profile access mila",
    body: `${draft.displayLabel} ne aapko ${days} din ke liye limited access diya hai.`,
    href: draft.creatorKind === "PARTNER" ? `/partner/clients/${draftId}` : `/user/managed-drafts/${draftId}`,
    relatedId: draftId,
  });

  return NextResponse.json({
    pendingCount: finished.pendingCount,
    granted: true,
    delegationId: granted.delegation.id,
    familyInviteUrl,
  });
}
