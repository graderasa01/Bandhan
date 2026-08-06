"use client";

import { useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Button from "@/components/ui/Button";
import { cn } from "@/lib/utils";

/**
 * Chip filters + pagination, driven entirely by the URL.
 *
 * URL state rather than component state on purpose: an admin who filters to
 * FAILED payments and pastes the link into a message should be handing over the
 * same screen, and refreshing after acting on a row should not reset the view.
 * It also keeps the pages themselves server components — the filter is a query
 * param the server already reads.
 */
export function FilterChips({
  param,
  options,
  allLabel = "Sab",
}: {
  param: string;
  options: { value: string; label: string }[];
  allLabel?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const active = searchParams.get(param);

  function select(value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === null) params.delete(param);
    else params.set(param, value);
    // Changing the filter invalidates the page number — page 4 of a one-page
    // result set is a blank screen.
    params.delete("page");
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  return (
    <div className={cn("flex flex-wrap gap-1.5", isPending && "opacity-60")}>
      {[{ value: "", label: allLabel }, ...options].map((opt) => {
        const isActive = opt.value === "" ? !active : active === opt.value;
        return (
          <button
            key={opt.value || "__all"}
            type="button"
            onClick={() => select(opt.value || null)}
            aria-pressed={isActive}
            className={
              isActive
                ? "min-h-9 rounded-full bg-gradient-to-r from-gold-400 to-gold-600 px-3 text-xs font-semibold text-primary-fg shadow-gold"
                : "min-h-9 rounded-full border border-line px-3 text-xs font-medium text-muted transition-colors hover:bg-bg-subtle hover:text-ink"
            }
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function Pager({ page, total, pageSize }: { page: number; total: number; pageSize: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (totalPages <= 1) return null;

  function go(next: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(next));
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="mt-4 flex items-center justify-center gap-3">
      <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => go(page - 1)}>
        Previous
      </Button>
      <span className="text-sm text-muted">
        {page} / {totalPages}
      </span>
      <Button size="sm" variant="secondary" disabled={page >= totalPages} onClick={() => go(page + 1)}>
        Next
      </Button>
    </div>
  );
}
