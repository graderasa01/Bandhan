/* eslint-disable no-restricted-globals */
/**
 * BandhanTak service worker — push notifications only.
 *
 * Deliberately **not** an offline cache. A matrimony app serving a stale
 * cached profile, a stale plan state, or a stale "aapko match mila" would be
 * actively wrong, and the failure would be invisible to the user. So there is
 * no `fetch` handler here at all: every request goes to the network exactly as
 * it did before this file existed. The only power this worker takes is the one
 * it needs — receiving a push while the app is closed.
 *
 * Kept as a plain file in /public rather than generated: it must be served from
 * the origin root to control the whole scope, it changes roughly never, and a
 * build step that silently stops emitting it would break notifications with no
 * error anywhere.
 */

self.addEventListener("install", () => {
  // Take over immediately rather than waiting for every tab to close — a user
  // who just granted permission expects the next notification to arrive, not
  // the one after they restart their browser.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/**
 * Navigations go to the network, and only a network that is GONE is answered
 * from here.
 *
 * This is still not a cache — nothing is ever stored and no response is ever
 * replayed, so the rule at the top of this file holds: a stale profile, a
 * stale plan or a stale "aapko match mila" can never be served. What this adds
 * is the two things a fetch handler is actually needed for:
 *
 *   1. Installability. A browser will not offer "add to home screen" — and
 *      will not fire `beforeinstallprompt`, which is what every install button
 *      in the app waits for — for a worker with no fetch handler at all. The
 *      manifest and the icons were already in place; this was the missing
 *      piece, and it is why the install offer on the home page can be shown to
 *      someone who has never signed in.
 *   2. A page instead of the browser's dinosaur when the phone drops off the
 *      network mid-tap. An installed app that shows a Chrome error screen
 *      stops feeling like an app the first time it happens.
 *
 * Only `navigate` requests are touched. Everything else — data, images, the
 * app's own JS — is left entirely alone: not calling `respondWith` hands the
 * request straight back to the browser, exactly as if this handler did not
 * exist.
 */
const OFFLINE_PAGE = `<!doctype html><html lang="hi-Latn"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>BandhanTak — offline</title>
<style>
 :root{color-scheme:light}
 body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#fbf5ee;
      color:#2a1c19;font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:24px}
 .c{max-width:22rem;text-align:center}
 h1{font-size:1.35rem;margin:0 0 .5rem}
 p{margin:0 0 1.5rem;color:#6b5d52}
 button{border:0;border-radius:999px;padding:.8rem 1.6rem;font:inherit;font-weight:600;
        color:#2e2413;background:linear-gradient(103deg,#ddac51,#c9a96e 48%,#a88848)}
</style></head><body><div class="c">
<h1>Internet nahi mil raha</h1>
<p>Connection wapas aate hi BandhanTak phir se khul jayega.</p>
<button onclick="location.reload()">Dobara koshish karein</button>
</div></body></html>`;

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(
      () =>
        new Response(OFFLINE_PAGE, {
          status: 503,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        }),
    ),
  );
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  const title = data.title || "BandhanTak";
  const options = {
    body: data.body || "",
    // Same icon in both slots; `badge` is the monochrome status-bar glyph on
    // Android and falls back gracefully everywhere else.
    icon: "/icon-192.png",
    badge: "/icon-badge.png",
    tag: data.tag || "bandhantak",
    // With a tag set, a second notification replaces the first *silently* by
    // default. These arrive minutes apart, not seconds, so a re-alert is right.
    renotify: Boolean(data.tag),
    data: { url: data.url || "/user/inbox", noticeId: data.noticeId || null },
  };

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      // Nudge any open tab to refresh its unread count. This is what replaces
      // polling in NoticeBell — the count moves the instant the push lands,
      // and costs nothing while nothing is happening.
      notifyOpenClients(),
    ]),
  );
});

async function notifyOpenClients() {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of clients) {
    client.postMessage({ type: "bandhantak:notice-arrived" });
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/user/inbox";

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Focus an existing tab and navigate it rather than piling up windows —
      // a user who taps three notifications should end on one tab, not three.
      for (const client of clients) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) {
            try {
              await client.navigate(url);
            } catch {
              /* cross-origin or unsupported — the focus alone is still useful */
            }
          }
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
