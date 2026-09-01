import "./_env";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { prisma } from "../lib/db/prisma";
import {
  createManagedDraft,
  listDraftsForCreator,
  resolveDraftAccess,
  saveManagedFields,
} from "../lib/services/managedProfile/managedDraftService";
import {
  claimDraft,
  getClaimPreview,
  issueClaimToken,
  revokeClaimTokens,
} from "../lib/services/managedProfile/claimTokenService";
import {
  bulkAcceptOrdinary,
  decideFields,
  finishReview,
  getReviewView,
} from "../lib/services/managedProfile/ownerReviewService";
import {
  grantDelegation,
  hasDelegatedPermission,
  revokeDelegation,
} from "../lib/services/managedProfile/delegationService";
import {
  getPartnerDraftEligibility,
  getClaimantEligibility,
} from "../lib/services/managedProfile/managedEligibility";
import {
  MANAGED_DRAFT_FIELD_KEYS,
  requiresIndividualConfirmation,
  SENSITIVE_CONFIRM_KEYS,
} from "../lib/services/managedProfile/managedProfilePolicy";
import { saveFieldProvenance, getFieldProvenance } from "../lib/services/profile/provenanceService";
import { saveDraft } from "../lib/services/profile/draftService";
import type { User } from "@prisma/client";

/**
 * Managed Profile foundation — Phase 1.
 *
 * Exercises the real services against the real database, in the order the
 * feature is actually lived: a partner creates a draft, fills it, invites the
 * owner, the owner claims and reviews, grants access, then revokes it.
 *
 * Never touches a payment gateway, an OTP provider or an AI model. Contact
 * verification is stamped directly on the User row, which is exactly what
 * `contactVerificationService.confirmCode` does on success — the check is of
 * the claim gate, not of Twilio.
 *
 * Run: `npx tsx scripts/managed-profile-check.ts`
 */

