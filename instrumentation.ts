/**
 * Next's boot hook — runs once per server start, before the first request.
 *
 * One job today: shout if the object store is missing in production. That check
 * has to happen at boot rather than at first upload, because the failure it
 * describes is invisible at upload time — the write succeeds, the photo
 * displays, and the loss only lands at the next deploy when the container's
 * filesystem goes with it. See `objectStore.ts` for why it warns instead of
 * refusing to start.
 */
export async function register() {
  // `nodejs` only — the Edge runtime has no filesystem to warn about and does
  // not carry these variables anyway.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { assertObjectStoreInProduction } = await import("@/lib/services/storage/objectStore");
  assertObjectStoreInProduction();
}
