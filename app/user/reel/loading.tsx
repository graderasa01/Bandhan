import UserShell from "@/components/layout/UserShell";

/**
 * The reel gets its own boundary because its silhouette is nothing like the
 * rest of `/user/*`: one photo filling the screen edge to edge, not a column
 * of cards. Falling through to `app/user/loading.tsx` would flash a list
 * layout for the length of a round trip and then replace it with a full-bleed
 * photo — a worse frame than showing nothing at all.
 *
 * Deliberately no shimmer bars: at this size a grid of grey blocks reads as a
 * broken image rather than a loading one. A single dim panel the shape of the
 * card is the honest placeholder — it says "a photo goes here" without
 * pretending to be one.
 */
export default function ReelLoading() {
  return (
    <UserShell fullBleed>
      <div className="relative flex h-full min-h-[70vh] w-full items-center justify-center overflow-hidden bg-bg-subtle">
        <div className="skeleton absolute inset-0" aria-hidden />
        {/* The chrome the real card floats above, held in place so the
            controls do not jump when the photo lands under them. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 space-y-3 p-6">
          <div className="skeleton h-6 w-40 rounded-full" aria-hidden />
          <div className="skeleton h-4 w-56 rounded-full" aria-hidden />
        </div>
      </div>
    </UserShell>
  );
}
