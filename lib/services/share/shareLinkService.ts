import "server-only";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db/prisma";
import { PROFILE_FULL_INCLUDE } from "@/lib/services/profile/profileInclude";
import { getProfileVisibility } from "@/lib/services/profile/visibility";
import { getSochBoard, type SochBoardEntry } from "@/lib/services/vibe/sochBoardService";
import type { ProfileWithSubTables } from "@/lib/services/profile/completionService";
import type { ShareLink, ShareLinkKind } from "@prisma/client";

/**
 * One link system, two uses (Phase 3, `09_phase_plan…md` §3).
 *
 *  - OWN_BIODATA — the owner exports their own profile, on their own terms.
 *    Mobile/income are the caller's choice, same as the print biodata already
 *    lets them pick.
 *  - RISHTA_CARD — a viewer shares a *matched* candidate's profile onward to
 *    family. This only exists because L3 (`visibility.ts`) already opened that
 *    profile to the viewer; mobile/income are hardcoded false here and never
 *    taken from the caller, because a candidate who agreed to be seen by one
 *    match never agreed to have their number or income forwarded to a WhatsApp
 *    group the platform has no visibility into.
 *
 * A link is a bearer token: whoever has the URL can view it, no login checked.
 * That is deliberate (a parent with no BandhanTak account has to be able to
 * open it) but it means the *token itself* is the whole access control, so it
 * is 16 random bytes (128 bits) — nothing about who it's for or when it was
 * made is guessable from it.
 */

const TOKEN_BYTES = 16;
const EXPIRY_DAYS = 30;

function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

function expiryDate(): Date {
  return new Date(Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000);
}

export type ShareLinkResult =
  | { ok: true; link: ShareLink }
  | { ok: false; error: string; message: string; status: number };

/**
 * Re-sharing the same thing twice creates a second link with its own view
 * count, splitting the one number ("3 logon ne dekha") the owner actually
 * wants to see. So: reuse an active link with identical options if one
 * exists, and only mint a new one when the options actually changed or
 * nothing active exists yet.
 */
