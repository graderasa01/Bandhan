/**
 * Browser-side push plumbing: register the worker, ask permission, hand the
 * subscription to the server.
 *
 * ## The permission prompt is never fired on page load
 *
 * Every function here is triggered by an explicit tap. A browser gives a site
 * exactly one chance at the notification prompt — deny it once and the toggle
 * is dead until the user digs into site settings — so firing it at a moment
 * the user has not asked for it burns the only chance the app gets. This is
 * also why `enablePush` returns a discriminated result instead of a boolean:
 * "denied" needs a different sentence on screen than "this browser can't".
 */

export const NOTICE_ARRIVED_MESSAGE = "bandhantak:notice-arrived";

export type PushSupport = "supported" | "unsupported" | "insecure-context";

export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  // Push needs a secure context. localhost counts as one, which is what makes
  // this testable in dev without a tunnel.
  if (!window.isSecureContext) return "insecure-context";
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported";
  return "supported";
}

export function permissionState(): NotificationPermission | "unsupported" {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

export async function registerWorker(): Promise<ServiceWorkerRegistration | null> {
  if (pushSupport() !== "supported") return null;
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    return null;
  }
}

/**
 * VAPID keys travel as base64url; `applicationServerKey` wants raw bytes.
 *
 * Returns the `ArrayBuffer` rather than the view: `Uint8Array` is generic over
 * its backing buffer in current lib.dom typings, and `BufferSource` will not
 * accept one that might be `SharedArrayBuffer`-backed.
 */
function b64urlToBytes(base64url: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return buffer;
}

export type EnableResult =
  | { ok: true; deviceCount: number }
  | { ok: false; reason: "unsupported" | "insecure-context" | "denied" | "not-configured" | "failed" };

export async function enablePush(): Promise<EnableResult> {
  const support = pushSupport();
  if (support !== "supported") return { ok: false, reason: support };

  const config = await fetch("/api/push/subscribe")
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  if (!config?.configured || !config.publicKey) return { ok: false, reason: "not-configured" };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: "denied" };

  const registration = await registerWorker();
  if (!registration) return { ok: false, reason: "failed" };

  try {
    // `ready` rather than the register() result: a worker that is installing
    // has no pushManager yet, and on a first visit that is the common case.
    const ready = await navigator.serviceWorker.ready;
    const existing = await ready.pushManager.getSubscription();
    const subscription =
      existing ??
      (await ready.pushManager.subscribe({
        // Chrome refuses silent pushes outright; the server always sends a
        // payload anyway, so this is a statement of fact, not a concession.
        userVisibleOnly: true,
        applicationServerKey: b64urlToBytes(config.publicKey),
      }));

    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subscription.toJSON()),
    });
    if (!res.ok) return { ok: false, reason: "failed" };

    const data = await res.json();
    return { ok: true, deviceCount: Number(data.deviceCount) || 1 };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

/**
 * Turns push off for *this* browser only.
 *
 * The browser subscription is dropped as well as the server row. Deleting only
 * the row would leave the browser happily accepting pushes from an endpoint the
 * server has forgotten — harmless today, and a resurrected notification the day
 * someone restores a backup.
 */
export async function disablePush(): Promise<boolean> {
  if (pushSupport() !== "supported") return false;
  try {
    const ready = await navigator.serviceWorker.ready;
    const subscription = await ready.pushManager.getSubscription();
    if (!subscription) return true;

    await fetch(`/api/push/subscribe?endpoint=${encodeURIComponent(subscription.endpoint)}`, {
      method: "DELETE",
    });
    await subscription.unsubscribe();
    return true;
  } catch {
    return false;
  }
}

export async function isSubscribedHere(): Promise<boolean> {
  if (pushSupport() !== "supported" || Notification.permission !== "granted") return false;
  try {
    const registration = await navigator.serviceWorker.getRegistration("/");
    if (!registration) return false;
    return (await registration.pushManager.getSubscription()) !== null;
  } catch {
    return false;
  }
}
