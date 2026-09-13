import "server-only";
import { createHash } from "crypto";
import sharp, { type Metadata, type OutputInfo } from "sharp";
import { prisma } from "@/lib/db/prisma";
import { MEDIA_ASPECT_MAX, MEDIA_ASPECT_MIN, MEDIA_MAX_BYTES, MEDIA_MIN_EDGE_PX, type CreativeMediaRow } from "@/lib/contracts/marketingExecution";
import { marketingCreativeStorage } from "@/lib/marketing/storage/marketingCreativeStorage";
import { recordEvent, refreshTaskStatus } from "./execution/deploymentService";
import type { MarketingCreativeMedia, Role } from "@prisma/client";

/**
 * Actual creative media (doc 14 §7.3, §8). The rules, in the order they run:
 *
 *   1. The request is bounded before a byte is buffered (the route checks
 *      `content-length`; this module checks the buffer again).
 *   2. The file is decoded with `sharp`. Its *decoded* format and dimensions
 *      decide everything — never the filename, never the client's MIME
 *      claim. SVG, GIF, HTML, PDF and polyglots do not decode as a raster
 *      JPEG/PNG/WebP and are refused.
 *   3. It is re-encoded (JPEG, or PNG when it has alpha) with EXIF/ICC/XMP
 *      dropped, auto-oriented, capped on the long edge — so what we store
 *      is a fresh, known-format file, not the uploaded bytes.
 *   4. Feed-placement geometry: at least 600px on each edge, aspect between
 *      1.91:1 and 4:5.
 *   5. SHA-256 of the stored bytes is the identity: the same image attached
 *      twice to the same creative is one row.
 *   6. The row starts PENDING_REVIEW. "Approve image for Meta Ads" is a
 *      separate click from the package approval, by a named admin.
 *
 * Approving a *different* file for a creative that already had an approved
 * one demotes the old file and voids any pending Meta create card for the
 * task — the card described a creative that no longer exists (§8).
 */

export class MediaValidationError extends Error {
  readonly code: "TOO_LARGE" | "NOT_AN_IMAGE" | "UNSUPPORTED_FORMAT" | "TOO_SMALL" | "BAD_ASPECT" | "DECODE_FAILED";
  constructor(code: MediaValidationError["code"], message: string) {
    super(message);
    this.name = "MediaValidationError";
    this.code = code;
  }
}

const ACCEPTED_DECODED_FORMATS = new Set(["jpeg", "png", "webp"]);
/** Meta accepts far larger; this keeps stored objects sane and uploads to the provider small. */
const MAX_EDGE_PX = 2400;
const JPEG_QUALITY = 90;

export interface NormalisedImage {
  buffer: Buffer;
  mimeType: "image/jpeg" | "image/png";
  extension: "jpg" | "png";
  width: number;
  height: number;
  sizeBytes: number;
  sha256: string;
  /** What `sharp` decoded the input as — recorded, never trusted from the client. */
  decodedFormat: string;
}

/** Pure w.r.t. the database: decode → validate → re-encode. Exported for the check script. */
export async function normaliseCreativeImage(input: Buffer): Promise<NormalisedImage> {
  if (input.length > MEDIA_MAX_BYTES) throw new MediaValidationError("TOO_LARGE", `File ${Math.round(input.length / 1024 / 1024)}MB — limit ${Math.round(MEDIA_MAX_BYTES / 1024 / 1024)}MB.`);
  if (input.length === 0) throw new MediaValidationError("NOT_AN_IMAGE", "Khaali file.");
  let meta: Metadata;
  try {
    // `failOn: "error"` refuses truncated/corrupt streams instead of best-effort decoding them.
    meta = await sharp(input, { failOn: "error", limitInputPixels: 40_000_000 }).metadata();
  } catch {
    throw new MediaValidationError("NOT_AN_IMAGE", "File image ki tarah decode nahi hui (corrupt, SVG/HTML ya koi aur format).");
  }
  const format = meta.format ?? "";
  if (!ACCEPTED_DECODED_FORMATS.has(format)) throw new MediaValidationError("UNSUPPORTED_FORMAT", `Decoded format "${format || "unknown"}" — sirf JPEG, PNG ya WebP raster chalega (SVG/GIF/HEIC nahi).`);

  let pipeline = sharp(input, { failOn: "error", limitInputPixels: 40_000_000 }).rotate().resize({ width: MAX_EDGE_PX, height: MAX_EDGE_PX, fit: "inside", withoutEnlargement: true });
  const hasAlpha = meta.hasAlpha === true && format !== "jpeg";
  // No `.withMetadata()` — sharp drops EXIF/ICC/XMP by default on output. That is the point.
  pipeline = hasAlpha ? pipeline.png({ compressionLevel: 9 }) : pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true });
  let out: { data: Buffer; info: OutputInfo };
  try {
    out = await pipeline.toBuffer({ resolveWithObject: true });
  } catch {
    throw new MediaValidationError("DECODE_FAILED", "Image re-encode nahi hui.");
  }
  const { width, height } = out.info;
  if (width < MEDIA_MIN_EDGE_PX || height < MEDIA_MIN_EDGE_PX) throw new MediaValidationError("TOO_SMALL", `${width}×${height}px — feed ke liye har edge ≥${MEDIA_MIN_EDGE_PX}px chahiye (1080×1080 best).`);
  const aspect = width / height;
  if (aspect < MEDIA_ASPECT_MIN - 1e-6 || aspect > MEDIA_ASPECT_MAX + 1e-6) {
    throw new MediaValidationError("BAD_ASPECT", `${width}×${height}px (aspect ${aspect.toFixed(2)}) — feed placements 4:5 (0.80) se 1.91:1 (1.91) tak lete hain. Square 1:1 sabse safe.`);
  }
  const sha256 = createHash("sha256").update(out.data).digest("hex");
  return {
    buffer: out.data,
    mimeType: hasAlpha ? "image/png" : "image/jpeg",
    extension: hasAlpha ? "png" : "jpg",
    width,
    height,
    sizeBytes: out.data.length,
    sha256,
    decodedFormat: format,
  };
}

