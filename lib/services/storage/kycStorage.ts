import "server-only";
import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { isObjectStoreConfigured, objectBucket, objectClient } from "./objectStore";

/**
 * Storage for partner identity documents.
 *
 * ## Why this is not `mediaStorage`
 *
 * `mediaStorage` is keyed by `MediaKind`, a Prisma enum about *member* content
 * — voice notes and blurred photo derivatives. A PAN card is neither, and
 * widening that enum would put identity documents into the same prefix, the
 * same `remove()` paths and the same mental bucket as a voice clip somebody
 * recorded for a match. They deserve their own prefix so that a bucket policy,
 * a retention rule or a deletion sweep can name them separately from
 * everything else.
 *
 * What it *does* copy from `mediaStorage` is the part that matters: nothing
 * ever lands under `public/`, there is no URL that serves these bytes, and the
 * only exit is a route that re-checks the admin role per request. See
 * `KYC_ROOT` below — it sits beside `private-media`, outside the served tree.
 *
 * **The bucket must not be world-readable at the `kyc/` prefix.**
 *
 * ## Why buffers rather than streams
 *
 * The upload route caps a document at 8MB (`MAX_KYC_BYTES`), which is already
 * generous for a phone photo of a card. Streaming machinery for that would be
 * cost with no benefit, and buffering is what lets the route check the real
 * magic bytes before anything is written.
 */

export interface StoredKycDocument {
  storageKey: string;
  sizeBytes: number;
}

export interface KycStorage {
  upload(params: {
    partnerId: string;
    buffer: Buffer;
    extension: string;
    contentType: string;
  }): Promise<StoredKycDocument>;
  read(storageKey: string): Promise<Buffer | null>;
  remove(storageKey: string): Promise<void>;
}

const KYC_ROOT = path.join(process.cwd(), "private-kyc");

/** Keeps identity documents in their own prefix, away from `media/` and `photos/`. */
const KYC_PREFIX = "kyc";

/**
 * Rejects any key that could escape the root. Keys are generated here and
 * stored in our own DB, so a traversal attempt means something is already
 * wrong — but the check costs nothing and the failure mode it prevents is
 * "read any file on the server".
 */
function resolveKey(storageKey: string): string {
  const full = path.resolve(KYC_ROOT, storageKey);
  const root = path.resolve(KYC_ROOT);
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new Error("Invalid storage key.");
  }
  return full;
}

class LocalDiskKycStorage implements KycStorage {
  async upload({ partnerId, buffer, extension }: { partnerId: string; buffer: Buffer; extension: string; contentType: string }) {
    const storageKey = `${partnerId}/${randomUUID()}.${extension}`;
    const filePath = resolveKey(storageKey);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, buffer);
    return { storageKey, sizeBytes: buffer.byteLength };
  }

  async read(storageKey: string): Promise<Buffer | null> {
    try {
      return await readFile(resolveKey(storageKey));
    } catch {
      return null;
    }
  }

  async remove(storageKey: string): Promise<void> {
    await unlink(resolveKey(storageKey)).catch(() => {});
  }
}

class S3KycStorage implements KycStorage {
  async upload({
    partnerId,
    buffer,
    extension,
    contentType,
  }: {
    partnerId: string;
    buffer: Buffer;
    extension: string;
    contentType: string;
  }) {
    const storageKey = `${partnerId}/${randomUUID()}.${extension}`;
    await objectClient().send(
      new PutObjectCommand({
        Bucket: objectBucket,
        Key: `${KYC_PREFIX}/${storageKey}`,
        Body: buffer,
        ContentType: contentType,
        // No public URL and no caching: every read goes back through the admin
        // route so the role check cannot be cached past a change in who is an
        // admin.
        CacheControl: "private, no-store",
      }),
    );
    return { storageKey, sizeBytes: buffer.byteLength };
  }

  async read(storageKey: string): Promise<Buffer | null> {
    try {
      const res = await objectClient().send(
        new GetObjectCommand({ Bucket: objectBucket, Key: `${KYC_PREFIX}/${storageKey}` }),
      );
      const bytes = await res.Body?.transformToByteArray();
      return bytes ? Buffer.from(bytes) : null;
    } catch {
      return null;
    }
  }

  async remove(storageKey: string): Promise<void> {
    await objectClient()
      .send(new DeleteObjectCommand({ Bucket: objectBucket, Key: `${KYC_PREFIX}/${storageKey}` }))
      .catch(() => {});
  }
}

export const kycStorage: KycStorage = isObjectStoreConfigured()
  ? new S3KycStorage()
  : new LocalDiskKycStorage();
