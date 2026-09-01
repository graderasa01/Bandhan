import "server-only";
import { S3Client } from "@aws-sdk/client-s3";

/**
 * The one S3-compatible client, and the decision of whether to use it at all.
 *
 * ## Why S3-compatible rather than a vendor SDK
 *
 * The requirement is portability: the app must be movable to AWS, or off it,
 * without a rewrite. Every candidate store speaks the S3 API — Cloudflare R2,
 * AWS S3, Supabase Storage, Backblaze B2, DigitalOcean Spaces, MinIO — so one
 * implementation against that API makes the choice of vendor a change of four
 * environment variables. A vendor SDK would make it a change of code.
 *
 * `forcePathStyle` is on because R2, Supabase and MinIO all address buckets as
 * `endpoint/bucket/key`; real AWS S3 accepts that form too, so one setting is
 * correct everywhere rather than correct on one and broken on the rest.
 *
 * ## Why this is optional, and what happens when it is absent
 *
 * `isObjectStoreConfigured()` is false until the four required variables are
 * set, and the two storage modules fall back to local disk. That keeps a
 * developer checkout working with no cloud account at all, and it keeps this
 * change deployable before the bucket exists.
 *
 * It is **not** a safe production state. Local disk on a container host is
 * wiped on every deploy, so profile photos uploaded between two deploys are
 * gone at the second one. `assertObjectStoreInProduction()` exists to make
 * that loud rather than quiet — see its comment.
 */

const ENDPOINT = process.env.S3_ENDPOINT;
const BUCKET = process.env.S3_BUCKET;
const ACCESS_KEY = process.env.S3_ACCESS_KEY_ID;
const SECRET_KEY = process.env.S3_SECRET_ACCESS_KEY;

/**
 * R2 ignores the region but the SDK requires one; "auto" is R2's documented
 * value and AWS callers override it with their real region.
 */
const REGION = process.env.S3_REGION ?? "auto";

/**
 * Public base URL for objects that are meant to be readable without a signed
 * request — profile photos, which are already withheld at the *data* layer for
 * locked profiles (see `reelData.ts`, which returns a null URL rather than a
 * blurred image).
 *
 * Separate from `S3_ENDPOINT` because on R2 the public hostname is a custom
 * domain or an `r2.dev` subdomain, never the API endpoint.
 */
const PUBLIC_URL = process.env.S3_PUBLIC_URL?.replace(/\/+$/, "");

export function isObjectStoreConfigured(): boolean {
  return Boolean(ENDPOINT && BUCKET && ACCESS_KEY && SECRET_KEY);
}

export const objectBucket = BUCKET ?? "";

/**
 * Where a public object can be fetched from.
 *
 * Falls back to `endpoint/bucket/key`, which works for MinIO and for buckets
 * whose endpoint is itself public, and is wrong for R2 — hence the explicit
 * `S3_PUBLIC_URL`, which `assertObjectStoreInProduction` insists on.
 */
export function publicObjectUrl(key: string): string {
  if (PUBLIC_URL) return `${PUBLIC_URL}/${key}`;
  return `${ENDPOINT}/${BUCKET}/${key}`;
}

let client: S3Client | null = null;

export function objectClient(): S3Client {
  if (!isObjectStoreConfigured()) {
    throw new Error("Object store is not configured — check S3_ENDPOINT / S3_BUCKET / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY.");
  }
  client ??= new S3Client({
    region: REGION,
    endpoint: ENDPOINT,
    forcePathStyle: true,
    credentials: { accessKeyId: ACCESS_KEY!, secretAccessKey: SECRET_KEY! },
  });
  return client;
}

/**
 * Shouted at boot in production, never in development.
 *
 * A missing bucket in production is silent data loss on a delay: uploads keep
 * succeeding, photos keep displaying, and then a deploy takes the container's
 * filesystem with it. By the time anybody notices, the photos are already
 * gone and there is nothing to restore. A log line at every boot is the
 * cheapest thing that turns a silent failure into a visible one.
 *
 * Deliberately a warning and not a crash: refusing to boot would take a
 * working site down over a feature most requests never touch, and the operator
 * who sees this line can fix it in four environment variables.
 */
export function assertObjectStoreInProduction(): void {
  if (process.env.NODE_ENV !== "production") return;
  if (isObjectStoreConfigured() && PUBLIC_URL) return;

  const missing = [
    !ENDPOINT && "S3_ENDPOINT",
    !BUCKET && "S3_BUCKET",
    !ACCESS_KEY && "S3_ACCESS_KEY_ID",
    !SECRET_KEY && "S3_SECRET_ACCESS_KEY",
    !PUBLIC_URL && "S3_PUBLIC_URL",
  ].filter(Boolean);

  console.error(
    `[storage] WARNING: object store not configured (${missing.join(", ")}). ` +
      "Uploads are going to the container filesystem and WILL BE LOST on the next deploy.",
  );
}