export function toCreativeMediaRow(m: MarketingCreativeMedia): CreativeMediaRow {
  return {
    id: m.id,
    creativeAssetId: m.creativeAssetId,
    publicUrl: m.publicUrl,
    mimeType: m.mimeType,
    width: m.width,
    height: m.height,
    sizeBytes: m.sizeBytes,
    sha256Prefix: m.sha256.slice(0, 12),
    source: m.source,
    status: m.status,
    reviewedAt: m.reviewedAt?.toISOString() ?? null,
    productionReady: m.productionReady,
    createdAt: m.createdAt.toISOString(),
  };
}

export type MediaWriteResult = { ok: true; media: CreativeMediaRow; duplicate: boolean } | { ok: false; error: string; message: string; status: number };

/** Admin attaches one real image to one IMAGE brief of one task (doc 14 §8 "Upload route"). */
export async function attachCreativeMedia(params: { taskId: string; creativeAssetId: string; buffer: Buffer; actorId: string; actorRole: Role }): Promise<MediaWriteResult> {
  const creative = await prisma.creativeAsset.findUnique({ where: { id: params.creativeAssetId } });
  if (!creative || creative.taskId !== params.taskId) return { ok: false, error: "NOT_FOUND", message: "Ye creative is task ka nahi hai.", status: 404 };
  if (creative.kind !== "IMAGE") return { ok: false, error: "NOT_IMAGE_CREATIVE", message: `Sirf IMAGE creative par file attach hoti hai (ye ${creative.kind} hai — Reel/Story MKT-3 me).`, status: 422 };

  let img: NormalisedImage;
  try {
    img = await normaliseCreativeImage(params.buffer);
  } catch (err) {
    if (err instanceof MediaValidationError) return { ok: false, error: err.code, message: err.message, status: 422 };
    throw err;
  }

  const existing = await prisma.marketingCreativeMedia.findFirst({ where: { creativeAssetId: creative.id, sha256: img.sha256, status: { not: "INVALID" } } });
  if (existing) return { ok: true, media: toCreativeMediaRow(existing), duplicate: true };

  const stored = await marketingCreativeStorage.put({ taskId: params.taskId, sha256: img.sha256, buffer: img.buffer, contentType: img.mimeType, extension: img.extension });
  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.marketingCreativeMedia.create({
      data: {
        taskId: params.taskId,
        creativeAssetId: creative.id,
        storageKey: stored.storageKey,
        publicUrl: stored.publicUrl,
        mimeType: img.mimeType,
        width: img.width,
        height: img.height,
        sizeBytes: img.sizeBytes,
        sha256: img.sha256,
        source: "ADMIN_UPLOAD",
        status: "PENDING_REVIEW",
        productionReady: stored.productionReady,
        uploadedBy: params.actorId,
      },
    });
    await tx.adminAuditLog.create({
      data: {
        actorId: params.actorId,
        actorRole: params.actorRole,
        actionType: "MARKETING_MEDIA_UPLOADED",
        targetType: "marketing_creative_media",
        targetId: created.id,
        newValue: JSON.stringify({ creativeAssetId: creative.id, sha256: img.sha256, width: img.width, height: img.height, sizeBytes: img.sizeBytes, decodedFormat: img.decodedFormat, productionReady: stored.productionReady }),
      },
    });
    return created;
  });
  return { ok: true, media: toCreativeMediaRow(row), duplicate: false };
}

/**
 * The separate media approval. Approving demotes any other APPROVED file on
 * the same creative and voids a pending Meta create card whose creative set
 * just changed (doc 14 §8 "Replacing an approved file invalidates pending
 * Meta create approval and requires a new one").
 */
