import PartnerShell from "@/components/layout/PartnerShell";
import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Loading boundary for all of `/partner/*` — see `app/user/loading.tsx` for
 * why every route group needs one.
 */
export default function PartnerLoading() {
  return (
    <PartnerShell>
      <div className="space-y-6">
        <Skeleton className="h-7 w-52" />
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-md border border-line bg-surface p-5">
              <Skeleton className="h-8 w-16" />
              <Skeleton className="mt-3 h-3.5 w-24" />
            </div>
          ))}
        </div>
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      </div>
    </PartnerShell>
  );
}
