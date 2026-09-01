import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { prisma } from "@/lib/db/prisma";
import {
  fieldsToValues,
  resolveDraftAccess,
  summarizeDraft,
} from "@/lib/services/managedProfile/managedDraftService";
import type { FieldMeta, FieldSource } from "@/lib/profile/profileState";
import type { SignalSource } from "@prisma/client";

export const runtime = "nodejs";

/** Back the other way from the route's own vocabulary — the deck's badges
 *  speak in three words, the database in a wider enum. */
const CLIENT_SOURCE: Partial<Record<SignalSource, FieldSource>> = {
  USER_ENTERED: "user",
  BIODATA_EXTRACTED: "ai",
  USER_CONFIRMED_AI: "ai",
  AI_INFERRED: "inferred",
};

/**
 * One draft, in the shape `ManagedProfileDraftProvider` hydrates from.
 *
 * `values` is present only when the caller may actually read them —
 * `resolveDraftAccess` decides, and after a claim that means holding a live
 * `VIEW_CONFIRMED_PROFILE` delegation. A revoked partner still gets a 200 with
 * the draft's *status*, because "your access ended" is a better answer than a
 * 404 that suggests the client vanished; what they never get is the data.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ draftId: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { draftId } = await params;
  const result = await resolveDraftAccess(user.id, draftId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }

  const { draft, role, canReadValues, canWriteValues, canManageClaimLink } = result.access;
  const summary = await summarizeDraft(draft);

  if (!canReadValues) {
    return NextResponse.json({
      draft: summary,
      role,
      canReadValues: false,
      canWriteValues: false,
      canManageClaimLink,
      accessRevoked: true,
      values: {},
      meta: {},
    });
  }

  const fields = await prisma.managedProfileDraftField.findMany({ where: { draftId } });
  const meta: Record<string, FieldMeta> = {};
  for (const f of fields) {
    if (f.reviewState === "REJECTED") continue;
    meta[f.fieldKey] = {
      source: CLIENT_SOURCE[f.source] ?? "user",
      confidence: f.confidence ?? undefined,
      sourceSpan: f.sourceContext ?? undefined,
      confirmed: f.reviewState === "ACCEPTED" || f.reviewState === "REPLACED",
    };
  }

  return NextResponse.json({
    draft: summary,
    role,
    canReadValues,
    canWriteValues,
    canManageClaimLink,
    accessRevoked: false,
    values: fieldsToValues(fields),
    meta,
  });
}
