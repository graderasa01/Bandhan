import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Role, VerificationSettings } from "@prisma/client";

/** Throws if the seed hasn't run — this row must always exist (§ seed.ts). Same contract as getCommissionConfig. */
export async function getVerificationSettings(): Promise<VerificationSettings> {
  const settings = await prisma.verificationSettings.findUnique({ where: { id: "default" } });
  if (!settings) {
    throw new Error("VerificationSettings row 'default' missing — run `npx prisma db seed`.");
  }
  return settings;
}

/** The one thing every photo-creation path actually needs to know. */
export async function isPhotoVerificationRequired(): Promise<boolean> {
  return (await getVerificationSettings()).photoVerificationRequired;
}

export async function setPhotoVerificationRequired(params: {
  required: boolean;
  actorId: string;
  actorRole: Role;
}): Promise<VerificationSettings> {
  const { required, actorId, actorRole } = params;
  const existing = await getVerificationSettings();

  return prisma.$transaction(async (tx) => {
    const updated = await tx.verificationSettings.update({
      where: { id: "default" },
      data: { photoVerificationRequired: required, updatedBy: actorId },
    });

    await tx.adminAuditLog.create({
      data: {
        actorId,
        actorRole,
        actionType: "PHOTO_VERIFICATION_REQUIREMENT_UPDATED",
        targetType: "verification_settings",
        targetId: "default",
        previousValue: String(existing.photoVerificationRequired),
        newValue: String(required),
      },
    });

    return updated;
  });
}
