import "server-only";
import { prisma } from "@/lib/db/prisma";
import { isSecretBoxConfigured, lastFourOf, open, seal } from "@/lib/security/secretBox";
import { createNotice } from "@/lib/services/notice/noticeService";
import { kycStorage } from "@/lib/services/storage/kycStorage";
import type { PartnerKycDocKind, PartnerKycStatus, Role } from "@prisma/client";

/**
 * Partner KYC: who we are actually paying.
 *
 * ## The hole this fills
 *
 * `payoutService.verifyPayoutAccount` asks an admin to confirm that an account
 * holder name belongs to a partner. Until this module existed there was
 * nothing to confirm it *against* — no document, no legal name, no identifier.
 * The check was a click, and a partner could name any account holder against
 * any account number.
 *
 * So this is not a compliance box bolted onto a finished flow. It is the
 * missing half of that flow's one real safety check, plus the PAN that TDS on
 * commission (s.194H) has to be deducted against.
 *
 * ## The bargain with the partner
 *
 * A partner is asked for exactly one required document — a PAN card photo —
 * and one typed field they can read straight off it. Everything else
 * (`ID_PROOF`, `BANK_PROOF`) is optional, and exists for an admin to *ask* for
 * when something looks off rather than to demand from everyone up front. The
 * cost of a wrong transfer falls on the partner who did not get their money,
 * so the check earns its one screen; anything past that screen is friction
 * charged to the honest majority.
 *
 * ## Where the gate sits
 *
 * Not on saving details, and not on uploading. Two places, both late:
 *
 *   - `getKycGate` feeds `getPartnerBalance`, so an unverified partner reads
 *     the reason on their own payouts screen before requesting anything.
 *   - `verifyPayoutAccount` refuses to approve a payout account while KYC is
 *     unverified — because approving it *is* the name comparison, and that
 *     cannot be made without a legal name to compare against.
 *
 * A partner can therefore fill things in whatever order suits them, and only
 * meets the gate when it has something to say.
 */

/** Generous for a phone photo of a card, small enough to buffer and sniff. */
export const MAX_KYC_BYTES = 8 * 1024 * 1024;

/**
 * Accepted types, checked by magic bytes rather than the browser-supplied
 * `file.type`. The profile-photo route trusts that header because its worst
 * case is a broken `<img>`; here the file is opened by an admin, so a PDF
 * wearing an `image/png` label is worth one buffer read to catch.
 */
const SIGNATURES: { ext: string; mime: string; test: (b: Buffer) => boolean }[] = [
  { ext: "jpg", mime: "image/jpeg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    ext: "png",
    mime: "image/png",
    test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    ext: "webp",
    mime: "image/webp",
    test: (b) =>
      b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP",
  },
  { ext: "pdf", mime: "application/pdf", test: (b) => b.subarray(0, 5).toString("ascii") === "%PDF-" },
];

function sniff(buffer: Buffer): { ext: string; mime: string } | null {
  if (buffer.byteLength < 12) return null;
  return SIGNATURES.find((s) => s.test(buffer)) ?? null;
}

/** ABCDE1234F — five letters, four digits, one letter. */
const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

export type KycWriteResult = { ok: true } | { ok: false; error: string; message: string; status: number };

// ------------------------------------------------------------------- view

export type KycDocumentView = {
  id: string;
  kind: PartnerKycDocKind;
  status: "PENDING" | "VERIFIED" | "REJECTED";
  mimeType: string;
  originalName: string | null;
  uploadedAt: Date;
  rejectionNote: string | null;
};

export type PartnerKycView = {
  status: PartnerKycStatus;
  legalName: string | null;
  /** Only ever the last four — the stored PAN never reaches a browser whole. */
  panMasked: string | null;
  panOnFile: boolean;
  verifiedAt: Date | null;
  rejectionNote: string | null;
  documents: KycDocumentView[];
  /** What the partner still has to do. Empty when nothing is outstanding. */
  missing: ("PAN_NUMBER" | "PAN_CARD")[];
};

