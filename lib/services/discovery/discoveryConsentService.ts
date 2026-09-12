import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { SensitiveConsentKey } from "@/lib/discovery/contract";

/**
 * The owner's side of Advanced Discovery's sensitive filters — "kya mujhe
 * religion / caste / gotra / manglik / income se dhoondha ja sakta hai?"
 *
 * One row per profile (`ProfileDiscoveryConsent`), created on the first toggle
 * and never before, so absence reads as "nothing agreed" for every profile
 * that predates the switches. Reads and writes are owner-only by construction:
 * the userId comes from the caller's own session, never from a request body.
 *
 * The view also carries the owner's *current stored value* for each field, so
 * the toggle can say exactly what would become findable ("Religion: Hindu")
 * — and say "abhi bhara nahi hai" when there is nothing to find, which is the
 * one case where turning the switch on changes nothing at all.
 */

export type DiscoveryConsentDto = Record<SensitiveConsentKey, boolean>;

export interface DiscoveryConsentView {
  consent: DiscoveryConsentDto;
  /** The owner's stored value per field, or null when it was never filled / is an opt-out answer. */
  values: Record<SensitiveConsentKey, string | null>;
}

const NONE: DiscoveryConsentDto = { religion: false, caste: false, gotra: false, manglik: false, income: false };

/** Opt-out answers the catalog offers — stored, but never a searchable value. */
const OPT_OUT = new Set(["Batana nahi chahte", "Pata nahi", "Hum nahi maante"]);

function searchableValue(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t && !OPT_OUT.has(t) ? t : null;
}

export async function getDiscoveryConsent(userId: string): Promise<DiscoveryConsentView | null> {
  const profile = await prisma.profile.findUnique({
    where: { userId },
    select: {
      discoveryConsent: true,
      basicDetails: { select: { religion: true, caste: true, community: true, gotra: true, manglikStatus: true } },
      profession: { select: { annualIncomeRange: true } },
    },
  });
  if (!profile) return null;
  const row = profile.discoveryConsent;
  return {
    consent: row
      ? {
          religion: row.religionSearchable,
          caste: row.casteSearchable,
          gotra: row.gotraSearchable,
          manglik: row.manglikSearchable,
          income: row.incomeSearchable,
        }
      : NONE,
    values: {
      religion: searchableValue(profile.basicDetails?.religion),
      caste: searchableValue(profile.basicDetails?.caste) ?? searchableValue(profile.basicDetails?.community),
      gotra: searchableValue(profile.basicDetails?.gotra),
      manglik: searchableValue(profile.basicDetails?.manglikStatus),
      income: searchableValue(profile.profession?.annualIncomeRange),
    },
  };
}

export type SetDiscoveryConsentResult = { ok: true; consent: DiscoveryConsentDto } | { ok: false; message: string };

export async function setDiscoveryConsent(userId: string, patch: Partial<DiscoveryConsentDto>): Promise<SetDiscoveryConsentResult> {
  const profile = await prisma.profile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) return { ok: false, message: "Pehle apni profile banaiye." };

  const data = {
    ...(patch.religion !== undefined ? { religionSearchable: patch.religion } : {}),
    ...(patch.caste !== undefined ? { casteSearchable: patch.caste } : {}),
    ...(patch.gotra !== undefined ? { gotraSearchable: patch.gotra } : {}),
    ...(patch.manglik !== undefined ? { manglikSearchable: patch.manglik } : {}),
    ...(patch.income !== undefined ? { incomeSearchable: patch.income } : {}),
  };

  const row = await prisma.profileDiscoveryConsent.upsert({
    where: { profileId: profile.id },
    create: { profileId: profile.id, ...data },
    update: data,
  });
  return {
    ok: true,
    consent: {
      religion: row.religionSearchable,
      caste: row.casteSearchable,
      gotra: row.gotraSearchable,
      manglik: row.manglikSearchable,
      income: row.incomeSearchable,
    },
  };
}
