"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Heart, Home, MessageCircle, Sparkles, UserRound } from "lucide-react";
import Card from "@/components/ui/Card";
import AmbientBackground from "@/components/theme/AmbientBackground";
import { PHOTO_GLASS, roomPhotoVars, type RoomConfig } from "@/lib/theme/rooms";

/** A phone, in CSS pixels — the preview lays out at this size and is scaled down to fit. */
const PHONE_W = 390;
const PHONE_H = 844;
const SCALE = 0.62;

const PHOTO_VARS = ["--room-photo", "--room-backdrop", "--room-photo-color", "--room-dim", "--room-focus"];

/**
 * A phone-sized member screen standing in one room, with the admin's unsaved
 * photo, dim and crop applied — so "Save" is never a guess.
 *
 * ## Why an iframe
 *
 * The page this sits on is itself in a room: whatever the admin's own theme
 * button says. Every glass token is scoped to `data-glass` on <html>, and a
 * Classic admin's page would repaint a Satin preview in paper — no wrapper
 * class can out-rank `:root[...]`. An iframe has an <html> of its own. The
 * app's stylesheets are copied into it, the room's attributes are set on its
 * root exactly as the root layout sets them on the real one, and the screen
 * inside is real components (`AmbientBackground`, `Card`, the glass classes)
 * rendered through a portal. So the preview is the product, not a drawing of
 * it: if the material changes in globals.css, the preview changes with it.
 *
 * Nothing in it is interactive; the portal is only for markup.
 */
export default function RoomPreview({ room }: { room: RoomConfig }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [body, setBody] = useState<HTMLElement | null>(null);

  function onLoad() {
    const doc = frame.current?.contentDocument;
    if (!doc) return;
    // The app's CSS, as this page loaded it — in dev that includes the
    // stylesheets HMR injected, so a CSS edit shows up on the next open.
    const sheets = Array.from(document.querySelectorAll('link[rel="stylesheet"], style')).map((node) =>
      node.cloneNode(true),
    );
    doc.head.replaceChildren(...sheets);
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
    const html = frame.current?.contentDocument?.documentElement;
    if (!html || !body) return;
    const photo = room.photo;
    // The same four attributes the root layout writes — see app/layout.tsx.
    html.setAttribute("data-room", room.id);
    html.setAttribute("data-glass", photo ? PHOTO_GLASS : room.id);
    html.toggleAttribute("data-photo", Boolean(photo));
    html.classList.toggle("dark", room.id !== "paper");
    for (const name of PHOTO_VARS) html.style.removeProperty(name);
    if (photo) {
      for (const [name, value] of Object.entries(roomPhotoVars(photo, room))) html.style.setProperty(name, value);
    }
  }, [room, body]);

  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-[26px] border border-line-strong bg-black shadow-lg"
      style={{ width: PHONE_W * SCALE, height: PHONE_H * SCALE }}
    >
      <iframe
        ref={frame}
        title="Theme preview"
        aria-hidden
        tabIndex={-1}
        srcDoc='<!doctype html><html><head></head><body class="min-h-dvh bg-bg text-ink antialiased"></body></html>'
        onLoad={onLoad}
        className="pointer-events-none block border-0"
        style={{ width: PHONE_W, height: PHONE_H, transform: `scale(${SCALE})`, transformOrigin: "0 0" }}
      />
      {body && createPortal(<PreviewScreen />, body)}
    </div>
  );
}

/**
 * A member's screen in miniature: the shell a signed-in page stands in
 * (`UserShell` — `bt-glass`, the canvas island, the `soft` room weight), a
 * glass card of the `/bolo` kind with a gold label, chips and the one filled
 * action, one of the app's everyday `Card`s, a paragraph of body text and the
 * glass bottom bar — the things a photo has to leave readable.
 */
function PreviewScreen() {
  return (
    <div className="bt-glass dark isolate bt-canvas bt-canvas--dense bt-paper min-h-dvh">
      <AmbientBackground variant="soft" />
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between bg-transparent px-4">
        <span className="font-display text-xl font-bold text-ink">BandhanTak</span>
        <span className="grid size-10 place-items-center rounded-full border border-line bg-surface text-muted">
          <Sparkles className="size-[18px]" />
        </span>
      </header>

      <main className="flex flex-col gap-3 px-4 pb-28 pt-2">
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
      </main>

      <nav className="glass-surface glass-nav fixed inset-x-3 bottom-3 flex h-16 items-center justify-around text-muted">
        <Home className="size-5 text-ink" />
        <Heart className="size-5" />
        <MessageCircle className="size-5" />
        <UserRound className="size-5" />
      </nav>
    </div>
  );
}