export async function getPartnerKycView(partnerId: string): Promise<PartnerKycView> {
  const row = await prisma.partnerKyc.findUnique({
    where: { partnerId },
    include: { documents: { orderBy: { uploadedAt: "desc" } } },
  });

  if (!row) {
    return {
      status: "NOT_STARTED",
      legalName: null,
      panMasked: null,
      panOnFile: false,
      verifiedAt: null,
      rejectionNote: null,
      documents: [],
      missing: ["PAN_NUMBER", "PAN_CARD"],
    };
  }

  const panOnFile = Boolean(row.panCipher && row.legalName);
  const hasCard = row.documents.some((d) => d.kind === "PAN_CARD" && d.status !== "REJECTED");

  const missing: ("PAN_NUMBER" | "PAN_CARD")[] = [];
  if (!panOnFile) missing.push("PAN_NUMBER");
  if (!hasCard) missing.push("PAN_CARD");

  return {
    status: row.status,
    legalName: row.legalName,
    panMasked: row.panLast4 ? `••••••${row.panLast4}` : null,
    panOnFile,
    verifiedAt: row.verifiedAt,
    rejectionNote: row.rejectionNote,
    documents: row.documents.map(toDocumentView),
    missing,
  };
}

function toDocumentView(d: {
  id: string;
  kind: PartnerKycDocKind;
  status: "PENDING" | "VERIFIED" | "REJECTED";
  mimeType: string;
  originalName: string | null;
  uploadedAt: Date;
  rejectionNote: string | null;
}): KycDocumentView {
  return {
    id: d.id,
    kind: d.kind,
    status: d.status,
    mimeType: d.mimeType,
    originalName: d.originalName,
    uploadedAt: d.uploadedAt,
    rejectionNote: d.rejectionNote,
  };
}

// ------------------------------------------------------------------- gate

export type KycGate = {
  ok: boolean;
  /** Null when `ok`, or when the deployment has the requirement switched off. */
  reason: string | null;
  status: PartnerKycStatus;
  /** False when `requireKycForPayout` is off — the UI then presents KYC as optional. */
  required: boolean;
};

export async function getKycGate(partnerId: string): Promise<KycGate> {
  const [config, row] = await Promise.all([
    prisma.partnerCommissionConfig.findUnique({
      where: { id: "default" },
      select: { requireKycForPayout: true },
    }),
    prisma.partnerKyc.findUnique({
      where: { partnerId },
      select: { status: true },
    }),
  ]);

  const required = config?.requireKycForPayout ?? true;
  const status = row?.status ?? "NOT_STARTED";
  if (!required) return { ok: true, reason: null, status, required: false };
  if (status === "VERIFIED") return { ok: true, reason: null, status, required: true };

  const reason =
    status === "REJECTED"
      ? "Aapke KYC documents me kuch theek karna hai."
      : status === "PENDING"
        ? "Aapke KYC documents check ho rahe hain."
        : "Pehle PAN aur PAN card ki photo bhejiye.";

  return { ok: false, reason, status, required: true };
}

// ---------------------------------------------------------------- partner

/**
 * Moves the row to PENDING once both halves are in, and never sooner.
 *
 * Called from both write paths rather than either one alone: a partner who
 * types a PAN and stops has not submitted anything for review, and putting
 * them in the admin queue anyway is how an admin learns to ignore the queue.
 */
async function refreshSubmissionState(partnerId: string): Promise<void> {
  const row = await prisma.partnerKyc.findUnique({
    where: { partnerId },
    include: { documents: { select: { kind: true, status: true } } },
  });
  if (!row || row.status === "VERIFIED") return;

  const complete =
    Boolean(row.panCipher && row.legalName) &&
    row.documents.some((d) => d.kind === "PAN_CARD" && d.status !== "REJECTED");

  if (complete && row.status !== "PENDING") {
    await prisma.partnerKyc.update({
      where: { partnerId },
      data: { status: "PENDING", submittedAt: new Date(), rejectionNote: null },
    });
  }
}

