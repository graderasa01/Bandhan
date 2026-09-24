import "server-only";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { isObjectStoreConfigured, objectBucket, objectClient, publicObjectUrl } from "@/lib/services/storage/objectStore";

/**
 * Where an admin's room photo lives.
 *
 * Its own prefix — `theme-rooms/` — so a background never sits next to a
 * profile photo (`photos/`, gated at the data layer) or a voice note
 * (`media/`, never public). A room photo is public by definition: every
 * visitor's browser fetches it. Names carry the content hash, so an object is
 * immutable, a year of caching is safe, and uploading the same file twice is
 * the same object.
 *
 * Two backends, chosen by whether an object store is configured — the same
 * seam as `photoStorage`. Local disk is for a developer checkout: on a
 * container host it is wiped by the next deploy, which is exactly the loss
 * `assertObjectStoreInProduction` warns about at boot.
 */
const PREFIX = "theme-rooms";
const LOCAL_ROOT = path.join(process.cwd(), "public", "uploads", PREFIX);

/** Stores one object and returns the URL a browser loads it from. */
export async function putThemeRoomObject(name: string, buffer: Buffer, contentType: string): Promise<string> {
  if (!isObjectStoreConfigured()) {
    await mkdir(LOCAL_ROOT, { recursive: true });
    await writeFile(path.join(LOCAL_ROOT, name), buffer);
    return `/uploads/${PREFIX}/${name}`;
  }

  const key = `${PREFIX}/${name}`;
  await objectClient().send(
    new PutObjectCommand({
      Bucket: objectBucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
  return publicObjectUrl(key);
}
