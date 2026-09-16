"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavCounts } from "@/lib/nav/useNavCounts";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * Unread notice count in the app header.
 *
 * The fetching, and the reasoning behind refetching on navigation instead of
 * polling, now lives in `useNavCounts` — the nav hub and the More button's dot
 * want the same numbers on the same screen, and three components each running
 * their own timer-free fetch was still three requests per navigation.
 */
export default function NoticeBell({
  className,
  onDeep = false,
}: {
  className?: string;
  /**
   * Rendered over a photograph rather than on the app's cream surface — the
   * reel's floating header. The icon flips to white and the unread badge to a
   * colour that survives a dark ground: wine-700 is nearly black and simply
   * disappeared there, which is the one thing an unread count must not do.
   */
  onDeep?: boolean;
}) {
  const count = useNavCounts().inbox;
  const t = useT();

  return (
    <Link
      href="/user/inbox"
      aria-label={
        count > 0
          ? `${t("notice.bell.inboxWithCountPre", "Inbox — ")}${count}${t("notice.bell.inboxWithCountPost", " new")}`
          : t("notice.bell.inbox", "Inbox")
      }
      className={cn(
        "relative grid size-12 place-items-center rounded-full transition-colors",
        onDeep
          ? "text-white drop-shadow-[0_1px_4px_rgb(0_0_0_/_0.45)] hover:bg-white/15"
          : "text-muted hover:bg-bg-subtle hover:text-ink",
        className,
      )}
    >
      <Bell className="size-5" />
      {count > 0 && (
        <span
          className={cn(
            "absolute right-1.5 top-1.5 grid min-w-4 place-items-center rounded-full px-1 text-[0.625rem] font-semibold leading-4 text-white",
            onDeep ? "bg-rose-500 ring-2 ring-black/25" : "bg-wine-700",
          )}
          aria-hidden
        >
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}