export async function savePanDetails(
  partnerId: string,
  input: { pan: string; legalName: string },
): Promise<KycWriteResult> {
  if (!isSecretBoxConfigured()) {
    return {
      ok: false,
      error: "NOT_CONFIGURED",
      message: "Server par encryption key set nahi hai, isliye PAN abhi save nahi ho sakta.",
      status: 503,
    };
  }

  const pan = input.pan.replace(/\s/g, "").toUpperCase();
  const legalName = input.legalName.trim().replace(/\s+/g, " ");

  if (!PAN_PATTERN.test(pan)) {
    return { ok: false, error: "VALIDATION_FAILED", message: "PAN sahi nahi hai (jaise ABCDE1234F).", status: 422 };
  }
  if (legalName.length < 2) {
    return { ok: false, error: "VALIDATION_FAILED", message: "PAN card par jo naam hai wahi likhiye.", status: 422 };
  }

  // The same rule the payout account follows: a verified marker must never
  // outlive the value it verified. Changing the PAN, or the name it is matched
  // against, sends the whole thing back for review.
  const existing = await prisma.partnerKyc.findUnique({
    where: { partnerId },
    select: { panLast4: true, legalName: true },
  });
  const changed = existing ? existing.panLast4 !== lastFourOf(pan) || existing.legalName !== legalName : true;

  const sealed = seal(pan);
  const data = {
    panCipher: sealed.cipherText,
    panIv: sealed.iv,
    panTag: sealed.authTag,
    panLast4: lastFourOf(pan),
    legalName,
  };

  await prisma.partnerKyc.upsert({
    where: { partnerId },
    create: { partnerId, ...data, status: "NOT_STARTED" },
    update: changed
      ? { ...data, status: "NOT_STARTED", verifiedAt: null, verifiedBy: null, rejectionNote: null }
      : data,
  });

  await refreshSubmissionState(partnerId);
  return { ok: true };
}

export type UploadKycResult =
  | { ok: true; documentId: string; kind: PartnerKycDocKind }
  | { ok: false; error: string; message: string; status: number };

export async function uploadKycDocument(params: {
  partnerId: string;
  kind: PartnerKycDocKind;
  buffer: Buffer;
  originalName: string | null;
}): Promise<UploadKycResult> {
  const { partnerId, kind, buffer, originalName } = params;

  if (buffer.byteLength === 0) {
    return { ok: false, error: "BAD_REQUEST", message: "File khali hai.", status: 400 };
  }
  if (buffer.byteLength > MAX_KYC_BYTES) {
    return { ok: false, error: "VALIDATION_FAILED", message: "File 8MB se badi nahi honi chahiye.", status: 422 };
  }

  const type = sniff(buffer);
  if (!type) {
    return { ok: false, error: "VALIDATION_FAILED", message: "Sirf JPG, PNG, WEBP ya PDF chalega.", status: 422 };
  }

  // The parent row must exist before a document can hang off it — the relation
  // keys on `partnerId`, and a partner may well upload the card before typing
  // the number.
  await prisma.partnerKyc.upsert({
    where: { partnerId },
    create: { partnerId, status: "NOT_STARTED" },
    update: {},
  });

  const previous = await prisma.partnerKycDocument.findUnique({
    where: { partnerId_kind: { partnerId, kind } },
    select: { storageKey: true },
  });

  const stored = await kycStorage.upload({
    partnerId,
    buffer,
    extension: type.ext,
    contentType: type.mime,
  });

  const doc = await prisma.partnerKycDocument.upsert({
    where: { partnerId_kind: { partnerId, kind } },
    create: {
      partnerId,
      kind,
      storageKey: stored.storageKey,
      mimeType: type.mime,
      sizeBytes: stored.sizeBytes,
      originalName,
      status: "PENDING",
    },
    update: {
      storageKey: stored.storageKey,
      mimeType: type.mime,
      sizeBytes: stored.sizeBytes,
      originalName,
      status: "PENDING",
      rejectionNote: null,
      reviewedAt: null,
      reviewedBy: null,
      uploadedAt: new Date(),
    },
  });

  // Only after the row points at the new object. Deleting first would leave a
  // partner with a row referencing bytes that no longer exist, if the write
  // between the two failed.
  if (previous && previous.storageKey !== stored.storageKey) {
    await kycStorage.remove(previous.storageKey);
  }

  // A replaced document re-opens the whole review: the admin verified a
  // specific image, not the idea of one.
  const kyc = await prisma.partnerKyc.findUnique({ where: { partnerId }, select: { status: true } });
  if (kyc?.status === "VERIFIED") {
    await prisma.partnerKyc.update({
      where: { partnerId },
      data: { status: "PENDING", verifiedAt: null, verifiedBy: null, submittedAt: new Date() },
    });
  } else {
    await refreshSubmissionState(partnerId);
  }

  return { ok: true, documentId: doc.id, kind };
}

