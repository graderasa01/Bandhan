"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bell, Heart, Home, MessageCircle, Search, Sparkles, UserRound } from "lucide-react";
import Card from "@/components/ui/Card";
import AmbientBackground from "@/components/theme/AmbientBackground";
import { cn } from "@/lib/utils";
import type { GlassDevice } from "@/lib/theme/glass";
import { PHOTO_GLASS, hasPhoto, themeRoomCss, type RoomConfig } from "@/lib/theme/rooms";

/**
 * The screen each device previews at, in CSS pixels. The iframe is laid out
 * at exactly this size and scaled down to fit, so its own media queries see a
 * phone or a laptop — the desktop photo and the desktop glass switch on at
 * the same width they do for a member.
 */
const SCREEN: Record<GlassDevice, { w: number; h: number; maxScale: number }> = {
  mobile: { w: 390, h: 844, maxScale: 0.62 },
  desktop: { w: 1280, h: 800, maxScale: 0.56 },
};

/**
 * A member's screen standing in one room, with the admin's unsaved photos and
 * glass applied — so "Save" is never a guess.
 *
 * ## Why an iframe
 *
 * The page this sits on is itself in a room: whatever the admin's own theme
 * button says. Every glass token is scoped to `data-glass` on <html>, and a
 * Classic admin's page would repaint a Satin preview in paper — no wrapper
 * class can out-rank `:root[...]`. An iframe has an <html> of its own, and a
 * viewport of its own, which is what lets one preview be a phone and the next
 * a desktop.
 *
 * The app's stylesheets are copied into it — all but the live room rules
 * (`#bt-room-photos`), which would show the SAVED room — and the draft room's
 * rules are written in their place by `themeRoomCss`, the same function the
 * root layout uses. So the preview runs the real media query, the real
 * resolver and the real material: if the glass changes in globals.css, the
 * preview changes with it. The screen inside is real components
 * (`AmbientBackground`, `Card`, the glass classes, the shell's own sidebar and
 * bottom bar) rendered through a portal. Nothing in it is interactive.
 */
