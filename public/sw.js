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