// ------------------------------------------------------------------ admin

export type AdminKycRow = {
  partnerId: string;
  partnerName: string;
  /** What the partner typed as their payout account holder — the string to compare. */
  accountHolderName: string | null;
  legalName: string | null;
  panMasked: string | null;
  status: PartnerKycStatus;
  submittedAt: Date | null;
  documents: KycDocumentView[];
};

export async function listKycQueue(): Promise<AdminKycRow[]> {
  const rows = await prisma.partnerKyc.findMany({
    where: { status: { in: ["PENDING", "REJECTED"] } },
    orderBy: [{ status: "asc" }, { submittedAt: "asc" }],
    take: 50,
    include: {
      documents: { orderBy: { uploadedAt: "desc" } },
      partner: { select: { fullName: true, payoutAccount: { select: { accountHolderName: true } } } },
    },
  });

  return rows.map((r) => ({
    partnerId: r.partnerId,
    partnerName: r.partner.fullName,
    accountHolderName: r.partner.payoutAccount?.accountHolderName ?? null,
    legalName: r.legalName,
    panMasked: r.panLast4 ? `••••••${r.panLast4}` : null,
    status: r.status,
    submittedAt: r.submittedAt,
    documents: r.documents.map(toDocumentView),
  }));
}

/**
 * The document itself, plus an audit row saying who opened it.
 *
 * Same trade as `revealPayoutDestination`: an admin about to approve a bank
 * transfer genuinely needs to look at the card, and the alternative to a
 * logged read is an unlogged one straight out of the bucket.
 */
export async function readKycDocumentForAdmin(params: {
  documentId: string;
  actorId: string;
  actorRole: Role;
}): Promise<{ ok: true; buffer: Buffer; mimeType: string } | { ok: false; message: string; status: number }> {
  const { documentId, actorId, actorRole } = params;

  const doc = await prisma.partnerKycDocument.findUnique({ where: { id: documentId } });
  if (!doc) return { ok: false, message: "Document nahi mila.", status: 404 };

  const buffer = await kycStorage.read(doc.storageKey);
  if (!buffer) {
    return {
      ok: false,
      message: "File storage me nahi mili — partner se dobara upload karwana padega.",
      status: 410,
    };
  }

  await prisma.adminAuditLog.create({
    data: {
      actorId,
      actorRole,
      actionType: "KYC_DOCUMENT_VIEWED",
      targetType: "partner_kyc_document",
      targetId: documentId,
      // The kind only. The log records that a look happened, not a second copy
      // of the thing being protected.
      newValue: doc.kind,
    },
  });

  return { ok: true, buffer, mimeType: doc.mimeType };
}

/**
 * Approve or reject a partner's KYC as a whole.
 *
 * Deliberately one decision rather than per-document ticks. The question an
 * admin is answering is "is this the person named on the payout account", and
 * it is answered by looking at whatever was uploaded together — a per-file
 * verdict would let a PAN card pass while the identity behind it stayed
 * undecided. Individual files still carry a status so a rejection can say
 * *which* upload was the problem.
 */
