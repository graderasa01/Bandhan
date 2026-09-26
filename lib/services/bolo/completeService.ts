import "server-only";
import type { RespondentType, User } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { hashPassword } from "@/lib/auth/password";
import { PASSWORD_MIN_LENGTH, isAcceptablePassword } from "@/lib/auth/passwordPolicy";
import { USER_HOME } from "@/lib/auth/landingPath";
import { postLoginPath } from "@/lib/auth/postLoginPath";
import { createSession, refreshSession } from "@/lib/auth/session";
import type { FillingFor } from "@/lib/contracts/interview";
import {
  BOLO_FIELD_KEYS,
  acceptAnswers,
  isFillingFor,
  normalizeAnswer,
  type BoloMember,
  type BoloValues,
  type RejectedAnswer,
} from "@/lib/bolo/draft";
import { FIELD_BY_KEY } from "@/lib/profile/fields";
import { isValidFieldValue } from "@/lib/profile/readiness";
import { createMemberAccount, type CookieReader } from "@/lib/services/auth/accountCreation";
import {
  findUserByContact,
  isOtpConfiguredFor,
  readContactProof,
  sameContact,
  type Contact,
} from "@/lib/services/auth/contactOtpService";
import { getOrCreateProfile, saveDraft } from "@/lib/services/profile/draftService";
import {
  FILLING_FOR_RESPONDENT,
  saveFieldProvenance,
  setRespondentType,
} from "@/lib/services/profile/provenanceService";
import { activateIfReady, getProfileReadiness } from "@/lib/services/profile/readinessService";

/**
 * The last step of `/bolo`, for both kinds of person who reach it.
 *
 * **A guest** (`completeGuestProfile`): a spoken draft becomes an account, a
 * profile, and — when the eight minimum fields are there — a live one, in one
 * request.
 *
 * **A member** (`completeMemberProfile`): someone already signed in whose
 * profile was not live — they registered, signed in with Google or a code, or
 * saved a draft halfway, and every one of those lands on `/bolo` now. The card
 * they confirmed is written onto the profile they already have; when that
 * completes it the profile goes live and the session cookie is re-signed. No
 * contact, no code, no second account.
 *
 * Nothing the browser says is trusted. Values run through the same
 * `acceptAnswers` the page used, then through `activateIfReady`, the one
 * authority on "live" (see lib/profile/readiness.ts).
 *
 * ## Never an account nobody can get back into
 *
 * A contact counts as verified only with a proof from `contactOtpService`.
 * When a channel *is* configured for that contact, an unproven one is refused:
 * the page should never have skipped the code. When no channel can reach it
 * (today: SMS, with no provider set), the account is still created — the same
 * unverified state `/api/auth/register` produces — but only with a password the
 * person typed themselves. A passwordless account on a contact no code can
 * reach is locked out the first time its session ends: password reset goes by
 * email, and OTP login cannot send. So that combination is refused here, not
 * just discouraged on the screen. Nothing ever generates a password for anyone.
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
  | { error: "PASSWORD_REQUIRED"; message: string }
  | { error: "ALREADY_EXISTS"; message: string };

export type CompleteResult =
  | {
      ok: true;
      live: boolean;
      landing: string;
      existingAccount: boolean;
      verified: boolean;
      missing: string[];
      /** Whether the account can log in with a password — the done screen offers to create one when it cannot. */
      hasPassword: boolean;
      /**
       * The session this call opened, when it opened one. Never sent to a
       * browser (which got it as a cookie) — the route passes it on only to the
       * native app, through `sessionTokenForNative`.
       */
      sessionToken?: string;
    }
  | ({ ok: false; status: number } & CompleteError);

