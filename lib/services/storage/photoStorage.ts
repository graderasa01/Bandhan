import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

export interface StoredPhoto {
  storageKey: string;
  fileUrl: string;
}

export interface PhotoStorage {
  upload(params: { userId: string; buffer: Buffer; contentType: string; extension: string }): Promise<StoredPhoto>;
  /** Null on any read failure (missing file, bad key) — callers treat that as "source unavailable", never throw. */
  read(storageKey: string): Promise<Buffer | null>;
}

// D-30 specs Cloudflare R2; no R2 credentials exist in this environment. This
// interface is the seam — swapping to an R2-backed implementation later is a
// config change (implement `PhotoStorage`, wire it in below), not a rewrite
// of anything that calls `photoStorage.upload()`.
const UPLOAD_ROOT = path.join(process.cwd(), "public", "uploads", "photos");

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

export const photoStorage: PhotoStorage = new LocalDiskPhotoStorage();