let failures = 0;
function check(name: string, condition: boolean, detail = "") {
  if (condition) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const stamp = Date.now();
const userIds: string[] = [];

async function makeUser(opts: {
  name: string;
  role?: "USER" | "PARTNER";
  verified?: boolean;
  status?: "ACTIVE" | "INCOMPLETE" | "BLOCKED";
}): Promise<User> {
  const user = await prisma.user.create({
    data: {
      fullName: opts.name,
      email: `mpf-${opts.name.replace(/\W/g, "")}-${stamp}@local.test`,
      passwordHash: "x",
      role: opts.role ?? "USER",
      status: opts.status ?? "ACTIVE",
      emailVerifiedAt: opts.verified === false ? null : new Date(),
    },
  });
  userIds.push(user.id);
  return user;
}

async function makePartner(user: User, status: "ACTIVE" | "SUSPENDED" = "ACTIVE") {
  return prisma.partner.create({
    data: {
      userId: user.id,
      fullName: `${user.fullName} Bureau`,
      mobileNumber: `900000${Math.floor(Math.random() * 9000 + 1000)}`,
      email: user.email,
      mobileVerifiedAt: new Date(),
      emailVerifiedAt: new Date(),
      city: "Jaipur",
      state: "Rajasthan",
      partnerType: "MARRIAGE_BUREAU",
      status,
    },
  });
}

/** The eight Stage-1 answers, so a claimed+confirmed profile can actually go live. */
const FULL_FILL: Record<string, { value: string }> = {
  // Every required catalog field, so a fully-confirmed profile can actually
  // reach `isVisible` through the real submit path rather than a stub.
  fullName: { value: "Priya Sharma" },
  gender: { value: "Ladki" },
  dateOfBirth: { value: "12/04/1997" },
  height: { value: "5'4\"" },
  currentCity: { value: "Jaipur" },
  maritalStatus: { value: "Never Married" },
  education: { value: "Post Graduate" },
  profession: { value: "Software Engineer" },
  motherTongue: { value: "Hindi" },
  diet: { value: "Veg" },
  familyType: { value: "Nuclear family" },
  partnerAgeRange: { value: "25–29" },
  // Two sensitive extras, so the bulk/individual split has something to prove.
  annualIncome: { value: "5–10 lakh" },
  religion: { value: "Hindu" },
};

async function cleanup() {
  // Drafts, tokens, fields, delegations and consent rows all cascade from
  // either the creator or the owner User row.
  await prisma.consentEvent.deleteMany({ where: { OR: [{ actorUserId: { in: userIds } }, { ownerUserId: { in: userIds } }] } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

async function main() {
  console.log("\nManaged Profile foundation — Phase 1\n");

  /* ---------------------------------------------------------------- */
  console.log("Eligibility & isolation");
  /* ---------------------------------------------------------------- */

  const partnerUserA = await makeUser({ name: "PartnerA", role: "PARTNER" });
  const partnerA = await makePartner(partnerUserA);
  const partnerUserB = await makeUser({ name: "PartnerB", role: "PARTNER" });
  await makePartner(partnerUserB);
  const suspendedUser = await makeUser({ name: "PartnerC", role: "PARTNER" });
  await makePartner(suspendedUser, "SUSPENDED");

  const eligibleA = await getPartnerDraftEligibility(partnerUserA.id);
  check("1. eligible partner passes the creator gate", eligibleA.ok);

  const suspendedEligibility = await getPartnerDraftEligibility(suspendedUser.id);
  check(
    "2. suspended partner is refused",
    !suspendedEligibility.ok && suspendedEligibility.block === "PARTNER_STATUS",
  );

  const created = await createManagedDraft({
    creatorUserId: partnerUserA.id,
    creatorLabel: "PartnerA Bureau (partner)",
    kind: "PARTNER",
    partnerId: partnerA.id,
    fillingForGender: "Ladki",
    displayLabel: "Priya S.",
  });
  check("1b. partner creates a private client draft", created.ok);
  if (!created.ok) throw new Error("cannot continue without a draft");
  const draftId = created.draft.id;

  const crossRead = await resolveDraftAccess(partnerUserB.id, draftId);
  check(
    "3. Partner B cannot read Partner A's draft (404, not 403)",
    !crossRead.ok && crossRead.error === "NOT_FOUND",
  );
  const bList = await listDraftsForCreator(partnerUserB.id);
  check("3b. Partner B's own list is empty", bList.length === 0);

  const profileForLabel = await prisma.profile.findFirst({ where: { displayName: "Priya S." } });
  check("4. a managed draft creates no Profile row", profileForLabel === null);

  /* ---------------------------------------------------------------- */
  console.log("\nFilling — and never the partner's own profile");
  /* ---------------------------------------------------------------- */

  // Give the partner a real profile of their own, so "did we overwrite it?" is
  // a question with a checkable answer rather than a vacuous pass.
  const partnerOwnProfile = await saveDraft(partnerUserA.id, { fullName: "PartnerA Real Name", currentCity: "Delhi" });

  const saved = await saveManagedFields(draftId, partnerUserA.id, FULL_FILL);
  check("6b. every catalog key was written", saved.ok && saved.written === Object.keys(FULL_FILL).length);

  const junk = await saveManagedFields(draftId, partnerUserA.id, {
    notAField: { value: "x" },
    "../../etc/passwd": { value: "y" },
    photos: { value: "should-not-store" },
  });
  check(
    "6. unknown / non-managed keys are rejected, not stored",
    junk.ok && junk.written === 0 && junk.ignored.length === 3,
  );
  const junkRow = await prisma.managedProfileDraftField.findFirst({
    where: { draftId, fieldKey: { in: ["notAField", "photos"] } },
  });
  check("6c. no row exists for a rejected key", junkRow === null);
  check(
    "6d. photos are excluded from the managed field catalog",
    !MANAGED_DRAFT_FIELD_KEYS.includes("photos"),
  );

  const partnerProfileAfter = await prisma.profile.findUnique({ where: { userId: partnerUserA.id } });
  check(
    "5. filling a client draft did not touch the partner's own profile",
    partnerProfileAfter?.displayName === partnerOwnProfile.displayName &&
      partnerProfileAfter?.currentCity === "Delhi",
  );

  // Comments are stripped first: the provider's own docstring *names*
  // `/api/profile/save-draft` to explain why it must never call it, and a
  // check that failed on the explanation would push the next person to delete
  // the explanation.
  const managedProviderCode = readFileSync("lib/profile/managedDraftState.tsx", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  check(
    "5b. the managed deck provider has no code path to /api/profile/save-draft",
    !managedProviderCode.includes("save-draft"),
  );

  /* ---------------------------------------------------------------- */
  console.log("\nClaim token");
  /* ---------------------------------------------------------------- */

  const issued = await issueClaimToken(draftId, partnerUserA.id, "PartnerA Bureau (partner)");
  check("7a. a claim link is issued", issued.ok);
  if (!issued.ok) throw new Error("cannot continue without a token");

  const storedTokens = await prisma.managedDraftClaimToken.findMany({ where: { draftId } });
  const rawAnywhere = storedTokens.some((t) => t.tokenHash === issued.rawToken);
  const hashMatches = storedTokens.some(
    (t) => t.tokenHash === createHash("sha256").update(issued.rawToken).digest("hex"),
  );
  check("7. the raw token is never stored — only its sha256", !rawAnywhere && hashMatches);

  const tokenInAudit = await prisma.consentEvent.findFirst({
    where: { draftId, detail: { contains: issued.rawToken.slice(0, 12) } },
  });
  check("7b. no consent-log row contains the token", tokenInAudit === null);

  const preview = await getClaimPreview(issued.rawToken);
  const previewJson = preview.ok ? JSON.stringify(preview.preview) : "";
  const leaked = ["Priya Sharma", "1997", "lakh", "Hindu", "Jaipur", "Software Engineer"].filter((v) =>
    previewJson.includes(v),
  );
  check(
    "12. the pre-auth preview leaks no field values",
    preview.ok && leaked.length === 0,
    leaked.join(", "),
  );
  check(
    "12b. the preview carries only creator kind, label, count and expiry",
    preview.ok &&
      Object.keys(preview.preview).sort().join(",") ===
        "answeredCount,creatorKind,displayLabel,expiresAt,partnerName",
  );

  /* ---------------------------------------------------------------- */
  console.log("\nClaim gate");
  /* ---------------------------------------------------------------- */

  const unverified = await makeUser({ name: "Unverified", verified: false });
  check(
    "9. an unverified account fails the claimant gate",
    !getClaimantEligibility(unverified).ok,
  );
  const unverifiedClaim = await claimDraft(issued.rawToken, unverified);
  check(
    "9b. and its claim is refused with OWNER_CONTACT_UNVERIFIED",
    !unverifiedClaim.ok && unverifiedClaim.error === "OWNER_CONTACT_UNVERIFIED",
  );

  // A PARTNER-role account is refused one step earlier (the claimant gate is
  // members-only), so the CREATOR_CANNOT_CLAIM branch is exercised with a
  // FAMILY draft, whose creator *is* an ordinary verified member and would
  // otherwise sail through every other check.
  const partnerCreatorClaim = await claimDraft(issued.rawToken, partnerUserA);
  check("11a. a partner account cannot claim at all", !partnerCreatorClaim.ok);

  const parent = await makeUser({ name: "Parent" });
  const familyDraft = await createManagedDraft({
    creatorUserId: parent.id,
    creatorLabel: "Parent (family)",
    kind: "FAMILY",
    partnerId: null,
    fillingForGender: "Ladka",
    displayLabel: "Beta ka draft",
  });
  if (!familyDraft.ok) throw new Error("family draft failed");
  const familyToken = await issueClaimToken(familyDraft.draft.id, parent.id, "Parent (family)");
  if (!familyToken.ok) throw new Error("family token failed");
  const selfClaim = await claimDraft(familyToken.rawToken, parent);
  check(
    "11. the creator cannot claim the draft they made",
    !selfClaim.ok && selfClaim.error === "CREATOR_CANNOT_CLAIM",
  );

  // A separate, throwaway draft to prove revoked and expired tokens are dead.
  const throwaway = await createManagedDraft({
    creatorUserId: partnerUserA.id,
    creatorLabel: "PartnerA Bureau (partner)",
    kind: "PARTNER",
    partnerId: partnerA.id,
    fillingForGender: "Ladka",
    displayLabel: "Throwaway",
  });
  if (!throwaway.ok) throw new Error("throwaway draft failed");

  const revokedToken = await issueClaimToken(throwaway.draft.id, partnerUserA.id, "PartnerA");
  if (!revokedToken.ok) throw new Error("revoked-token setup failed");
  await revokeClaimTokens(throwaway.draft.id, partnerUserA.id, "PartnerA");
  const claimant0 = await makeUser({ name: "Claimant0" });
  const revokedClaim = await claimDraft(revokedToken.rawToken, claimant0);
  check("8. a revoked token cannot claim", !revokedClaim.ok && revokedClaim.error === "REVOKED");

  const expiredToken = await issueClaimToken(throwaway.draft.id, partnerUserA.id, "PartnerA");
  if (!expiredToken.ok) throw new Error("expired-token setup failed");
  await prisma.managedDraftClaimToken.updateMany({
    where: { draftId: throwaway.draft.id, usedAt: null, revokedAt: null },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  const expiredClaim = await claimDraft(expiredToken.rawToken, claimant0);
  check("8b. an expired token cannot claim", !expiredClaim.ok && expiredClaim.error === "EXPIRED");

  /* ---------------------------------------------------------------- */
  console.log("\nConcurrent claim");
  /* ---------------------------------------------------------------- */

  const priya = await makeUser({ name: "Priya", status: "INCOMPLETE" });
  const rival = await makeUser({ name: "Rival" });
  const [first, second] = await Promise.all([claimDraft(issued.rawToken, priya), claimDraft(issued.rawToken, rival)]);
  const winners = [first, second].filter((r) => r.ok);
  check("10. exactly one of two simultaneous claims wins", winners.length === 1);

  const boundDraft = await prisma.managedProfileDraft.findUnique({ where: { id: draftId } });
  const owner = boundDraft?.claimedByUserId === priya.id ? priya : rival;
  const loser = owner.id === priya.id ? rival : priya;
  check("10b. the draft has exactly one owner", boundDraft?.claimedByUserId === owner.id);
  check("10c. the token is now marked used", (await prisma.managedDraftClaimToken.findFirst({
    where: { draftId, usedAt: { not: null } },
  })) !== null);

  const loserAccess = await resolveDraftAccess(loser.id, draftId);
  check("10d. the loser has no access to the draft", !loserAccess.ok);

  /* ---------------------------------------------------------------- */
  console.log("\nOwner review");
  /* ---------------------------------------------------------------- */

  const reviewBefore = await getReviewView(owner.id, draftId);
  check("13a. the owner sees every proposal as PROPOSED", reviewBefore.ok && reviewBefore.data.pendingCount > 0);

  const ownerProfileBefore = await prisma.profile.findUnique({ where: { userId: owner.id } });
  check(
    "13. unconfirmed proposals have not reached the owner's profile",
    !ownerProfileBefore || (!ownerProfileBefore.displayName && !ownerProfileBefore.isVisible),
  );

  const creatorReview = await getReviewView(partnerUserA.id, draftId);
  check("13b. the creator cannot read the owner's review queue", !creatorReview.ok);

  // Sensitive fields may not ride along in a batch.
  const mixed = await decideFields(owner.id, owner.fullName, draftId, [
    { fieldKey: "diet", action: "accept" },
    { fieldKey: "annualIncome", action: "accept" },
  ]);
  check(
    "16. a batch mixing a sensitive field is refused whole",
    !mixed.ok && mixed.error === "SENSITIVE_MUST_BE_INDIVIDUAL",
  );
  const incomeStillPending = await prisma.managedProfileDraftField.findUnique({
    where: { draftId_fieldKey: { draftId, fieldKey: "annualIncome" } },
  });
  check("16b. and nothing from that batch was written", incomeStillPending?.reviewState === "PROPOSED");

  const bulk = await bulkAcceptOrdinary(owner.id, owner.fullName, draftId);
  check("8c. bulk accept applies the ordinary fields", bulk.ok && bulk.data.applied > 0);
  const sensitiveAfterBulk = await prisma.managedProfileDraftField.findMany({
    where: { draftId, fieldKey: { in: [...SENSITIVE_CONFIRM_KEYS] } },
  });
  check(
    "16c. bulk accept left every sensitive field PROPOSED",
    sensitiveAfterBulk.length > 0 && sensitiveAfterBulk.every((f) => f.reviewState === "PROPOSED"),
  );

  // Individually confirm the sensitive ones the profile needs to go live.
  for (const key of ["fullName", "gender", "dateOfBirth", "maritalStatus"]) {
    const one = await decideFields(owner.id, owner.fullName, draftId, [{ fieldKey: key, action: "accept" }]);
    if (!one.ok) check(`14x. individual confirm of ${key}`, false, one.message);
  }

  const ownerProfileAfter = await prisma.profile.findUnique({
    where: { userId: owner.id },
    include: { basicDetails: true, profession: true, lifestyle: true },
  });
  check(
    "14. accepted values flow through the existing profile mapping",
    ownerProfileAfter?.displayName === "Priya Sharma" &&
      ownerProfileAfter?.currentCity === "Jaipur" &&
      ownerProfileAfter?.profession?.jobTitle === "Software Engineer",
  );
  check(
    "14b. and through the existing completion service",
    (ownerProfileAfter?.profileCompletionScore ?? 0) > 0,
  );
  check("14c. the profile is now live", ownerProfileAfter?.isVisible === true);

  const provenance = await getFieldProvenance(ownerProfileAfter!.id);
  check(
    "14d. an accepted value keeps the partner as its source, confirmed",
    provenance.get("diet")?.source === "PARTNER_ENTERED" && provenance.get("diet")?.confirmed === true,
  );
  check(
    "14e. and records PARTNER as the respondent",
    provenance.get("diet")?.respondentType === "PARTNER",
  );

  // Correction.
  const corrected = await decideFields(owner.id, owner.fullName, draftId, [
    { fieldKey: "religion", action: "replace", value: "Jain" },
  ]);
  check("17a. the owner can correct a sensitive proposal", corrected.ok);
  const afterCorrection = await prisma.profile.findUnique({
    where: { userId: owner.id },
    include: { basicDetails: true },
  });
  check("17b. the correction is what landed on the profile", afterCorrection?.basicDetails?.religion === "Jain");
  const correctedProv = await getFieldProvenance(ownerProfileAfter!.id);
  check(
    "17. a corrected value becomes USER_ENTERED / SELF",
    correctedProv.get("religion")?.source === "USER_ENTERED" &&
      correctedProv.get("religion")?.respondentType === "SELF",
  );
  const originalProposal = await prisma.managedProfileDraftField.findUnique({
    where: { draftId_fieldKey: { draftId, fieldKey: "religion" } },
  });
  check(
    "17c. the superseded proposal survives as history",
    originalProposal?.value === "Hindu" && originalProposal?.ownerValue === "Jain",
  );

  // Rejection.
  const rejected = await decideFields(owner.id, owner.fullName, draftId, [
    { fieldKey: "annualIncome", action: "reject" },
  ]);
  check("13c. a rejected proposal is accepted as a decision", rejected.ok);
  const incomeOnProfile = await prisma.profileProfession.findUnique({ where: { profileId: ownerProfileAfter!.id } });
  check("13d. a rejected value never reached the profile", !incomeOnProfile?.annualIncomeRange);
  const incomeInConsent = await prisma.consentEvent.findFirst({
    where: { draftId, fieldKey: "annualIncome" },
  });
  check(
    "13e. the consent log records the field key but not its value",
    incomeInConsent !== null && !JSON.stringify(incomeInConsent).includes("lakh"),
  );

  /* ---------------------------------------------------------------- */
  console.log("\nProvenance cannot be spoofed");
  /* ---------------------------------------------------------------- */

  const spoofUser = await makeUser({ name: "Spoofer" });
  const spoofProfile = await saveDraft(spoofUser.id, { currentCity: "Pune" });
  await saveFieldProvenance(
    spoofProfile.id,
    { currentCity: { source: "PARTNER_ENTERED", confirmed: true } },
    "SELF",
  );
  const spoofProv = await getFieldProvenance(spoofProfile.id);
  check(
    "15. save-draft cannot claim PARTNER_ENTERED provenance",
    spoofProv.get("currentCity")?.source === "USER_ENTERED",
  );
  await saveFieldProvenance(
    spoofProfile.id,
    { currentCity: { source: "FAMILY_ENTERED", confirmed: true } },
    "SELF",
  );
  check(
    "15b. nor FAMILY_ENTERED",
    (await getFieldProvenance(spoofProfile.id)).get("currentCity")?.source === "USER_ENTERED",
  );

  /* ---------------------------------------------------------------- */
  console.log("\nDelegation, revoke, and what survives");
  /* ---------------------------------------------------------------- */

  await finishReview(owner.id, owner.fullName, draftId);
  const granted = await grantDelegation({
    ownerUserId: owner.id,
    actorUserId: owner.id,
    draftId,
    partnerId: partnerA.id,
    delegateUserId: partnerUserA.id,
    permissions: ["VIEW_CONFIRMED_PROFILE", "PROPOSE_PROFILE_EDIT", "FULL_ACCESS", "READ_MESSAGES"],
    days: 30,
    helperLabel: "PartnerA Bureau",
  });
  check("18a. a delegation is granted", granted.ok);
  check(
    "18b. permissions outside the Phase 1 set are dropped",
    granted.ok && granted.delegation.permissions.length === 2 &&
      !granted.delegation.permissions.includes("FULL_ACCESS" as never),
  );

  check(
    "18c. the delegate can now read the confirmed profile",
    await hasDelegatedPermission(partnerUserA.id, owner.id, "VIEW_CONFIRMED_PROFILE"),
  );
  const postGrantAccess = await resolveDraftAccess(partnerUserA.id, draftId);
  check(
    "18d. and can propose further edits",
    postGrantAccess.ok && postGrantAccess.access.canWriteValues,
  );

  if (!granted.ok) throw new Error("delegation missing");
  await revokeDelegation(owner.id, granted.delegation.id, owner.id);

  check(
    "18. revocation blocks the delegated read on the very next call",
    !(await hasDelegatedPermission(partnerUserA.id, owner.id, "VIEW_CONFIRMED_PROFILE")),
  );
  const postRevokeAccess = await resolveDraftAccess(partnerUserA.id, draftId);
  check(
    "18e. and the delegated write",
    postRevokeAccess.ok && !postRevokeAccess.access.canWriteValues && !postRevokeAccess.access.canReadValues,
  );
  const postRevokeWrite = await saveManagedFields(draftId, partnerUserA.id, { hobbies: { value: "Reading" } });
  void postRevokeWrite; // the route refuses before reaching the service; asserted via access above

  const survivingProfile = await prisma.profile.findUnique({
    where: { userId: owner.id },
    include: { basicDetails: true },
  });
  check(
    "19. revocation deleted none of the owner's confirmed data",
    survivingProfile?.displayName === "Priya Sharma" &&
      survivingProfile?.basicDetails?.religion === "Jain" &&
      survivingProfile?.isVisible === true,
  );
  const historySurvives = await prisma.consentEvent.count({ where: { ownerUserId: owner.id } });
  check("19b. and the consent history survives", historySurvives > 0);

  /* ---------------------------------------------------------------- */
  console.log("\nExisting flows still work");
  /* ---------------------------------------------------------------- */

  const selfUser = await makeUser({ name: "SelfFiller", status: "INCOMPLETE" });
  const selfProfile = await saveDraft(selfUser.id, {
    fullName: "Rahul Verma",
    gender: "Ladka",
    currentCity: "Indore",
  });
  await saveFieldProvenance(selfProfile.id, { fullName: { source: "user", confirmed: true } }, "SELF");
  const selfProv = await getFieldProvenance(selfProfile.id);
  check(
    "20. the ordinary self-fill path is unchanged",
    selfProfile.displayName === "Rahul Verma" && selfProv.get("fullName")?.source === "USER_ENTERED",
  );

  const policySensitiveCovered = SENSITIVE_CONFIRM_KEYS.every((k) => requiresIndividualConfirmation(k));
  check("16d. every listed sensitive key reports as individually-confirmed", policySensitiveCovered);

  /* ---------------------------------------------------------------- */
  console.log("\nClient bundle boundary");
  /* ---------------------------------------------------------------- */

  // What `next build` would have caught, asserted here instead: this
  // environment has no outbound network, so `next/font/google` fails before
  // webpack reaches a single application module and the build cannot run at
  // all. The one class of error that would otherwise have gone unnoticed is a
  // `"use client"` module value-importing something marked `server-only` —
  // which is a hard build failure, and which is easy to introduce here because
  // the managed UI legitimately imports *types* from server-only services.
  const leaks = clientModulesReachingServerOnly([
    "components/managed/DraftList.tsx",
    "components/managed/ManagedDraftEditor.tsx",
    "components/managed/ManagedReviewClient.tsx",
    "components/managed/ProfileAccessClient.tsx",
    "components/managed/NewDraftForm.tsx",
    "components/managed/ClaimProfileClient.tsx",
    "lib/profile/managedDraftState.tsx",
  ]);
  check(
    "21. no client component value-imports a server-only module",
    leaks.length === 0,
    leaks.join("; "),
  );

  console.log(
    failures === 0 ? "\nAll managed-profile checks passed.\n" : `\n${failures} check(s) FAILED.\n`,
  );
}


/**
 * Follows real (non-type) local imports out of each `"use client"` entry point
 * and reports any that transitively reach a module carrying `import
 * "server-only"`. `import type { … }` is skipped because TypeScript erases it —
 * that is exactly how the managed UI shares result shapes with its services
 * without dragging Prisma into the browser bundle.
 */
function clientModulesReachingServerOnly(entries: string[]): string[] {
  const problems: string[] = [];

  function resolve(spec: string, fromFile: string): string | null {
    let base: string;
    if (spec.startsWith("@/")) base = spec.slice(2);
    else if (spec.startsWith(".")) base = pathJoin(dirname(fromFile), spec);
    else return null; // package import — not ours to police
    for (const ext of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
      const candidate = `${base}${ext}`;
      if (existsSync(candidate)) return candidate;
    }
    return existsSync(base) ? base : null;
  }

  function walk(file: string, trail: string[], seen: Set<string>) {
    if (seen.has(file)) return;
    seen.add(file);
    const src = readFileSync(file, "utf8");
    if (/^\s*import\s+["']server-only["']/m.test(src) && trail.length > 0) {
      problems.push(`${trail[0]} → ${[...trail.slice(1), file].join(" → ")}`);
      return;
    }
    // `import type ...` and `import { type X }` are erased; anything else is a
    // real runtime edge.
    const importRe = /import\s+(type\s+)?([\s\S]*?)from\s+["']([^"']+)["']/g;
    let m: RegExpExecArray | null;
    while ((m = importRe.exec(src))) {
      const [, typeKeyword, clause, spec] = m;
      if (typeKeyword) continue;
      const bindings = clause.trim();
      // `{ type A, type B }` — every binding is a type, so nothing is emitted.
      if (bindings.startsWith("{") && bindings.replace(/[{}]/g, "").split(",").every((b) => !b.trim() || b.trim().startsWith("type "))) {
        continue;
      }
      const resolved = resolve(spec, file);
      if (resolved) walk(resolved, [...trail, file], seen);
    }
  }

  for (const entry of entries) walk(entry, [], new Set());
  return problems;
}

function dirname(p: string): string {
  return p.slice(0, p.lastIndexOf("/"));
}

function pathJoin(dir: string, rel: string): string {
  const parts = `${dir}/${rel}`.split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (part === "." || part === "") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}

main()
  .catch((err) => {
    failures++;
    console.error("\nUNCAUGHT:", err);
  })
  .finally(async () => {
    await cleanup();
    await prisma.$disconnect();
    process.exit(failures === 0 ? 0 : 1);
  });