export async function reviewCreativeMedia(params: { mediaId: string; taskId: string; decision: "APPROVE" | "REJECT"; note: string | null; actorId: string; actorRole: Role }): Promise<MediaWriteResult> {
  const media = await prisma.marketingCreativeMedia.findUnique({ where: { id: params.mediaId } });
  if (!media || media.taskId !== params.taskId) return { ok: false, error: "NOT_FOUND", message: "Media is task ka nahi hai.", status: 404 };
  if (media.status === "INVALID") return { ok: false, error: "INVALID_MEDIA", message: "Ye file invalid hai — dobara upload karein.", status: 409 };
  const now = new Date();
  const to = params.decision === "APPROVE" ? "APPROVED" : "REJECTED";
  if (media.status === to) return { ok: true, media: toCreativeMediaRow(media), duplicate: false };

  let replacedPrevious = false;
  const updated = await prisma.$transaction(async (tx) => {
    if (to === "APPROVED") {
      const demoted = await tx.marketingCreativeMedia.updateMany({
        where: { creativeAssetId: media.creativeAssetId, status: "APPROVED", id: { not: media.id } },
        data: { status: "REJECTED", reviewedBy: params.actorId, reviewedAt: now, reviewNote: `replaced by ${media.id}` },
      });
      replacedPrevious = demoted.count > 0;
    }
    const row = await tx.marketingCreativeMedia.update({ where: { id: media.id }, data: { status: to, reviewedBy: params.actorId, reviewedAt: now, reviewNote: params.note } });
    await tx.adminAuditLog.create({
      data: {
        actorId: params.actorId,
        actorRole: params.actorRole,
        actionType: to === "APPROVED" ? "MARKETING_MEDIA_APPROVED" : "MARKETING_MEDIA_REJECTED",
        targetType: "marketing_creative_media",
        targetId: media.id,
        reason: params.note,
        newValue: JSON.stringify({ creativeAssetId: media.creativeAssetId, sha256: media.sha256, replacedPrevious }),
      },
    });
    return row;
  });

  // The creative set behind a pending Meta create card changed (an approved
  // image replaced, or the approved image rejected): the card is void.
  const changesCreativeSet = to === "REJECTED" && media.status === "APPROVED" ? true : replacedPrevious;
  if (changesCreativeSet) await voidPendingMetaCreateCards(params.taskId, `creative media ${media.id} ${to === "APPROVED" ? "replaced the approved image" : "was rejected"}`);
  return { ok: true, media: toCreativeMediaRow(updated), duplicate: false };
}

/** Expires a pending Meta create card and sends the row back through readiness — only rows with nothing external yet. */
export async function voidPendingMetaCreateCards(taskId: string, why: string): Promise<number> {
  const deployments = await prisma.campaignDeployment.findMany({ where: { taskId, platform: "META", status: { in: ["CREATE_PENDING", "BLOCKED_CONFIG", "BLOCKED_CREATIVE", "CANCELLED", "FAILED_RETRYABLE"] } } });
  let voided = 0;
  for (const dep of deployments) {
    const refs = dep.externalRefs as { campaignId?: string | null } | null;
    if (refs?.campaignId) continue;
    await prisma.$transaction(async (tx) => {
      if (dep.createApprovalId) await tx.marketingApproval.updateMany({ where: { id: dep.createApprovalId, status: { in: ["PENDING", "APPROVED"] } }, data: { status: "EXPIRED", decisionReason: `creative changed: ${why}`.slice(0, 200) } });
      await tx.campaignDeployment.updateMany({
        where: { id: dep.id, status: dep.status },
        data: { status: "BLOCKED_CREATIVE", lastErrorCode: "CREATIVE_INVALID", lastErrorMessage: `Approved creative badal gaya (${why}) — purana create card void.`.slice(0, 500), lastErrorFix: "'Re-check Meta readiness' se naya card banayein." },
      });
    });
    await recordEvent(dep.id, "creative", "info", `Create card void: ${why}. Naya readiness check chahiye.`);
    voided += 1;
  }
  if (voided) await refreshTaskStatus(taskId);
  return voided;
}

export async function listCreativeMedia(taskId: string): Promise<CreativeMediaRow[]> {
  const rows = await prisma.marketingCreativeMedia.findMany({ where: { taskId, status: { not: "INVALID" } }, orderBy: { createdAt: "asc" } });
  return rows.map(toCreativeMediaRow);
}

export type ApprovedMediaResolution = { kind: "one"; media: MarketingCreativeMedia } | { kind: "none" } | { kind: "many"; ids: string[] };

/** Exactly one APPROVED file for this brief, or the reason there is not (doc 14 §8 "Ambiguous/missing mapping → BLOCKED_CREATIVE"). */
export async function resolveApprovedMedia(creativeAssetId: string): Promise<ApprovedMediaResolution> {
  const rows = await prisma.marketingCreativeMedia.findMany({ where: { creativeAssetId, status: "APPROVED" }, orderBy: { reviewedAt: "desc" } });
  if (rows.length === 0) return { kind: "none" };
  if (rows.length > 1) return { kind: "many", ids: rows.map((r) => r.id) };
  return { kind: "one", media: rows[0] };
}
