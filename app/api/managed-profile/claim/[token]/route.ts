import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { claimDraft, getClaimPreview } from "@/lib/services/managedProfile/claimTokenService";
import { notifyOwnerReviewPending } from "@/lib/services/managedProfile/ownerReviewService";
import { prisma } from "@/lib/db/prisma";
import { createNotice } from "@/lib/services/notice/noticeService";

export const runtime = "nodejs";

/**
 * The pre-authentication preview.
 *
 * Unauthenticated on purpose — the person opening the link may not have an
 * account yet, and asking them to register before showing them *anything*
 * about what they are being asked to accept is how consent screens become
 * rubber stamps. What makes that safe is how little comes back: creator type,
 * a verified partner's name, the label the creator typed, a count of answers,
 * and the expiry. No field keys, no values, and nothing that could identify
 * the subject to someone the link was forwarded to by mistake.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await getClaimPreview(token);
  if (!result.ok) {
    return NextResponse.json({ error: result.problem, message: result.message }, { status: 404 });
  }
  return NextResponse.json({ preview: result.preview });
}

/**
 * Bind the draft to the signed-in account.
 *
 * Everything that decides the outcome — who the claimant is, whether their
 * contact is proven, whether the token is live, whether somebody already won
 * the race — is read server-side. The request body is ignored entirely; there
 * is nothing a caller could put in it that this route would read.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHENTICATED", message: "Pehle login karein." }, { status: 401 });
  }

  const { token } = await params;
  const result = await claimDraft(token, user);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, message: result.message, ctaHref: result.ctaHref ?? null },
      { status: result.status },
    );
  }

  const draft = await prisma.managedProfileDraft.findUnique({
    where: { id: result.draftId },
    include: { partner: { select: { fullName: true } }, creator: { select: { id: true, fullName: true } } },
  });

  if (draft) {
    const helperLabel = draft.partner?.fullName ?? draft.creator.fullName;
    await notifyOwnerReviewPending(user.id, draft.id, helperLabel);
    // The creator learns the link was used. Nothing about the owner beyond
    // that — not their name, not their contact, not their account.
    await createNotice({
      userId: draft.creator.id,
      kind: "FAMILY_ACTION",
      title: "Client ne draft claim kar liya",
      body: `${draft.displayLabel} ne apne account se ye draft claim kar liya hai. Ab wo details review karenge.`,
      href: draft.creatorKind === "PARTNER" ? `/partner/clients/${draft.id}` : `/user/managed-drafts/${draft.id}`,
      relatedId: draft.id,
    });
  }

  return NextResponse.json({ draftId: result.draftId, next: `/user/profile/managed-review/${result.draftId}` });
}
