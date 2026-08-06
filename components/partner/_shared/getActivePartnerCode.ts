import { prisma } from "@/lib/db/prisma";

/**
 * A partner's active referral code, or null if none is active yet.
 *
 * Five `app/partner/*` pages need this just to feed `PartnerShell`'s
 * `partnerCode` prop — pulled out here so the identical
 * `referralCode.findFirst` lookup isn't repeated in each page file.
 * (Dashboard and Referral Tools don't use this — they already get the code
 * back from their own richer data loaders in lib/data/partnerData.ts.)
 */
export async function getActivePartnerCode(partnerId: string): Promise<string | null> {
  const code = await prisma.referralCode.findFirst({
    where: { partnerId, active: true },
    select: { code: true },
  });
  return code?.code ?? null;
}
