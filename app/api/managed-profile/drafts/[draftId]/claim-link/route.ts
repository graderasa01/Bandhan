import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { resolveDraftAccess } from "@/lib/services/managedProfile/managedDraftService";
import { resolveCreatorContext } from "@/lib/services/managedProfile/managedEligibility";
import { issueClaimToken, revokeClaimTokens } from "@/lib/services/managedProfile/claimTokenService";

export const runtime = "nodejs";

async function gate(userId: string, draftId: string) {
  const access = await resolveDraftAccess(userId, draftId);
  if (!access.ok) {
    return { ok: false as const, response: NextResponse.json({ error: access.error, message: access.message }, { status: access.status }) };
  }
  if (!access.access.canManageClaimLink) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "FORBIDDEN", message: "Ye draft claim ho chuka hai — link ab nahi banaya ja sakta." },
        { status: 403 },
      ),
    };
  }
  return { ok: true as const };
}

/**
 * Issue (or regenerate) the claim link.
 *
 * The raw token is returned here and **nowhere else** — no read endpoint
 * replays it, and no audit or consent row records it. A partner who loses the
 * link regenerates, which invalidates the old one; that is strictly better
 * than a "show me the link again" endpoint, which would turn every read of the
 * client list into a credential disclosure.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ draftId: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { draftId } = await params;
  const gated = await gate(user.id, draftId);
  if (!gated.ok) return gated.response;

  const contextResult = await resolveCreatorContext(user);
  if (!contextResult.ok) {
    return NextResponse.json(
      { error: contextResult.block, message: contextResult.message, ctaHref: contextResult.ctaHref },
      { status: contextResult.status },
    );
  }

  const result = await issueClaimToken(draftId, user.id, contextResult.context.label);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }

  return NextResponse.json({
    url: result.url,
    expiresAt: result.expiresAt.toISOString(),
    regenerated: result.regenerated,
  });
}

/** Kill every outstanding link for this draft. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ draftId: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { draftId } = await params;
  const gated = await gate(user.id, draftId);
  if (!gated.ok) return gated.response;

  const contextResult = await resolveCreatorContext(user);
  const label = contextResult.ok ? contextResult.context.label : user.fullName;

  const result = await revokeClaimTokens(draftId, user.id, label);
  return NextResponse.json({ revoked: result.revoked });
}