export async function reviewPartnerKyc(params: {
  partnerId: string;
  approve: boolean;
  note?: string | null;
  /** Files to mark rejected alongside the decision, so the partner knows what to redo. */
  rejectDocumentIds?: string[];
  actorId: string;
  actorRole: Role;
}): Promise<KycWriteResult> {
  const { partnerId, approve, note, rejectDocumentIds, actorId, actorRole } = params;

  const row = await prisma.partnerKyc.findUnique({
    where: { partnerId },
    include: { documents: { select: { id: true, kind: true } } },
  });
  if (!row) return { ok: false, error: "NOT_FOUND", message: "KYC details nahi mili.", status: 404 };

  if (!approve && !note?.trim()) {
    return { ok: false, error: "VALIDATION_FAILED", message: "Reject karne ka reason likhiye.", status: 422 };
  }
  if (approve) {
    if (!row.panCipher || !row.legalName) {
      return { ok: false, error: "INCOMPLETE", message: "PAN number ya naam abhi bhara nahi gaya.", status: 422 };
    }
    if (!row.documents.some((d) => d.kind === "PAN_CARD")) {
      return { ok: false, error: "INCOMPLETE", message: "PAN card ka document abhi upload nahi hua.", status: 422 };
    }
  }

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.partnerKyc.update({
      where: { partnerId },
      data: approve
        ? { status: "VERIFIED", verifiedAt: now, verifiedBy: actorId, rejectionNote: null }
        : { status: "REJECTED", verifiedAt: null, verifiedBy: null, rejectionNote: note!.trim() },
    });

    if (approve) {
      await tx.partnerKycDocument.updateMany({
        where: { partnerId },
        data: { status: "VERIFIED", reviewedAt: now, reviewedBy: actorId, rejectionNote: null },
      });
    } else if (rejectDocumentIds?.length) {
      await tx.partnerKycDocument.updateMany({
        where: { partnerId, id: { in: rejectDocumentIds } },
        data: { status: "REJECTED", reviewedAt: now, reviewedBy: actorId, rejectionNote: note!.trim() },
      });
    }

    await tx.adminAuditLog.create({
      data: {
        actorId,
        actorRole,
        actionType: approve ? "KYC_VERIFIED" : "KYC_REJECTED",
        targetType: "partner_kyc",
        targetId: partnerId,
        previousValue: row.status,
        newValue: approve ? "VERIFIED" : "REJECTED",
        reason: note?.trim() || null,
      },
    });
  });

  const partner = await prisma.partner.findUnique({ where: { id: partnerId }, select: { userId: true } });
  if (partner) {
    await createNotice({
      userId: partner.userId,
      kind: "MATCHMAKER_UPDATE",
      title: approve ? "Aapka KYC verify ho gaya" : "KYC me kuch theek karna hai",
      body: approve
        ? "Ab bank ya UPI details verify hote hi withdraw kar sakte hain."
        : `Dobara bhejiye — ${note?.trim() ?? "documents match nahi ho rahe the"}.`,
      href: "/partner/payouts",
    });
  }

  return { ok: true };
}

/**
 * The full PAN, for the one place it is legitimately needed: filing TDS.
 *
 * Split from `readKycDocumentForAdmin` because it answers a different question
 * and should be reachable without opening anybody's photo — and because its
 * audit rows are what a tax query gets reconstructed from.
 */
export async function revealPan(params: {
  partnerId: string;
  actorId: string;
  actorRole: Role;
}): Promise<{ ok: true; pan: string; legalName: string } | { ok: false; message: string; status: number }> {
  const { partnerId, actorId, actorRole } = params;

  const row = await prisma.partnerKyc.findUnique({ where: { partnerId } });
  if (!row?.panCipher || !row.legalName) {
    return { ok: false, message: "PAN abhi bhara nahi gaya.", status: 404 };
  }

  const pan = open({ cipherText: row.panCipher, iv: row.panIv!, authTag: row.panTag! });
  if (!pan) {
    return {
      ok: false,
      message:
        "PAN decrypt nahi hua — SECRETS_ENCRYPTION_KEY badal gayi lagti hai. Partner se dobara bharwana padega.",
      status: 409,
    };
  }

  await prisma.adminAuditLog.create({
    data: {
      actorId,
      actorRole,
      actionType: "KYC_PAN_REVEALED",
      targetType: "partner_kyc",
      targetId: partnerId,
      newValue: `••••••${row.panLast4}`,
    },
  });

  return { ok: true, pan, legalName: row.legalName };
}
