import "server-only";
import type { Prisma, SpotlightCampaign } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { SpotlightCampaignConfig } from "@/lib/constants/serviceItems";
import type { CampaignSpec } from "./audience";

/**
 * The life of one campaign: saved, paid for, run, and stopped.
 *
 * ## DRAFT exists so the spec outlives the form
 *
 * The row is written *before* the payment, carrying exactly what the buyer
 * asked for. It grants nothing and is shown to nobody. The alternative —
 * stuffing cities and an age band into gateway `notes` and rebuilding the
 * campaign on the way back — means the record of what was bought is
 * reconstructed from a redirect, and any mismatch surfaces as a delivery the
 * buyer did not order.
 *
 * ## What the row freezes, and why
 *
 * `promisedReach` and `maxDays` are copied off the item at purchase rather
 * than read live. An admin re-pricing City Spotlight tomorrow must not change
 * what an already-paid campaign owes — the obligation was fixed the moment the
 * money moved.
 */

export interface DraftCampaignInput {
  userId: string;
  itemCode: string;
  config: SpotlightCampaignConfig;
  spec: CampaignSpec;
  paymentId: string;
}

export async function createDraftCampaign(
  tx: Prisma.TransactionClient,
  input: DraftCampaignInput,
): Promise<SpotlightCampaign> {
  return tx.spotlightCampaign.create({
    data: {
      ownerUserId: input.userId,
      itemCode: input.itemCode,
      paymentId: input.paymentId,
      status: "DRAFT",
      cities: input.spec.cities,
      minAge: input.spec.minAge,
      maxAge: input.spec.maxAge,
      targetGender: input.spec.targetGender,
      promisedReach: input.config.reach,
      maxDays: input.config.maxDays,
    },
  });
}

/**
 * DRAFT → RUNNING. Called from inside the capture transaction, never before.
 *
 * The `status: "DRAFT"` in the `where` is the idempotency guard: a second
 * capture for the same payment updates nothing rather than restarting a
 * campaign that is already half delivered.
 */
export async function activateCampaign(
  tx: Prisma.TransactionClient,
  campaignId: string,
  now: Date,
): Promise<SpotlightCampaign | null> {
  const row = await tx.spotlightCampaign.findUnique({ where: { id: campaignId } });
  // Not DRAFT means this capture already ran. Returning null rather than
  // re-activating is what stops a redelivered webhook from restarting a
  // campaign that is already half delivered.
  if (!row || row.status !== "DRAFT") return null;

  // The window is computed from the row's own frozen `maxDays`, never from
  // the pack's current config — an admin editing the pack between checkout
  // and capture must not change what was already paid for.
  return tx.spotlightCampaign.update({
    where: { id: campaignId },
    data: {
      status: "RUNNING",
      startsAt: now,
      endsAt: new Date(now.getTime() + row.maxDays * 86_400_000),
    },
  });
}

/** A payment that failed or was abandoned leaves no half-real campaign behind. */
export async function cancelDraftForPayment(paymentId: string): Promise<void> {
  await prisma.spotlightCampaign.updateMany({
    where: { paymentId, status: "DRAFT" },
    data: { status: "CANCELLED" },
  });
}

export interface CampaignView {
  id: string;
  itemCode: string;
  status: SpotlightCampaign["status"];
  cities: string[];
  minAge: number;
  maxAge: number;
  targetGender: string;
  promisedReach: number;
  deliveredReach: number;
  startsAt: Date | null;
  endsAt: Date | null;
  pausedReason: string | null;
  createdAt: Date;
}

/**
 * The owner's own campaigns. DRAFTs are included when they are recent enough
 * to still be a payment in flight — hiding them would make an interrupted
 * checkout look like nothing ever happened.
 */
export async function getMyCampaigns(userId: string): Promise<CampaignView[]> {
  const rows = await prisma.spotlightCampaign.findMany({
    where: {
      ownerUserId: userId,
      OR: [
        { status: { in: ["RUNNING", "PAUSED", "COMPLETED"] } },
        { status: "DRAFT", createdAt: { gte: new Date(Date.now() - 3600_000) } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return rows.map((r) => ({
    id: r.id,
    itemCode: r.itemCode,
    status: r.status,
    cities: r.cities,
    minAge: r.minAge,
    maxAge: r.maxAge,
    targetGender: r.targetGender,
    promisedReach: r.promisedReach,
    deliveredReach: r.deliveredReach,
    startsAt: r.startsAt,
    endsAt: r.endsAt,
    pausedReason: r.pausedReason,
    createdAt: r.createdAt,
  }));
}

/** True when this member already has a campaign in flight. */
export async function hasLiveCampaign(userId: string): Promise<boolean> {
  const count = await prisma.spotlightCampaign.count({
    where: { ownerUserId: userId, status: { in: ["RUNNING", "PAUSED"] } },
  });
  return count > 0;
}

/**
 * Stops a running campaign because its owner stopped clearing the bar.
 *
 * `endsAt` is *not* moved here. It is pushed out when the campaign resumes, by
 * however long the pause actually lasted — pushing it now would guess at a
 * pause length nobody knows yet, and a campaign that is never fixed would keep
 * extending its own window forever.
 */
export async function pauseCampaign(campaignId: string, reason: string, now = new Date()): Promise<void> {
  await prisma.spotlightCampaign.updateMany({
    where: { id: campaignId, status: "RUNNING" },
    data: { status: "PAUSED", pausedAt: now, pausedReason: reason },
  });
}

/** Resumes a paused campaign, giving back exactly the days it was frozen for. */
export async function resumeCampaign(campaignId: string, now = new Date()): Promise<void> {
  const row = await prisma.spotlightCampaign.findUnique({ where: { id: campaignId } });
  if (!row || row.status !== "PAUSED" || !row.pausedAt || !row.endsAt) return;

  const frozenMs = now.getTime() - row.pausedAt.getTime();
  await prisma.spotlightCampaign.update({
    where: { id: campaignId },
    data: {
      status: "RUNNING",
      pausedAt: null,
      pausedReason: null,
      endsAt: new Date(row.endsAt.getTime() + frozenMs),
    },
  });
}

/**
 * What the buy form should start with.
 *
 * Read off the buyer's own partner preferences rather than left blank. A form
 * that opens empty invites someone to widen their targeting past what they
 * actually want just to make the estimate look better — and the two-way filter
 * would then quietly drop most of that audience again, leaving them with a
 * quote they do not understand.
 */
export interface CampaignDefaults {
  targetGender: string | null;
  minAge: number | null;
  maxAge: number | null;
  city: string | null;
}

export async function loadCampaignDefaults(userId: string): Promise<CampaignDefaults> {
  const profile = await prisma.profile.findUnique({
    where: { userId },
    select: {
      currentCity: true,
      partnerPreferences: { select: { lookingForGender: true, minAge: true, maxAge: true } },
    },
  });

  return {
    targetGender: profile?.partnerPreferences?.lookingForGender ?? null,
    minAge: profile?.partnerPreferences?.minAge ?? null,
    maxAge: profile?.partnerPreferences?.maxAge ?? null,
    city: profile?.currentCity ?? null,
  };
}
