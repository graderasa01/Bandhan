import AdminShell from "@/components/layout/AdminShell";
import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Loading boundary for all of `/admin/*`. Same reasoning as the member app's
 * (`app/user/loading.tsx`): without one, a pending navigation leaves the
 * previous screen frozen with no sign it registered the click.
 *
 * It matters more here than it looks. Admin pages run the widest queries in
 * the app — overview counts, payout ledgers, marketing rollups — so they are
 * the slowest to answer, and an operator with no feedback re-clicks a row
 * that is already loading.
 */
export default function AdminLoading() {
  return (
    <AdminShell>
      <div className="space-y-6">
        <Skeleton className="h-7 w-56" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-md border border-line bg-surface p-5">
              <Skeleton className="h-8 w-20" />
              <Skeleton className="mt-3 h-3.5 w-28" />
            </div>
          ))}
        </div>
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    </AdminShell>
  );
}
