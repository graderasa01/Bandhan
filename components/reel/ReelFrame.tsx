"use client";

import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * The reel's viewport.
 *
 * **Mobile is untouched by design** — it renders exactly the full-screen
 * column it always did. This component exists for the desktop half, which was
 * the broken one.
 *
 * ## What was wrong on desktop
 *
 * The reel is a `fullBleed` screen (AppShell drops header, sidebar and bottom
 * nav), and inside that its content column is capped at `max-w-md` — 448px.
 * On a phone that cap never binds and the layout is right. On a 1440×900
 * desktop the same markup produced a 448px-wide strip in the middle of a
 * 1440px window with ~760px of vertical space to fill: a tall, narrow,
 * half-empty card floating in black, with no app chrome around it either.
 *
 * ## The fix
 *
 * Stop letting desktop lay the reel out by *width*. Here the height is the
 * definite dimension — capped viewport height — and the width falls out of a
 * 9:16 aspect ratio, so the desktop reel is a phone-shaped screen showing the
 * mobile layout at mobile proportions, the way YouTube Shorts does it.
 *
 * `md:w-auto` + `md:aspect-[9/16]` is the whole trick: with a definite height
 * and `width: auto`, the aspect ratio resolves the width. Do not add a
 * `max-w-*` here — that is the cap this exists to remove.
 *
 * Every `md:` class is desktop-only on purpose. Below that breakpoint this is
 * a plain `h-full w-full` passthrough and the mobile view is byte-for-byte
 * what it was.
 */
export default function ReelFrame({
  backdropUrl,
  children,
}: {
  /** Current card's photo, blurred behind the frame on desktop. Null keeps a plain dark backdrop. */
  backdropUrl?: string | null;
  children: React.ReactNode;
}) {
  const t = useT();
  return (
    // Warm ivory, not near-black. The ground around the phone used to be
    // `sand-900`, which put a 1440px slab of almost-black behind a matrimony
    // product whose whole palette is cream and maroon — and on mobile the
    // frame covers it anyway, so the dark was only ever seen on desktop, where
    // it looked least like BandhanTak.
    <div className="relative grid h-full w-full place-items-center overflow-hidden bg-bg">
      {backdropUrl && (
        // Decorative only — a plain CSS background rather than next/image so it
        // needs no loader config and can never be announced or focused. Never
        // rendered on mobile, where the frame fills the screen anyway.
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 hidden scale-110 bg-cover bg-center opacity-20 blur-3xl md:block"
          style={{ backgroundImage: `url(${JSON.stringify(backdropUrl)})` }}
        />
      )}
      {/* A soft gold wash so the spare desktop width is a ground rather than a
          blank — the same `grad-hero` token a theme pack already owns. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 hidden bg-grad-hero opacity-60 md:block" />

      {/* Only shows where there is genuinely spare width beside the frame. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-10 top-1/2 hidden -translate-y-1/2 flex-col gap-1.5 text-[0.8125rem] text-muted xl:flex"
      >
        <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-subtle">
          {t("reel.frame.keyboardLabel", "Keyboard")}
        </span>
        <span>{t("reel.frame.keyNotNow", "← Not now")}</span>
        <span>{t("reel.frame.keyInterest", "→ Interest")}</span>
        <span>{t("reel.frame.keyShortlist", "↓ Shortlist")}</span>
        <span>{t("reel.frame.keyAskGrio", "↑ Ask Grio")}</span>
        {/* The one key here that decides nothing — it walks back to the card
            before, which is why it is also the only one that works inside a
            Meri List lane. */}
        <span>{t("reel.frame.keyBack", "⌫ Back")}</span>
      </div>

      <div
        className={cn(
          "relative z-10 h-full w-full overflow-hidden bg-bg",
          // Desktop: a phone. Height first, width derived from it. Raised from
          // 880px/2.5rem margin (Devesh, 2026-08-08): the shorter frame plus
          // mobile-tuned type/padding inside it meant the AI insight panel sat
          // below the fold on most monitors. A taller frame is half the fix —
          // see ReelCard/ReelInsightPanel/ReelActionBar for the other half
          // (denser desktop-only sizing), since a taller frame alone doesn't
          // help if the content inside doesn't get any more compact.
          "md:h-[min(100dvh-1.5rem,960px)] md:w-auto md:aspect-[9/16] md:rounded-3xl md:shadow-2xl md:ring-1 md:ring-white/15",
        )}
      >
        {children}
      </div>
    </div>
  );
}