export interface CompleteInput {
  fillingFor: unknown;
  values: unknown;
  accountName?: unknown;
  contact: Contact;
  proof?: unknown;
  /** The person's own password — required, and only read, when no code could verify the contact. */
  password?: unknown;
  jar: CookieReader;
  ipAddress?: string;
  userAgent?: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function validationFailure(rejected: RejectedAnswer[]): CompleteResult | null {
  const invalid = rejected.filter((r) => r.reason === "invalid");
  if (invalid.length === 0) return null;
  return {
    ok: false,
    status: 422,
    error: "VALIDATION_FAILED",
    message: "Kuch values sahi nahi hain — review card me theek kar lijiye.",
    rejected: invalid.map((r) => ({ field: r.field, heard: r.heard })),
  };
}

/* ------------------------------------------------------------------ */
/* A guest                                                             */
/* ------------------------------------------------------------------ */

export async function completeGuestProfile(input: CompleteInput): Promise<CompleteResult> {
  const fillingFor: FillingFor = isFillingFor(input.fillingFor) ? input.fillingFor : "self";
  const accepted = acceptAnswers({}, asRecord(input.values));
  const failure = validationFailure(accepted.rejected);
  if (failure) return failure;
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

  // No proof, and (checked above) no channel that could have sent one — see
  // "Never an account nobody can get back into" at the top of this file.
  let passwordHash: string | null = null;
  if (!verified) {
    if (!isAcceptablePassword(input.password)) {
      return {
        ok: false,
        status: 422,
        error: "PASSWORD_REQUIRED",
        message: `${input.contact.kind === "email" ? "Is email" : "Is number"} par OTP nahi ja sakta — account ke liye apna password banaiye (kam se kam ${PASSWORD_MIN_LENGTH} characters).`,
      };
    }
    passwordHash = await hashPassword(input.password);
  }

  const now = new Date();
  const user = await createMemberAccount({
    fullName: accountName,
    mobile: input.contact.kind === "mobile" ? input.contact.value : null,
    email: input.contact.kind === "email" ? input.contact.value : null,
    passwordHash,
    mobileVerifiedAt: verified && input.contact.kind === "mobile" ? now : null,
    emailVerifiedAt: verified && input.contact.kind === "email" ? now : null,
    jar: input.jar,
  });
  console.info(
    `[bolo:complete] user=${user.id} verified=${verified} password=${passwordHash !== null} fields=${Object.keys(values).length}`,
  );

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
    select: { id: true, role: true, status: true, passwordHash: true },
  });
  const session = await createSession({
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
    hasPassword: Boolean(user.passwordHash),
    sessionToken: session.token,
  };
}

/* ------------------------------------------------------------------ */
/* A signed-in member                                                  */
/* ------------------------------------------------------------------ */

/**
 * What `/bolo` needs to pick up a signed-in member's unfinished profile: the
 * eight minimum fields and the two preferences as the draft spells them, only
 * where the stored value is valid — an invalid one reads as missing, so Grio
 * asks for it again instead of a review card showing something the rule
 * refuses — plus who the profile is for and whether the account has a password.
 */
export async function loadBoloMember(user: Pick<User, "id" | "fullName" | "passwordHash">): Promise<BoloMember> {
  const profile = await getOrCreateProfile(user.id);
  const view = await getProfileReadiness(profile);

  const values: BoloValues = {};
  for (const key of BOLO_FIELD_KEYS) {
    const def = FIELD_BY_KEY[key];
    const stored = view.values[key];
    if (!def || !stored) continue;
    const normalized = normalizeAnswer(key, String(stored));
    if (isValidFieldValue(def, normalized)) values[key] = normalized;
  }
  const hasAnswers = Object.keys(values).length > 0;

  return {
    userId: user.id,
    firstName: user.fullName.trim().split(/\s+/)[0] ?? "",
    fullName: user.fullName,
    values,
    // A profile with no answers has a respondent type only because the column
    // has a default — nobody was ever asked, so Grio asks.
    fillingFor: hasAnswers ? fillingForProfile(profile.respondentType, values.gender) : null,
    needsReview: view.reviewQueue.filter((key) => Boolean(values[key])),
    hasPassword: Boolean(user.passwordHash),
  };
}

/**
 * `FILLING_FOR_RESPONDENT` is lossy on purpose (son and daughter both store as
 * PARENT). For the member's card the child's gender, when it is on file,
 * settles which — a daughter's profile should not be headed "Bete ki profile".
 */
