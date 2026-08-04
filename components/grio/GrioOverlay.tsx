"use client";

import { Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGrio } from "./GrioProvider";
import GrioChatCore from "./GrioChatCore";

/**
 * Full-screen on mobile (ChatGPT-app style — scrollable messages, one sticky
 * input, no app bottom-nav underneath since this sits above it), a floating
 * panel on larger screens. Stays mounted (just slid off-screen) rather than
 * unmounting on close, so GrioChatCore's in-flight conversation survives
 * opening/closing, not just page navigation.
 */
export default function GrioOverlay() {
  const { isOpen, close } = useGrio();

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex flex-col bg-surface transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
        "sm:inset-auto sm:bottom-6 sm:right-6 sm:h-[min(680px,80vh)] sm:w-[420px] sm:rounded-xl sm:border sm:border-line sm:shadow-2xl",
        isOpen ? "translate-y-0" : "pointer-events-none translate-y-full",
      )}
      aria-hidden={!isOpen}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-3 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] sm:pt-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-gold-400 to-gold-600 text-primary-fg">
          <Sparkles className="size-4" aria-hidden />
        </span>
        <p className="font-[family-name:var(--font-display)] font-semibold text-ink">Grio</p>
        <button
          type="button"
          onClick={close}
          aria-label="Band karein"
          className="ml-auto grid size-9 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-bg-subtle hover:text-ink"
        >
          <X className="size-5" />
        </button>
      </div>

      <GrioChatCore />
    </div>
  );
}
