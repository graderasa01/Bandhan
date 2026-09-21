import UserShell from "@/components/layout/UserShell";
import { Skeleton } from "@/components/ui/Skeleton";

/**
 * The one loading boundary every `/user/*` page inherits.
 *
 * Without a `loading.tsx` Next.js has nowhere to put a pending navigation, so
 * clicking a link leaves the *previous* page frozen on screen — no spinner, no
 * movement — until the server has finished rendering the next one. Every
 * round trip to the database happens inside that silence, which is why the app
 * read as "the button didn't work" and got clicked twice.
 *
 * This file is also what makes `<Link>` prefetching worth anything here. These
 * pages are all dynamic (they read the session cookie), so Next.js will never
 * prefetch their content — but it *does* prefetch the nearest loading
 * boundary. With this file present that shell is already sitting in the
 * router cache when the finger lands, so the skeleton paints on the same frame
 * as the tap and the real content streams in behind it.
 *
 * It renders `UserShell` rather than a bare skeleton on purpose: the shell is
 * re-rendered by each page individually (see `app/user/layout.tsx`), so a
 * boundary without it would blink the header and the bottom nav out of
 * existence on every navigation and put them back a moment later. The chrome
 * has to stay still for the swap to read as one screen changing rather than
 * two screens fighting.
 */
export default function UserLoading() {
  return (
    <UserShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>

        <div className="space-y-3">
          {/* Three is enough to fill a phone without the skeleton itself
              becoming the slow part — below the fold nobody is waiting. */}
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-lg border border-line bg-surface p-5">
              <div className="flex items-center gap-4">
                <Skeleton className="size-12 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </UserShell>
  );
}
