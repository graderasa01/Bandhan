import "server-only";
import { mkdir, readFile, writeFile } from "fs/promises";
import { lookup } from "dns/promises";
import { isIP } from "net";
import path from "path";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { isObjectStoreConfigured, objectBucket, objectClient, publicObjectUrl } from "@/lib/services/storage/objectStore";

/**
 * Where a Meta static creative lives (doc 14 §8).
 *
 * Its own prefix — `marketing-creatives/` — so an ad image never sits next
 * to a profile photo (`photos/`, gated at the data layer) or a voice note
 * (`media/`, never public). Ad creatives are, by definition, public: the
 * provider fetches them and the world sees them. Keys carry the content
 * hash, so an object is immutable and a different file is a different key.
 *
 * Two backends behind one interface, chosen by whether an object store is
 * configured — same seam as `photoStorage`. The difference from photos:
 * `productionReady` is written on the media row at upload time, and it is
 * true only when the object store *and* a public base URL exist. A
 * local-disk `/uploads/...` URL is fine for an admin preview and never
 * acceptable for a real Meta create (§8 "Never use local disk URL").
 */

const PREFIX = "marketing-creatives";
const LOCAL_ROOT = path.join(process.cwd(), "public", "uploads", PREFIX);

export interface StoredCreative {
  storageKey: string;
  publicUrl: string;
  productionReady: boolean;
}

export interface MarketingCreativeStorage {
  put(params: { taskId: string; sha256: string; buffer: Buffer; contentType: string; extension: string }): Promise<StoredCreative>;
  /** Null on any read failure — the executor treats that as CREATIVE_MISSING, never as a crash. */
  read(storageKey: string): Promise<Buffer | null>;
  productionReady(): boolean;
}

/** Object store configured AND a stable public base URL — both, or a Meta create stays blocked. */
export function isCreativeStorageProductionReady(): boolean {
  return isObjectStoreConfigured() && Boolean(process.env.S3_PUBLIC_URL?.trim());
}

function keyFor(taskId: string, sha256: string, extension: string): string {
  return `${taskId}/${sha256}.${extension}`;
}

class LocalDiskCreativeStorage implements MarketingCreativeStorage {
  async put({ taskId, sha256, buffer, extension }: { taskId: string; sha256: string; buffer: Buffer; contentType: string; extension: string }) {
    const storageKey = keyFor(taskId, sha256, extension);
    const filePath = path.join(LOCAL_ROOT, storageKey);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, buffer);
    return { storageKey, publicUrl: `/uploads/${PREFIX}/${storageKey}`, productionReady: false };
  }

  async read(storageKey: string) {
    try {
      return await readFile(path.join(LOCAL_ROOT, storageKey));
    } catch {
      return null;
    }
  }

  productionReady() {
    return false;
  }
}

class S3CreativeStorage implements MarketingCreativeStorage {
  async put({ taskId, sha256, buffer, contentType, extension }: { taskId: string; sha256: string; buffer: Buffer; contentType: string; extension: string }) {
    const storageKey = keyFor(taskId, sha256, extension);
    await objectClient().send(
      new PutObjectCommand({
        Bucket: objectBucket,
        Key: `${PREFIX}/${storageKey}`,
        Body: buffer,
        ContentType: contentType,
        // Content-addressed key: immutable by construction.
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
    return { storageKey, publicUrl: publicObjectUrl(`${PREFIX}/${storageKey}`), productionReady: isCreativeStorageProductionReady() };
  }

  async read(storageKey: string) {
    try {
      const res = await objectClient().send(new GetObjectCommand({ Bucket: objectBucket, Key: `${PREFIX}/${storageKey}` }));
      if (!res.Body) return null;
      return Buffer.from(await res.Body.transformToByteArray());
    } catch {
      return null;
    }
  }

  productionReady() {
    return isCreativeStorageProductionReady();
  }
}

export const marketingCreativeStorage: MarketingCreativeStorage = isObjectStoreConfigured() ? new S3CreativeStorage() : new LocalDiskCreativeStorage();

// ============================================================
// Public URL probe (doc 14 §8 "HEAD/GET probe final URL without following
// to private/internal addresses", §20.3 "private-network/redirect abuse")
// ============================================================

/** RFC1918, loopback, link-local, CGNAT, unique-local and unspecified — an ad image URL must never point here. */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }
  if (v === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true;
    if (lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) return true;
    if (lower.startsWith("::ffff:")) return isPrivateAddress(lower.slice(7));
    return false;
  }
  return true;
}

export interface UrlProbeVerdict {
  ok: boolean;
  status: number | null;
  reason: string | null;
}

/**
 * Is this URL something a provider may fetch? HTTPS, a public host, no
 * redirect followed (a redirect to a private address is the classic
 * abuse; the answer is "not immutable", which is also a Meta problem), a
 * 2xx with an image content type.
 *
 * `fetchImpl` and `resolve` are injectable so the checks never touch the
 * network.
 */
export async function probePublicImageUrl(
  url: string,
  deps: { fetchImpl?: typeof fetch; resolve?: (host: string) => Promise<string[]>; timeoutMs?: number } = {},
): Promise<UrlProbeVerdict> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, status: null, reason: "URL parse nahi hua" };
  }
  if (parsed.protocol !== "https:") return { ok: false, status: null, reason: `HTTPS nahi hai (${parsed.protocol})` };
  if (parsed.username || parsed.password) return { ok: false, status: null, reason: "URL me credentials hain" };
  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return { ok: false, status: null, reason: `private host ${host}` };
  if (isIP(host) && isPrivateAddress(host)) return { ok: false, status: null, reason: `private address ${host}` };
  if (!isIP(host)) {
    try {
      const resolve = deps.resolve ?? (async (h: string) => (await lookup(h, { all: true })).map((r) => r.address));
      const addresses = await resolve(host);
      if (!addresses.length) return { ok: false, status: null, reason: `${host} resolve nahi hua` };
      const bad = addresses.find(isPrivateAddress);
      if (bad) return { ok: false, status: null, reason: `${host} private address ${bad} par resolve hota hai` };
    } catch {
      return { ok: false, status: null, reason: `${host} resolve nahi hua` };
    }
  }
  const fetchImpl = deps.fetchImpl ?? fetch;
  const attempt = async (method: "HEAD" | "GET") => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? 8_000);
    try {
      return await fetchImpl(url, { method, redirect: "manual", signal: controller.signal, headers: { "user-agent": "BandhanTak-GrowthSaathi/1.0 (creative check)" } });
    } finally {
      clearTimeout(timer);
    }
  };
  try {
    let res = await attempt("HEAD");
    if (res.status === 405 || res.status === 403 || res.status === 404) res = await attempt("GET");
    if (res.status >= 300 && res.status < 400) return { ok: false, status: res.status, reason: `redirect (${res.status}) — creative URL immutable/direct hona chahiye` };
    if (res.status < 200 || res.status >= 300) return { ok: false, status: res.status, reason: `HTTP ${res.status}` };
    const type = (res.headers.get("content-type") ?? "").toLowerCase();
    if (!type.startsWith("image/")) return { ok: false, status: res.status, reason: `content-type ${type || "unknown"} image nahi hai` };
    return { ok: true, status: res.status, reason: null };
  } catch {
    return { ok: false, status: null, reason: "no response" };
  }
}
