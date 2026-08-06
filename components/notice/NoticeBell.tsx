"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavCounts } from "@/lib/nav/useNavCounts";

/**
 * Unread notice count in the app header.
 *
 * The fetching, and the reasoning behind refetching on navigation instead of
 * polling, now lives in `useNavCounts` — the nav hub and the More button's dot
 * want the same numbers on the same screen, and three components each running
 * their own timer-free fetch was still three requests per navigation.
 */
export default function NoticeBell({ className }: { className?: string }) {
  const count = useNavCounts().inbox;

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