async function getOrCreateLink(params: {
  kind: ShareLinkKind;
  profileId: string;
  createdByUserId: string;
  includeMobile: boolean;
  includeIncome: boolean;
}): Promise<ShareLink> {
  const existing = await prisma.shareLink.findFirst({
    where: {
      kind: params.kind,
      profileId: params.profileId,
      createdByUserId: params.createdByUserId,
      includeMobile: params.includeMobile,
      includeIncome: params.includeIncome,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing;

  return prisma.shareLink.create({
    data: {
      token: generateToken(),
      kind: params.kind,
      profileId: params.profileId,
      createdByUserId: params.createdByUserId,
      includeMobile: params.includeMobile,
      includeIncome: params.includeIncome,
      expiresAt: expiryDate(),
    },
  });
}

export async function createOwnBiodataLink(
  userId: string,
  options: { includeMobile: boolean; includeIncome: boolean },
): Promise<ShareLinkResult> {
  const profile = await prisma.profile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) return { ok: false, error: "NOT_FOUND", message: "Profile nahi mila.", status: 404 };

  const link = await getOrCreateLink({
    kind: "OWN_BIODATA",
    profileId: profile.id,
    createdByUserId: userId,
    includeMobile: options.includeMobile,
    includeIncome: options.includeIncome,
  });
  return { ok: true, link };
}

/** C7 — self-share, same shape as `createOwnBiodataLink`: no visibility gate needed for your own board. */
export async function createSochBoardLink(userId: string): Promise<ShareLinkResult> {
  const profile = await prisma.profile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) return { ok: false, error: "NOT_FOUND", message: "Profile nahi mila.", status: 404 };

  const link = await getOrCreateLink({
    kind: "SOCH_BOARD",
    profileId: profile.id,
    createdByUserId: userId,
    includeMobile: false,
    includeIncome: false,
  });
  return { ok: true, link };
}

export async function createRishtaCardLink(viewerUserId: string, targetProfileId: string): Promise<ShareLinkResult> {
  const target = await prisma.profile.findUnique({ where: { id: targetProfileId }, select: { userId: true } });
  if (!target) return { ok: false, error: "NOT_FOUND", message: "Profile nahi mila.", status: 404 };

  if (target.userId === viewerUserId) {
    return {
      ok: false,
      error: "BAD_REQUEST",
      message: "Apni khud ki profile share karne ke liye Biodata page use karein.",
      status: 400,
    };
  }

  // The one real gate: only a Match opens L3, and this link exists only
  // because that already happened. Re-checked here rather than trusted from
  // the caller — the profile page only *shows* the share button at L3, it
  // doesn't enforce anything.
  const visibility = await getProfileVisibility(viewerUserId, target.userId);
  if (visibility.level !== "L3") {
    return {
      ok: false,
      error: "NOT_MATCHED",
      message: "Sirf match hui profile ka Rishta Card share ho sakta hai.",
      status: 403,
    };
  }

  const link = await getOrCreateLink({
    kind: "RISHTA_CARD",
    profileId: targetProfileId,
    createdByUserId: viewerUserId,
    includeMobile: false,
    includeIncome: false,
  });
  return { ok: true, link };
}

export interface ShareLinkRow {
  id: string;
  token: string;
  kind: ShareLinkKind;
  profileId: string;
  isActive: boolean;
  expiresAt: string;
  viewCount: number;
  lastViewedAt: string | null;
  createdAt: string;
}

function toRow(link: ShareLink): ShareLinkRow {
  return {
    id: link.id,
    token: link.token,
    kind: link.kind,
    profileId: link.profileId,
    isActive: !link.revokedAt && link.expiresAt > new Date(),
    expiresAt: link.expiresAt.toISOString(),
    viewCount: link.viewCount,
    lastViewedAt: link.lastViewedAt?.toISOString() ?? null,
    createdAt: link.createdAt.toISOString(),
  };
}

export async function listShareLinks(
  userId: string,
  filter: { kind: ShareLinkKind; profileId?: string },
): Promise<ShareLinkRow[]> {
  const links = await prisma.shareLink.findMany({
    where: {
      createdByUserId: userId,
      kind: filter.kind,
      ...(filter.profileId ? { profileId: filter.profileId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  return links.map(toRow);
}

export async function revokeShareLink(userId: string, linkId: string): Promise<ShareLinkResult> {
  const link = await prisma.shareLink.findUnique({ where: { id: linkId } });
  if (!link || link.createdByUserId !== userId) {
    return { ok: false, error: "NOT_FOUND", message: "Link nahi mila.", status: 404 };
  }
  if (link.revokedAt) return { ok: true, link }; // idempotent

  const updated = await prisma.shareLink.update({ where: { id: linkId }, data: { revokedAt: new Date() } });
  return { ok: true, link: updated };
}

export type ResolvedShareLink =
  | { status: "not_found" }
  | { status: "inactive"; reason: "expired" | "revoked" }
  | {
      status: "ok";
      kind: ShareLinkKind;
      sharerName: string;
      createdAt: Date;
      profile: ProfileWithSubTables;
      mobile: string | null;
      includeMobile: boolean;
      includeIncome: boolean;
      /**
       * Only populated for SOCH_BOARD. Re-checks the board's own master
       * toggle at resolve time (not just at link-creation time) — turning
       * the board off has to blank out every outstanding link too, not just
       * the in-app view.
       */
      sochBoard: SochBoardEntry[] | null;
    };

/**
 * The public read. `viewerUserId` is only used to skip counting the owner's
 * own preview as a "view" — the page itself never requires a session.
 */
export async function resolveShareLink(token: string, viewerUserId?: string): Promise<ResolvedShareLink> {
  const link = await prisma.shareLink.findUnique({
    where: { token },
    include: { createdBy: { select: { fullName: true, mobile: true } } },
  });
  if (!link) return { status: "not_found" };
  if (link.revokedAt) return { status: "inactive", reason: "revoked" };
  if (link.expiresAt <= new Date()) return { status: "inactive", reason: "expired" };

  const profile = await prisma.profile.findUnique({ where: { id: link.profileId }, include: PROFILE_FULL_INCLUDE });
  // The profile behind an otherwise-valid link was deleted after the link was
  // made — same user-facing outcome as any other dead link.
  if (!profile) return { status: "not_found" };

  const isOwnerPreviewing = viewerUserId != null && viewerUserId === link.createdByUserId;
  if (!isOwnerPreviewing) {
    await prisma.shareLink.update({
      where: { id: link.id },
      data: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
    });
  }

  return {
    status: "ok",
    kind: link.kind,
    sharerName: link.createdBy.fullName,
    createdAt: link.createdAt,
    profile,
    // RISHTA_CARD is hardcoded at both creation and here — defence in depth,
    // not trusting a single check for "never forward a candidate's number".
    mobile: link.kind === "OWN_BIODATA" ? link.createdBy.mobile : null,
    includeMobile: link.kind === "OWN_BIODATA" && link.includeMobile,
    includeIncome: link.kind === "OWN_BIODATA" && link.includeIncome,
    sochBoard: link.kind === "SOCH_BOARD" ? await getSochBoard(link.createdByUserId, viewerUserId) : null,
  };
}