function fillingForProfile(respondentType: RespondentType, gender: string | undefined): FillingFor {
  const base = FILLING_FOR_RESPONDENT[respondentType] ?? "self";
  if (base === "self") return "self";
  return gender === "Ladki" ? "daughter" : "son";
}

/** Whether a "for whom" answer disagrees with what the profile records — SELF and PARTNER are the person themselves; the rest are family. */
function changesRespondent(fillingFor: FillingFor, current: RespondentType): boolean {
  const isSelf = current === "SELF" || current === "PARTNER";
  return fillingFor === "self" ? !isSelf : isSelf;
}

export interface CompleteMemberInput {
  user: Pick<User, "id" | "role" | "passwordHash" | "mobileVerifiedAt" | "emailVerifiedAt">;
  fillingFor: unknown;
  values: unknown;
  /** For the re-signed session's audit fields. */
  req?: { headers: Headers };
}

/**
 * A signed-in member confirmed their card: write it onto the profile they
 * already have, and go live when that completes it.
 *
 * Only the fields the card showed are read — anything else in the body was
 * never in front of them. And only what the confirmation *changed* is written:
 * a new or corrected value, or one a model read that a person has now vouched
 * for. An answer that was already theirs, unchanged, keeps the provenance it
 * had — a partner-entered or family-entered fact is not re-labelled as typed by
 * the member just because they looked at it again.
 *
 * Unlike a returning guest (whose earlier answers always win), a member is
 * editing their own profile with every stored value on screen, so a corrected
 * value replaces the old one — exactly what the typed deck does.
 */
export async function completeMemberProfile(input: CompleteMemberInput): Promise<CompleteResult> {
  const onCard = Object.fromEntries(
    Object.entries(asRecord(input.values)).filter(([key]) => BOLO_FIELD_KEYS.includes(key)),
  );
  const accepted = acceptAnswers({}, onCard);
  const failure = validationFailure(accepted.rejected);
  if (failure) return failure;

  const userId = input.user.id;
  const profile = await getOrCreateProfile(userId);
  const current = await getProfileReadiness(profile);
  const unconfirmed = new Set(current.reviewQueue);

  const toSave: BoloValues = {};
  for (const [key, value] of Object.entries(accepted.values)) {
    const stored = current.values[key];
    const before = stored ? normalizeAnswer(key, String(stored)) : "";
    if (before !== value || unconfirmed.has(key)) toSave[key] = value;
  }
  const keys = Object.keys(toSave);

  const saved = keys.length > 0 ? await saveDraft(userId, toSave) : profile;
  const fillingFor = isFillingFor(input.fillingFor) ? input.fillingFor : null;
  const respondentType =
    fillingFor && changesRespondent(fillingFor, saved.respondentType)
      ? await setRespondentType(saved.id, fillingFor)
      : saved.respondentType;
  if (keys.length > 0) {
    // Heard by Grio or typed on the card, shown back, confirmed with "sahi
    // hai" — a person vouching for each value, the same as `finishForUser`.
    await saveFieldProvenance(
      saved.id,
      Object.fromEntries(keys.map((key) => [key, { source: "user", confirmed: true }])),
      respondentType,
    );
  }

  const { view, justActivated } = await activateIfReady(userId, saved);
  if (justActivated) {
    // Middleware reads status from the JWT, not the row: without this the
    // member's very next tap on the reel would bounce straight back here.
    await refreshSession({ id: userId, role: input.user.role, status: "ACTIVE" }, input.req);
  }
  const live = view.activatedOnServer;
  console.info(`[bolo:complete-member] user=${userId} saved=${keys.length} live=${live}`);

  return {
    ok: true,
    live,
    landing: live ? BOLO_LIVE_LANDING : USER_HOME,
    existingAccount: true,
    verified: Boolean(input.user.mobileVerifiedAt || input.user.emailVerifiedAt),
    missing: view.readiness.blockers.map((b) => b.key),
    hasPassword: Boolean(input.user.passwordHash),
  };
}
