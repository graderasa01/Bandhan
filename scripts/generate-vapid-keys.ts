/**
 * Generates the VAPID keypair that signs this deployment's push notifications.
 *
 *   npx tsx scripts/generate-vapid-keys.ts
 *
 * Paste the two lines it prints into `.env.local`. Run it **once per
 * deployment and never again**: the public half is baked into every browser
 * subscription the app has ever handed out, so rotating the keypair silently
 * invalidates every existing subscription — users stay opted in as far as they
 * can tell, and simply stop receiving anything until they toggle it off and on.
 *
 * (This is why the keys live in env rather than being generated at boot. A
 * server that made a fresh pair on each restart would break push on every
 * deploy, and the symptom — notifications quietly stopping for existing users
 * only — is close to undiagnosable from the outside.)
 */
import { generateKeyPairSync } from "crypto";

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });

// Web Push wants the raw curve points, not DER/PEM: the uncompressed 65-byte
// public point and the bare 32-byte private scalar. The JWK export gives both
// already base64url-encoded in exactly that form.
const pubJwk = publicKey.export({ format: "jwk" }) as { x: string; y: string };
const privJwk = privateKey.export({ format: "jwk" }) as { d: string };

const uncompressed = Buffer.concat([
  Buffer.from([0x04]),
  Buffer.from(pubJwk.x.replace(/-/g, "+").replace(/_/g, "/"), "base64"),
  Buffer.from(pubJwk.y.replace(/-/g, "+").replace(/_/g, "/"), "base64"),
]);

console.log("\nAdd these to .env.local:\n");
console.log(`VAPID_PUBLIC_KEY=${b64url(uncompressed)}`);
console.log(`VAPID_PRIVATE_KEY=${privJwk.d}`);
console.log(`VAPID_SUBJECT=mailto:support@bandhantak.com\n`);
