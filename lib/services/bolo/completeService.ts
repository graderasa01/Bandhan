import "server-only";
import { prisma } from "@/lib/db/prisma";
import { createSession } from "@/lib/auth/session";
import { postLoginPath } from "@/lib/auth/postLoginPath";
import type { FillingFor } from "@/lib/contracts/interview";
import { acceptAnswers, isFillingFor, type BoloValues } from "@/lib/bolo/draft";
import { createMemberAccount, type CookieReader } from "@/lib/services/auth/accountCreation";
import {
  findUserByContact,
  isOtpConfiguredFor,
  readContactProof,
  sameContact,
  type Contact,
} from "@/lib/services/auth/contactOtpService";
import { getOrCreateProfile, saveDraft } from "@/lib/services/profile/draftService";
import { saveFieldProvenance, setRespondentType } from "@/lib/services/profile/provenanceService";
import { activateIfReady, getProfileReadiness } from "@/lib/services/profile/readinessService";

/**
 * The last step of `/bolo`: a guest draft becomes an account, a profile, and —
 * when the eight minimum fields are there — a live one, in one request.
 *
 * Nothing the browser says is trusted. Values run through the same
 * `acceptAnswers` the page used, then through `activateIfReady`, the one
 * authority on "live" (see lib/profile/readiness.ts). A contact counts as
 * verified only with a proof from `contactOtpService`; without a proof the
 * account is still created when — and only when — no OTP channel is
 * configured for that contact, which is exactly the unverified state
 * `/api/auth/register` produces today. When a channel *is* configured, an
 * unproven contact is refused: the page should never have skipped the code.
 *
 * ## A number that already has an account
 *
 * With a proof, that person just logged in — the draft fills whatever their
 * profile still has empty (never overwrites an answer they gave earlier), and
 * the profile goes live if that completes it. Without a proof there is nothing
 * to do but say so: no session is opened on an unproven contact, ever.
 */

export const BOLO_LIVE_LANDING = "/user/dashboard?profile=live";

export type CompleteError =
  | { error: "VALIDATION_FAILED"; message: string; rejected?: Array<{ field: string; heard: string }> }
  | { error: "CONTACT_REQUIRED"; message: string }
  | { error: "VERIFICATION_REQUIRED"; message: string }
  | { error: "ALREADY_EXISTS"; message: string };

export type CompleteResult =
  | { ok: true; live: boolean; landing: string; existingAccount: boolean; verified: boolean; missing: string[] }
  | ({ ok: false; status: number } & CompleteError);

export interface CompleteInput {
  fillingFor: unknown;
  values: unknown;
  accountName?: unknown;
  contact: Contact;
  proof?: unknown;
  jar: CookieReader;
  ipAddress?: string;
  userAgent?: string;
}

export async function completeGuestProfile(input: CompleteInput): Promise<CompleteResult> {
  const fillingFor: FillingFor = isFillingFor(input.fillingFor) ? input.fillingFor : "self";
  const rawValues =
    input.values && typeof input.values === "object" && !Array.isArray(input.values)
      ? (input.values as Record<string, unknown>)
      : {};
  const accepted = acceptAnswers({}, rawValues);
  if (accepted.rejected.some((r) => r.reason === "invalid")) {
    return {
      ok: false,
      status: 422,
      error: "VALIDATION_FAILED",
      message: "Kuch values sahi nahi hain — review card me theek kar lijiye.",
      rejected: accepted.rejected.filter((r) => r.reason === "invalid").map((r) => ({ field: r.field, heard: r.heard })),
    };
  }
  const values: BoloValues = accepted.values;

  const proofContact = await readContactProof(typeof input.proof === "string" ? input.proof : null);
  const verified = proofContact !== null && sameContact(proofContact, input.contact);
  if (!verified && isOtpConfiguredFor(input.contact)) {
    return {
      ok: false,
      status: 403,
      error: "VERIFICATION_REQUIRED",
      message: "Pehle OTP se number confirm kijiye.",
    };
  }

  const existing = await findUserByContact(input.contact);
  if (existing) {
    if (!verified) {
      return {
        ok: false,
        status: 409,
        error: "ALREADY_EXISTS",
        message: "Is mobile/email se account pehle se hai — login kar lijiye.",
      };
    }
    if (existing.role !== "USER" || existing.status === "BLOCKED" || existing.status === "DELETED" || existing.status === "SUSPENDED") {
      return {
        ok: false,
        status: 409,
        error: "ALREADY_EXISTS",
        message: "Is contact ka account is tarah nahi khul sakta — login page se login kijiye.",
      };
    }
    return finishForUser(existing.id, existing.role, values, fillingFor, input, { existingAccount: true, verified });
  }

  const accountName =
    typeof input.accountName === "string" && input.accountName.trim().length >= 2
      ? input.accountName.trim().slice(0, 80)
      : values.fullName;
  if (!accountName) {
    return { ok: false, status: 422, error: "VALIDATION_FAILED", message: "Naam zaroori hai." };
  }

  const now = new Date();
  const user = await createMemberAccount({
    fullName: accountName,
    mobile: input.contact.kind === "mobile" ? input.contact.value : null,
    email: input.contact.kind === "email" ? input.contact.value : null,
    passwordHash: null,
    mobileVerifiedAt: verified && input.contact.kind === "mobile" ? now : null,
    emailVerifiedAt: verified && input.contact.kind === "email" ? now : null,
    jar: input.jar,
  });
  console.info(`[bolo:complete] user=${user.id} verified=${verified} fields=${Object.keys(values).length}`);

  return finishForUser(user.id, user.role, values, fillingFor, input, { existingAccount: false, verified });
}

async function finishForUser(
  userId: string,
  role: "USER" | "PARTNER" | "ADMIN" | "SUPPORT",
  values: BoloValues,
  fillingFor: FillingFor,
  input: CompleteInput,
  flags: { existingAccount: boolean; verified: boolean },
): Promise<CompleteResult> {
  // A returning member keeps every answer they already gave; the spoken draft
  // only fills what is still empty. A brand-new profile has nothing to keep.
  let toSave: BoloValues = values;
  if (flags.existingAccount) {
    const current = await getProfileReadiness(await getOrCreateProfile(userId));
    toSave = Object.fromEntries(
      Object.entries(values).filter(([key]) => !(current.values[key] ?? "").toString().trim()),
    );
  }

  const saved = await saveDraft(userId, toSave);
  const respondentType = await setRespondentType(saved.id, fillingFor);
  if (Object.keys(toSave).length > 0) {
    // Spoken to Grio, shown on the review card, confirmed with "sahi hai" —
    // that is a person vouching for each value, so it is USER_ENTERED, not an
    // unconfirmed extraction that readiness would (rightly) refuse to count.
    await saveFieldProvenance(
      saved.id,
      Object.fromEntries(Object.keys(toSave).map((key) => [key, { source: "user", confirmed: true }])),
      respondentType,
    );
  }

  const { view } = await activateIfReady(userId, saved);
  const live = view.activatedOnServer;

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, role: true, status: true },
  });
  await createSession({
    userId,
    role,
    status: user.status,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    rememberMe: true,
  });

  const landing = live ? BOLO_LIVE_LANDING : await postLoginPath(user);
  return {
    ok: true,
    live,
    landing,
    existingAccount: flags.existingAccount,
    verified: flags.verified,
    missing: view.readiness.blockers.map((b) => b.key),
  };
}
