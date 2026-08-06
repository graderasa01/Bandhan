"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import GrioChatCore from "@/components/grio/GrioChatCore";
import GrioAvatar from "@/components/grio/_shared/GrioAvatar";

/**
 * Standalone full-page entry (bookmarkable deep link). The everyday entry
 * point is the global bubble/overlay (components/grio/GrioOverlay) — both
 * share the same GrioChatCore engine, just different chrome around it.
 *
 * This header mirrors GrioOverlay's (avatar + name), swapping its close
 * button for a back link since a full page needs a way out that an overlay
 * doesn't. It also mirrors MessageThreadHeader's back-button pattern, so a
 * chat page looks like a chat page everywhere in this app, not just here.
 *
 * The old version of this page put "Grio" and a paragraph of guidance text
 * in a page header *above* a boxed chat widget — article chrome around a
 * chat, not a chat screen. That combined with a manually guessed height
 * (`h-[calc(100dvh-56px)]`) that didn't account for UserShell's padding or
 * mobile bottom-nav, so the composer scrolled off with the page instead of
 * staying pinned. Both are fixed the same way: stop treating this as a card
 * on a page and let it be the page, the way the 1-1 message thread already
 * is (see app/user/messages/[matchId]/page.tsx) — `fullBleed` on `UserShell`
 * hands this component a hard `h-[100dvh] overflow-hidden` box, and
 * `GrioChatCore`'s own `flex-1 min-h-0` fills exactly what's left below the
 * header, so only the message list scrolls.
 */
export default function ConciergeChat() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-line px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] sm:px-6">
        <Link
          href="/user/dashboard"
          aria-label="Back to Dashboard"
          className="grid size-9 shrink-0 touch-target place-items-center rounded-full text-muted transition-colors hover:bg-bg-subtle hover:text-ink"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <GrioAvatar size={9} />
        <div className="min-w-0 flex-1">
          <p className="font-[family-name:var(--font-display)] font-semibold leading-tight text-ink">Grio</p>
          <p className="truncate text-[0.75rem] text-muted">General guidance — kisi ek profile ke faisle ke liye nahi</p>
        </div>
      </div>

      {/* `standalone` — this page has no open/closed state for the deck to
          wait on; being rendered here means the user is looking at it. */}
      <GrioChatCore standalone />
    </div>
  );
}
