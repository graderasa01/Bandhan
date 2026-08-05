"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";
import { haptic } from "@/lib/motion";
import { useGrio } from "./GrioProvider";

/** The one page that already *is* Grio, full-screen — a floating "open Grio" trigger on top of it would sit on its own composer. */
const HIDDEN_ON = "/user/concierge";

const SIZE = 56;
const MARGIN = 12;
const DEFAULT_BOTTOM_CLEARANCE = 84; // clears the 60px mobile bottom-nav + breathing room
const STORAGE_KEY = "grio-bubble-pos";
const HINT_SEEN_KEY = "grio-bubble-hint-seen";
const HINT_DURATION_MS = 6000;
const DRAG_THRESHOLD = 5;

function clamp(x: number, y: number) {
  const maxX = window.innerWidth - SIZE - MARGIN;
  const maxY = window.innerHeight - SIZE - MARGIN;
  return { x: Math.min(Math.max(MARGIN, x), Math.max(MARGIN, maxX)), y: Math.min(Math.max(MARGIN, y), Math.max(MARGIN, maxY)) };
}

/** Draggable, edge-snapping floating icon — mounted once above every /user/* page, like a chat-head. */
export default function GrioBubble() {
  const { isOpen, open } = useGrio();
  const pathname = usePathname();
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [showHint, setShowHint] = useState(false);
  const dragging = useRef(false);
  const moved = useRef(false);
  const start = useRef({ x: 0, y: 0, px: 0, py: 0 });

  function dismissHint() {
    setShowHint(false);
    window.localStorage.setItem(HINT_SEEN_KEY, "1");
  }

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as { x: number; y: number };
        setPos(clamp(parsed.x, parsed.y));
        return;
      } catch {
        // fall through to default
      }
    }
    setPos({ x: window.innerWidth - SIZE - MARGIN, y: window.innerHeight - SIZE - DEFAULT_BOTTOM_CLEARANCE });
  }, []);

  useEffect(() => {
    if (window.localStorage.getItem(HINT_SEEN_KEY)) return;
    const showTimer = setTimeout(() => setShowHint(true), 800);
    const hideTimer = setTimeout(dismissHint, 800 + HINT_DURATION_MS);
    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, []);

  useEffect(() => {
    function onResize() {
      setPos((p) => (p ? clamp(p.x, p.y) : p));
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  function onPointerDown(e: ReactPointerEvent<HTMLButtonElement>) {
    if (showHint) dismissHint();
    dragging.current = true;
    moved.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = { x: pos?.x ?? 0, y: pos?.y ?? 0, px: e.clientX, py: e.clientY };
  }

  function onPointerMove(e: ReactPointerEvent<HTMLButtonElement>) {
    if (!dragging.current) return;
    const dx = e.clientX - start.current.px;
    const dy = e.clientY - start.current.py;
    if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) moved.current = true;
    setPos(clamp(start.current.x + dx, start.current.y + dy));
  }

  function onPointerUp() {
    if (!dragging.current) return;
    dragging.current = false;

    if (!moved.current) {
      haptic("tap");
      open();
      return;
    }

    setPos((p) => {
      if (!p) return p;
      const snappedX = p.x + SIZE / 2 < window.innerWidth / 2 ? MARGIN : window.innerWidth - SIZE - MARGIN;
      const next = clamp(snappedX, p.y);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  if (isOpen || !pos || pathname === HIDDEN_ON) return null;

  const hintWidth = 190;
  const hintLeft = Math.min(Math.max(8, pos.x - 65), window.innerWidth - hintWidth - 8);
  const hintTop = Math.max(8, pos.y - 56);

  return (
    <>
      {showHint && (
        <div
          role="status"
          style={{ left: hintLeft, top: hintTop, width: hintWidth }}
          className="fixed z-[46] rounded-lg bg-surface-inverse px-3 py-2 text-[0.75rem] leading-snug text-inverse shadow-lg"
        >
          Yahan se Grio se kabhi bhi baat kar sakte ho — drag bhi kar sakte ho
        </div>
      )}

      <button
        type="button"
        aria-label="Grio kholein"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ left: pos.x, top: pos.y }}
        className="fixed z-[45] grid size-14 touch-none place-items-center rounded-full bg-gradient-to-br from-gold-400 to-gold-600 text-primary-fg shadow-gold transition-transform active:scale-95"
      >
        <Sparkles className="size-6" aria-hidden />
      </button>
    </>
  );
}
