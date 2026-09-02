import "server-only";
import { prisma } from "@/lib/db/prisma";
import {
  BADGE_STATE_LINE,
  BADGE_STATE_TONE,
  VERIFICATION_CATALOG,
  badgeStateFor,
  catalogFor,
  type BadgeState,
} from "./verificationCatalog";
import type { VerificationKind } from "@prisma/client";

/**
 * What one person's verification actually says, to whoever is looking.
 *
 * ## One list, three sources
 *
 * Contact and photo verification already existed and already had a home:
 * `User.mobileVerifiedAt`, `User.emailVerifiedAt`, `ProfilePhoto.verifiedAt`.
 * Phase 5 does not copy any of it into `VerificationCheck` — a second answer to
 * a question that already has one is a second answer that can be wrong. This
 * service reads all three sources and presents them through one catalog, so a
 * member sees a single list in a single vocabulary and never has to learn that
 * two of the badges were built in a different year.
 *
 * ## What a viewer may read
 *
 * Everyone who can see the profile sees the *state* — checked and matched,
 * mismatch, expired, not checked — with the scope sentence and the date.
 * That is the whole point of a badge, and hiding it would make it useless.
 *
 * `resultNote` is narrower: the subject reads their own, and so does the person
 * who asked for that specific check. A member browsing a profile does not,
 * because a note written for the two people in a conversation is not a public
 * fact about somebody.
 *
 * `evidenceNote` appears nowhere in this file. It is not filtered out — it is
 * never selected. See `humanVerificationQueue`, the only reader.
 */

export interface VerificationBadge {
  kind: VerificationKind;
  label: string;
  scope: string;
  notMeaning: string;
  state: BadgeState;
  stateLine: string;
  tone: "good" | "warn" | "neutral";
  /** When the check was done. Null when it has not been. */
  checkedAt: string | null;
  expiresAt: string | null;
  /** Only ever set for a viewer entitled to it — see the note above. */
  resultNote: string | null;
  /** True when this viewer could ask the subject for this check. */
  requestable: boolean;
  feePaise: number;
}

export interface BadgeViewer {
  /** Null for a signed-out or anonymous read: state only, never a note. */
  viewerUserId: string | null;
}

/**
 * The subject's badges as this viewer may read them.
 *
 * `scopeText` frozen on a completed check wins over the catalog's current
 * wording — a badge has to keep meaning what it meant when it was granted.
 */
export async function listVerificationBadges(
  subjectUserId: string,
  viewer: BadgeViewer,
  now: Date = new Date(),
): Promise<VerificationBadge[]> {
  const [user, photo, checks, requestedByViewer] = await Promise.all([
    prisma.user.findUnique({
      where: { id: subjectUserId },
      select: { mobileVerifiedAt: true, emailVerifiedAt: true },
    }),
    prisma.profilePhoto.findFirst({
      where: { profile: { userId: subjectUserId }, isPrimary: true, deletedAt: null },
      select: { verificationStatus: true, verifiedAt: true },
    }),
    prisma.verificationCheck.findMany({
      where: { subjectUserId },
      orderBy: { createdAt: "desc" },
      // Deliberately field-by-field rather than the whole row: `evidenceNote`
      // must not be one `select: undefined` away from a member's screen.
      select: {
        id: true,
        kind: true,
        outcome: true,
        scopeText: true,
        resultNote: true,
        checkedAt: true,
        expiresAt: true,
      },
    }),
    viewer.viewerUserId && viewer.viewerUserId !== subjectUserId
      ? prisma.verificationRequest.findMany({
          where: { requesterUserId: viewer.viewerUserId, subjectUserId },
          select: { kind: true },
        })
      : Promise.resolve([]),
  ]);

  // Newest completed check per kind; an older one never overrides a newer.
  const latest = new Map<VerificationKind, (typeof checks)[number]>();
  for (const c of checks) if (!latest.has(c.kind)) latest.set(c.kind, c);

  const isSelf = viewer.viewerUserId === subjectUserId;
  const askedKinds = new Set(requestedByViewer.map((r) => r.kind));

  return VERIFICATION_CATALOG.map((entry) => {
    const catalog = catalogFor(entry.kind);

    // The three self-serve kinds read their real columns rather than a row.
    if (entry.kind === "CONTACT_PHONE" || entry.kind === "CONTACT_EMAIL" || entry.kind === "PHOTO") {
      const at =
        entry.kind === "CONTACT_PHONE"
          ? (user?.mobileVerifiedAt ?? null)
          : entry.kind === "CONTACT_EMAIL"
            ? (user?.emailVerifiedAt ?? null)
            : photo?.verificationStatus === "APPROVED"
              ? (photo.verifiedAt ?? null)
              : null;

      // A photo approved before `verifiedAt` was recorded is still approved —
      // it just cannot say when, and a badge that cannot say when says so.
      const done = entry.kind === "PHOTO" ? photo?.verificationStatus === "APPROVED" : Boolean(at);

      return {
        kind: entry.kind,
        label: catalog.label,
        scope: catalog.scope,
        notMeaning: catalog.notMeaning,
        state: (done ? "MATCHED" : "NOT_CHECKED") as BadgeState,
        stateLine: BADGE_STATE_LINE[done ? "MATCHED" : "NOT_CHECKED"],
        tone: BADGE_STATE_TONE[done ? "MATCHED" : "NOT_CHECKED"],
        checkedAt: at?.toISOString() ?? null,
        expiresAt: null,
        resultNote: null,
        requestable: false,
        feePaise: 0,
      };
    }

    const check = latest.get(entry.kind) ?? null;
    const state = badgeStateFor(check, now);
    const mayReadNote = isSelf || askedKinds.has(entry.kind);

    return {
      kind: entry.kind,
      label: catalog.label,
      // The frozen sentence when there is one; the catalog's current wording
      // only for a check that has not completed and so has nothing frozen yet.
      scope: check?.scopeText || catalog.scope,
      notMeaning: catalog.notMeaning,
      state,
      stateLine: BADGE_STATE_LINE[state],
      tone: BADGE_STATE_TONE[state],
      checkedAt: check?.checkedAt?.toISOString() ?? null,
      expiresAt: check?.expiresAt?.toISOString() ?? null,
      resultNote: mayReadNote ? (check?.resultNote ?? null) : null,
      requestable: catalog.requestable,
      feePaise: catalog.feePaise,
    };
  });
}

/**
 * The short form for a card: only what is actually checked and current.
 *
 * Returns nothing for a profile with no live badges rather than a row of grey
 * placeholders — "not checked" is worth saying on the verification screen and
 * is noise on a profile card.
 */
export async function listLiveBadges(subjectUserId: string, now: Date = new Date()): Promise<VerificationBadge[]> {
  const all = await listVerificationBadges(subjectUserId, { viewerUserId: null }, now);
  return all.filter((b) => b.state === "MATCHED");
}

/** Latest check per kind for one subject — the queue and the room both need it. */
export async function latestCheckFor(subjectUserId: string, kind: VerificationKind) {
  return prisma.verificationCheck.findFirst({
    where: { subjectUserId, kind },
    orderBy: { createdAt: "desc" },
    select: { id: true, outcome: true, checkedAt: true, expiresAt: true, resultNote: true },
  });
}
