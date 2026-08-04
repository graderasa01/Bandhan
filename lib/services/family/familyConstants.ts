/**
 * Pure, no `server-only` — split out of `familyService.ts` specifically so
 * client components (`FamilyProfileCard`, `FamilyHeader`, `FamilyCircleManager`)
 * can import the relation labels and permission table without dragging in
 * Prisma and the rest of the server-only service through the same module.
 */
import type { FamilyRelation } from "@prisma/client";

export const FAMILY_RELATION_LABELS: Record<FamilyRelation, string> = {
  PARENT: "Parent (Papa/Mummy)",
  SIBLING: "Sibling (Bhai/Behen)",
  GUARDIAN: "Guardian",
};

export interface FamilyPermissions {
  /** Can open a matched profile's L3 detail, not just the summary card. */
  canViewProfileDetail: boolean;
  canManageShortlist: boolean;
  canWriteNotes: boolean;
  /**
   * Phase E — record the Parent Voice Blessing clip on the owner's profile.
   * PARENT-only, deliberately: the invite/bind flow (`familyService.ts`'s
   * header) is the *entire* verification this feature relies on — a sibling
   * or guardian recording "on behalf of" a parent would be exactly the
   * unverified claim §7 of the engagement doc says makes this decoration
   * instead of a trust signal.
   */
  canRecordBlessing: boolean;
}

/**
 * `08_architecture_and_experience_plan.md` §4's table, as code. A guardian is
 * "sirf dekho" — no shortlist, no notes, no profile drill-in; a sibling can
 * shortlist but the plan never gave them a note field; only a parent gets
 * everything short of chat.
 */
export function permissionsFor(relation: FamilyRelation): FamilyPermissions {
  switch (relation) {
    case "PARENT":
      return { canViewProfileDetail: true, canManageShortlist: true, canWriteNotes: true, canRecordBlessing: true };
    case "SIBLING":
      return { canViewProfileDetail: true, canManageShortlist: true, canWriteNotes: false, canRecordBlessing: false };
    case "GUARDIAN":
      return { canViewProfileDetail: false, canManageShortlist: false, canWriteNotes: false, canRecordBlessing: false };
  }
}
