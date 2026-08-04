"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { NOTICE_COUNT_CHANGED } from "@/lib/notices/events";

/**
 * Unread count in the app header.
 *
 * Refetches on navigation rather than on a timer. A poll would mean a request
 * every N seconds for every open tab to change a number that only moves when
 * someone else acts — and the moment a user actually cares about the count is
 * when they arrive somewhere, which is exactly when a route change fires.
 *
 * The one case navigation misses is reading notices *without* leaving the
 * inbox, which is the most common thing a user does there. `NOTICE_COUNT_CHANGED`
 * covers it — see lib/notices/events.ts.
 */
export default function NoticeBell({ className }: { className?: string }) {
  const pathname = usePathname();
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    function load() {
      fetch("/api/notices?countOnly=1")
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!cancelled && data?.ok) setCount(Number(data.unreadCount) || 0);
        })
        .catch(() => {});
    }

    load();
    window.addEventListener(NOTICE_COUNT_CHANGED, load);
    return () => {
      cancelled = true;
      window.removeEventListener(NOTICE_COUNT_CHANGED, load);
    };
  }, [pathname]);

  return (
    <Link
      href="/user/inbox"
      aria-label={count > 0 ? `Inbox — ${count} new` : "Inbox"}
      className={cn(
        "relative grid size-12 place-items-center rounded-full text-muted transition-colors hover:bg-bg-subtle hover:text-ink",
        className,
      )}
    >
      <Bell className="size-5" />
      {count > 0 && (
        <span
          className="absolute right-1.5 top-1.5 grid min-w-4 place-items-center rounded-full bg-wine-700 px-1 text-[0.625rem] font-semibold leading-4 text-white"
          aria-hidden
        >
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}
