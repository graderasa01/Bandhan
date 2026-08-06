import "server-only";
import {
  createCipheriv,
  createECDH,
  createHmac,
  createPrivateKey,
  randomBytes,
} from "crypto";
import { SignJWT } from "jose";

/**
 * Web Push — RFC 8291 (aes128gcm payload encryption) and RFC 8292 (VAPID),
 * implemented against Node's own crypto rather than pulling in `web-push`.
 *
 * ## Why hand-rolled
 *
 * The `web-push` package is ~1 MB of dependency tree for two well-specified
 * primitives that Node already ships: an ECDH over P-256 and an AES-128-GCM
 * seal. The whole protocol is the eighty lines below. Against that, a new
 * transitive dependency in the path that sends every notification this product
 * makes is the more expensive choice — this is the one code path that touches a
 * user's lock screen.
 *
 * ## Why the notification carries no personal detail
 *
 * A push payload is decrypted by the browser and rendered on a lock screen that
 * anyone standing nearby can read. In a matrimony app that is a real exposure:
 * "Priya Sharma ne aapko voice note bheja" on a shared family phone is a
 * disclosure the user never agreed to. So `sendPushToUser` takes the notice's
 * *already-masked* title and body — the same strings `noticeService` writes,
 * which are required to be free of identifying detail when `actorMasked` is set
 * — and adds nothing to them.
 *
 * ## Failure is silent by design
 *
 * Everything here resolves rather than throws. A push is a side effect of
 * something that already happened in the database; a dead subscription or an
 * unreachable push service must never roll back the interest, match or voice
 * note that triggered it. Dead endpoints (404/410) are pruned as they are found,
 * which is the only garbage collection this table needs.
 */

const RECORD_SIZE = 4096;

function b64urlToBuffer(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function bufferToB64url(b: Buffer): string {
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function hmac(key: Buffer, data: Buffer): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

/** HKDF with a single output block — every field here is under 32 bytes. */
function hkdf(salt: Buffer, ikm: Buffer, info: Buffer, length: number): Buffer {
  const prk = hmac(salt, ikm);
  return hmac(prk, Buffer.concat([info, Buffer.from([1])])).subarray(0, length);
}

export interface PushKeys {
  /** The UA's public key — uncompressed P-256 point, base64url. */
  p256dh: string;
  /** The UA's auth secret, 16 bytes base64url. */
  auth: string;
}

/**
 * RFC 8291 §3.4. Returns the full request body: a 21-byte header, the sender's
 * ephemeral public key, then the sealed record.
 */
function encryptPayload(payload: string, keys: PushKeys): Buffer {
  const uaPublic = b64urlToBuffer(keys.p256dh);
  const authSecret = b64urlToBuffer(keys.auth);

  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const sharedSecret = ecdh.computeSecret(uaPublic);

  // The IKM is itself derived, keyed by the auth secret, so that a push service
  // holding only the (public) endpoint learns nothing from the ECDH.
  const keyInfo = Buffer.concat([
    Buffer.from("WebPush: info\0"),
    uaPublic,
    asPublic,
  ]);
  const ikm = hkdf(authSecret, sharedSecret, keyInfo, 32);

  const salt = randomBytes(16);
  const cek = hkdf(salt, ikm, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
  const nonce = hkdf(salt, ikm, Buffer.from("Content-Encoding: nonce\0"), 12);

  // 0x02 is the padding delimiter marking the last (and here only) record.
  const plaintext = Buffer.concat([Buffer.from(payload, "utf8"), Buffer.from([2])]);

  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);

  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(RECORD_SIZE, 16);
  header.writeUInt8(asPublic.length, 20);

  return Buffer.concat([header, asPublic, ciphertext]);
}

interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

/** Null — not an exception — when the deployment has no VAPID keys configured. */
export function vapidConfig(): VapidConfig | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;
  return {
    publicKey,
    privateKey,
    subject: process.env.VAPID_SUBJECT?.trim() || "mailto:support@bandhantak.com",
  };
}

export function isPushConfigured(): boolean {
  return vapidConfig() !== null;
}

/**
 * Builds the `Authorization: vapid …` header. The raw 32-byte private scalar
 * from the env is reassembled into a JWK alongside the x/y taken from the
 * public point, which is the only shape Node will import as an EC private key.
 */
async function vapidAuthHeader(endpoint: string, cfg: VapidConfig): Promise<string> {
  const publicKeyBytes = b64urlToBuffer(cfg.publicKey);
  const jwk = {
    kty: "EC",
    crv: "P-256",
    x: bufferToB64url(publicKeyBytes.subarray(1, 33)),
    y: bufferToB64url(publicKeyBytes.subarray(33, 65)),
    d: bufferToB64url(b64urlToBuffer(cfg.privateKey)),
  };
  const key = createPrivateKey({ key: jwk, format: "jwk" });

  const jwt = await new SignJWT({})
    .setProtectedHeader({ typ: "JWT", alg: "ES256" })
    .setAudience(new URL(endpoint).origin)
    // RFC 8292 caps this at 24h; 12 is the conventional margin.
    .setExpirationTime(Math.floor(Date.now() / 1000) + 12 * 60 * 60)
    .setSubject(cfg.subject)
    .sign(key);

  return `vapid t=${jwt}, k=${cfg.publicKey}`;
}

export interface PushPayload {
  title: string;
  body: string;
  /** In-app path the notification opens. */
  url?: string;
  /** Collapses same-kind notifications on the lock screen. */
  tag?: string;
  noticeId?: string;
}

export type PushResult = "sent" | "expired" | "failed" | "not-configured";

/** Sends one encrypted push. `expired` means the caller should delete the row. */
export async function sendPush(
  endpoint: string,
  keys: PushKeys,
  payload: PushPayload,
): Promise<PushResult> {
  const cfg = vapidConfig();
  if (!cfg) return "not-configured";

  try {
    const body = encryptPayload(JSON.stringify(payload), keys);
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: await vapidAuthHeader(endpoint, cfg),
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: "86400",
        Urgency: "normal",
      },
      body: new Uint8Array(body),
    });

    if (res.status === 404 || res.status === 410) return "expired";
    if (!res.ok) {
      console.error(`[push] ${res.status} from ${new URL(endpoint).host}`);
      return "failed";
    }
    return "sent";
  } catch (err) {
    console.error("[push] send failed:", err instanceof Error ? err.message : String(err));
    return "failed";
  }
}
