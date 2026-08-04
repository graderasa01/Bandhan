/**
 * Tells the header bell that the unread count moved.
 *
 * The bell lives in `UserShell` and the list lives inside the page, so they
 * have no common ancestor to hold state in. A `router.refresh()` re-renders
 * the server components but not the bell's own fetch, which keys off the
 * pathname — so marking notices read on `/user/inbox` left a stale badge sitting
 * there until the next navigation.
 *
 * A window event is the smallest fix that works. A context provider would mean
 * wrapping every authenticated page to keep one number in sync, and polling
 * would mean a request every few seconds for a value that changes rarely.
 */
export const NOTICE_COUNT_CHANGED = "bandhantak:notice-count-changed";

export function emitNoticeCountChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(NOTICE_COUNT_CHANGED));
}
