import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import {
  isObjectStoreConfigured,
  objectBucket,
  objectClient,
  publicObjectUrl,
} from "./objectStore";

export interface StoredPhoto {
  storageKey: string;
  fileUrl: string;
}

export interface PhotoStorage {
  upload(params: { userId: string; buffer: Buffer; contentType: string; extension: string }): Promise<StoredPhoto>;
  /** Null on any read failure (missing file, bad key) — callers treat that as "source unavailable", never throw. */
  read(storageKey: string): Promise<Buffer | null>;
}

/**
 * Profile photos.
 *
 * Two implementations behind one interface, picked at module load by whether
 * an object store is configured. The seam was written for this from the start
 * (D-30 specs an S3-compatible bucket); this fills it in.
 *
 * ## Why `fileUrl` is stored rather than derived
 *
 * `ProfilePhoto.fileUrl` is written at upload time and read straight into an
 * `<img src>` by half a dozen data modules. Keeping it a stored absolute URL
 * means switching buckets does not require a migration of existing rows — old
 * photos keep pointing at wherever they were written, new ones at the new
 * bucket, and both render. Deriving the URL from the key at read time would be
 * tidier and would break every existing row the day the bucket changes.
 */
const UPLOAD_ROOT = path.join(process.cwd(), "public", "uploads", "photos");

/** Prefix inside the bucket, so photos and gated media never collide. */
const PHOTO_PREFIX = "photos";

class LocalDiskPhotoStorage implements PhotoStorage {
  async upload({ userId, buffer, extension }: { userId: string; buffer: Buffer; contentType: string; extension: string }) {
    await mkdir(UPLOAD_ROOT, { recursive: true });
    const storageKey = `${userId}/${randomUUID()}.${extension}`;
    const filePath = path.join(UPLOAD_ROOT, storageKey);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, buffer);
    return { storageKey, fileUrl: `/uploads/photos/${storageKey}` };
  }

  async read(storageKey: string) {
    try {
      return await readFile(path.join(UPLOAD_ROOT, storageKey));
    } catch {
      return null;
    }
  }
}

class S3PhotoStorage implements PhotoStorage {
  async upload({ userId, buffer, contentType, extension }: { userId: string; buffer: Buffer; contentType: string; extension: string }) {
    // The stored key keeps the same `userId/uuid.ext` shape the local
    // implementation uses, so a row written by either backend is readable by
    // the same `read()` once the prefix is applied.
    const storageKey = `${userId}/${randomUUID()}.${extension}`;

    await objectClient().send(
      new PutObjectCommand({
        Bucket: objectBucket,
        Key: `${PHOTO_PREFIX}/${storageKey}`,
        Body: buffer,
        ContentType: contentType,
        // A year: the key contains a UUID, so a given object is immutable and
        // a re-upload is a different key. Nothing here is ever overwritten.
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );

    return { storageKey, fileUrl: publicObjectUrl(`${PHOTO_PREFIX}/${storageKey}`) };
  }

  async read(storageKey: string) {
    try {
      const res = await objectClient().send(
        new GetObjectCommand({ Bucket: objectBucket, Key: `${PHOTO_PREFIX}/${storageKey}` }),
      );
      if (!res.Body) return null;
      return Buffer.from(await res.Body.transformToByteArray());
    } catch {
      // Same contract as the local implementation: a missing object is
      // "source unavailable", which the enhance routes already handle.
      return null;
    }
  }
}

export const photoStorage: PhotoStorage = isObjectStoreConfigured()
  ? new S3PhotoStorage()
  : new LocalDiskPhotoStorage();