export default function RoomPreview({ room, device }: { room: RoomConfig; device: GlassDevice }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [body, setBody] = useState<HTMLElement | null>(null);
  const [boxWidth, setBoxWidth] = useState(0);
  const screen = SCREEN[device];
  const scale = boxWidth > 0 ? Math.min(screen.maxScale, boxWidth / screen.w) : screen.maxScale * 0.8;

  function onLoad() {
    const doc = frame.current?.contentDocument;
    if (!doc) return;
    // The app's CSS, as this page loaded it — in dev that includes the
    // stylesheets HMR injected, so a CSS edit shows up on the next open.
    const sheets = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
      .filter((node) => node.id !== "bt-room-photos")
      .map((node) => node.cloneNode(true));
    const draft = doc.createElement("style");
    draft.id = "bt-room-draft";
    doc.head.replaceChildren(...sheets, draft);
    // The font variables (`--font-inter` & co) ride on <html>'s class list.
    doc.documentElement.className = document.documentElement.className;
    setBody(doc.body);
  }

  // The iframe is server-rendered, so its `load` can fire before hydration
  // attaches `onLoad`. Catch that case — but only once the srcdoc document is
  // in: until then `contentDocument` is the throwaway about:blank it replaces.
  useEffect(() => {
    const doc = frame.current?.contentDocument;
    if (doc?.URL === "about:srcdoc" && doc.readyState === "complete") onLoad();
  }, []);

  useEffect(() => {
    const node = box.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setBoxWidth(entry.contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const doc = frame.current?.contentDocument;
    const html = doc?.documentElement;
    if (!doc || !html || !body) return;
    const photo = hasPhoto(room);
    // The attributes the root layout writes — see app/layout.tsx.
    html.setAttribute("data-room", room.id);
    html.setAttribute("data-glass", photo ? PHOTO_GLASS : room.id);
    html.toggleAttribute("data-photo", photo);
    html.classList.toggle("dark", room.id !== "paper");
    const draft = doc.getElementById("bt-room-draft");
    if (draft) draft.textContent = themeRoomCss(room);
  }, [room, body]);

  return (
    <div ref={box} className="w-full">
      <div
        className={cn(
          "relative mx-auto overflow-hidden border border-line-strong bg-black shadow-lg",
          device === "mobile" ? "rounded-[26px]" : "rounded-xl",
        )}
        style={{ width: screen.w * scale, height: screen.h * scale }}
      >
        <iframe
          ref={frame}
          title={device === "mobile" ? "Mobile theme preview" : "Desktop theme preview"}
          aria-hidden
          tabIndex={-1}
          srcDoc='<!doctype html><html><head></head><body class="min-h-dvh bg-bg text-ink antialiased"></body></html>'
          onLoad={onLoad}
          className="pointer-events-none block border-0"
          style={{ width: screen.w, height: screen.h, transform: `scale(${scale})`, transformOrigin: "0 0" }}
        />
        {body && createPortal(<PreviewScreen />, body)}
      </div>
    </div>
  );
}

const NAV = [
  { icon: Home, label: "Home" },
  { icon: Heart, label: "Rishte" },
  { icon: MessageCircle, label: "Messages" },
  { icon: Bell, label: "Updates" },
  { icon: UserRound, label: "Profile" },
];

/**
 * A member's screen in miniature, laid out the way the app's own shell is: on
 * a phone a column of cards over the bottom bar, on a desktop the sidebar and
 * a grid. `md:` inside the iframe answers to the iframe's width, so one markup
 * is both. It carries the things a photo has to leave readable — a glass card
 * with a gold label, chips and the one filled action, an everyday `Card`, a
 * paragraph of body text — and every surface the glass knobs reach.
 */
function PreviewScreen() {
  return (
    <div className="bt-glass dark isolate bt-canvas bt-canvas--dense bt-paper flex min-h-dvh flex-col">
      <AmbientBackground variant="soft" />
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between bg-transparent px-4 md:h-16 md:px-8">
        <span className="font-display text-xl font-bold text-ink">BandhanTak</span>
        <span className="flex items-center gap-2">
          <span className="hidden h-10 w-64 items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm text-muted md:flex">
            <Search className="size-4" /> Search
          </span>
          <span className="grid size-10 place-items-center rounded-full border border-line bg-surface text-muted">
            <Sparkles className="size-[18px]" />
          </span>
        </span>
      </header>

      <div className="flex flex-1">
        <aside className="bt-side-nav sticky top-0 hidden max-h-screen w-60 shrink-0 flex-col gap-1 overflow-y-auto border-r border-line bg-surface p-3 md:flex">
          {NAV.map(({ icon: Icon, label }, i) => (
            <span
              key={label}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm",
                i === 0 ? "bg-bg-subtle font-semibold text-ink" : "text-muted",
              )}
            >
              <Icon className="size-[18px]" /> {label}
            </span>
          ))}
        </aside>

        <main className="mx-auto grid w-full max-w-6xl flex-1 content-start gap-3 px-4 pb-28 pt-2 md:grid-cols-2 md:gap-5 md:px-8 md:pb-10 md:pt-6 xl:grid-cols-3">
          <section className="glass-surface glass-card p-5">
            <span className="gold-label">Aaj ka rishta</span>
            <h2 className="mt-2 font-display text-[1.7rem] font-bold leading-tight text-ink">Ananya, 27</h2>
            <p className="mt-1 text-sm text-muted">Jaipur · Doctor · Shaakahari</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="glass-surface glass-chip px-3.5 py-1.5 text-sm">Family-first</span>
              <span className="glass-surface glass-chip px-3.5 py-1.5 text-sm">Jaipur</span>
              <span className="glass-surface glass-chip glass-chip--accent px-3.5 py-1.5 text-sm">92% match</span>
            </div>
            <span className="accent-primary mt-4 grid h-11 w-full place-items-center rounded-full text-sm font-semibold">
              Send Interest
            </span>
          </section>

          <Card padding="sm">
            <p className="text-sm font-semibold text-ink">Kisne dekha</p>
            <p className="mt-1 text-sm text-muted">
              Is hafte 12 logon ne aapki profile dekhi — unme se 3 aapke sheher se hain.
            </p>
          </Card>

          <section className="glass-surface glass-card glass-card--soft p-4">
            <p className="text-sm leading-relaxed text-muted">
              Ye body text ka namuna hai. Lamba paragraph isliye, taaki dikhe ki photo ke upar padhna kaisa lagta
              hai — sabse halke hisse par bhi.
            </p>
          </section>

          <section className="glass-surface glass-card hidden p-5 md:block">
            <span className="gold-label">Aapki profile</span>
            <p className="mt-2 text-2xl font-bold text-ink">86% poori</p>
            <p className="mt-1 text-sm text-muted">Do sawaal aur, phir aapki profile sabse upar dikhegi.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="glass-surface glass-chip px-3.5 py-1.5 text-sm">Photos 4/6</span>
              <span className="glass-surface glass-chip px-3.5 py-1.5 text-sm">Kundli</span>
            </div>
          </section>

          <Card padding="sm" className="hidden md:block">
            <p className="text-sm font-semibold text-ink">Naye rishte</p>
            <p className="mt-1 text-sm text-muted">Aapki pasand se milte 5 naye rishte aaj aaye hain.</p>
          </Card>
        </main>
      </div>

      <nav className="bt-bottom-nav fixed inset-x-0 bottom-0 z-40 flex h-[60px] items-center justify-around border-t border-line bg-surface/95 text-muted md:hidden">
        {NAV.map(({ icon: Icon, label }, i) => (
          <Icon key={label} className={cn("size-5", i === 0 && "text-ink")} />
        ))}
      </nav>
    </div>
  );
}
