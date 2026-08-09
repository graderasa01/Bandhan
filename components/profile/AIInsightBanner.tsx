"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion, type PanInfo, type Variants } from "framer-motion";
import { ArrowRight, Bookmark, Eye, Gift, Heart, Lock, Megaphone, MessageCircle, MessageCircleQuestion, Mic, Sparkles } from "lucide-react";
import Avatar from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";
import { spring, haptic } from "@/lib/motion";
import { useT } from "@/components/i18n/LanguageProvider";

export interface ActivityInsightSlide {
  id: string;
  kind: "insight" | "activity";
  icon: "sparkles" | "heart" | "bookmark" | "eye" | "mic" | "message" | "question" | "reward" | "announcement";
  /** Real, server-computed sentence — no client-side fabrication (D-32). */
  text: string;
  /** Pre-formatted relative time ("2 ghante pehle") — computed server-side so it never mismatches at hydration. */
  at?: string;
  href?: string;
  avatar?: { name: string; photoUrl: string | null } | null;
  /** Blurred face + Lock CTA, same treatment as ProfileActivityCard's AdmirerPanel — href always points at /user/subscription. */
  locked?: boolean;
}

const ICONS = {
  sparkles: Sparkles,
  heart: Heart,
  bookmark: Bookmark,
  eye: Eye,
  mic: Mic,
  message: MessageCircle,
  question: MessageCircleQuestion,
  reward: Gift,
  announcement: Megaphone,
} as const;

const DWELL_MS = 4500;
const RESUME_AFTER_MS = 6500;
const DRAG_THRESHOLD = 60;
const VELOCITY_THRESHOLD = 400;
/** Real drag movement, not just a stray pixel of mouse jitter under a tap. */
const CLICK_SUPPRESS_PX = 5;

const slide: Variants = {
  enter: (dir: number) => ({ x: dir >= 0 ? 32 : -32, opacity: 0 }),
  center: { x: 0, opacity: 1, transition: spring.snappy },
  exit: (dir: number) => ({ x: dir >= 0 ? -32 : 32, opacity: 0, transition: spring.snappy }),
};

/**
 * Dynamic AI insight strip for the dashboard — the "personal AI matchmaker"
 * touch. Slide 0 is always the deterministic insight sentence (unchanged from
 * the original single-sentence banner); real activity — recent interests,
 * shortlists, profile views — follows in priority order, one per slide, so
 * the div Devesh pointed at keeps rotating through "what's new for you"
 * instead of showing one static line forever. Locked slides (shortlist/viewer
 * identity the plan doesn't allow) still show up, blurred, so upgrading feels
 * like unlocking something real rather than an abstract sales pitch.
 *
 * Autoplay pauses for RESUME_AFTER_MS after a manual swipe rather than
 * stopping forever — "ruk bhi sake" (can pause) without giving up "chalta
 * rhe" (keeps moving) once the user lets go. Resuming always steps forward
 * (direction 1) from whatever `index` the swipe left it at — `setIndex`'s
 * functional update reads the live index at tick time, so autoplay picks up
 * exactly where the manual swipe stopped instead of jumping back to slide 0.
 */
export default function AIInsightBanner({ slides }: { slides: ActivityInsightSlide[] }) {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  const [paused, setPaused] = useState(false);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A left-click-and-drag ends with the browser firing a native `click` on
  // the anchor underneath, same as any mouseup — Framer's drag gesture
  // doesn't own that event, so without this the Link would navigate right
  // after the swipe instead of letting the swipe change the slide. Set the
  // instant a real drag is measured, consumed (and cleared) by the very next
  // click; the timeout is just a safety net in case that click never comes.
  const justDragged = useRef(false);
  const total = slides.length;
  const current = slides[Math.min(index, total - 1)];

  useEffect(() => {
    if (paused || total <= 1) return;
    const t = setInterval(() => {
      setDirection(1);
      setIndex((i) => (i + 1) % total);
    }, DWELL_MS);
    return () => clearInterval(t);
  }, [paused, total]);

  useEffect(() => {
    return () => {
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
    };
  }, []);

  function scheduleResume() {
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => setPaused(false), RESUME_AFTER_MS);
  }

  function goTo(i: number) {
    haptic("tap");
    setDirection(i > index ? 1 : -1);
    setIndex(((i % total) + total) % total);
    setPaused(true);
    scheduleResume();
  }

  // Left swipe (finger drags left, negative offset) → peeche/previous.
  // Right swipe (finger drags right, positive offset) → aage/next.
  function handleDragEnd(_: unknown, info: PanInfo) {
    if (Math.abs(info.offset.x) > CLICK_SUPPRESS_PX || Math.abs(info.offset.y) > CLICK_SUPPRESS_PX) {
      justDragged.current = true;
      setTimeout(() => {
        justDragged.current = false;
      }, 300);
    }

    if (info.offset.x < -DRAG_THRESHOLD || info.velocity.x < -VELOCITY_THRESHOLD) {
      goTo(index - 1);
    } else if (info.offset.x > DRAG_THRESHOLD || info.velocity.x > VELOCITY_THRESHOLD) {
      goTo(index + 1);
    } else {
      setPaused(true);
      scheduleResume();
    }
  }

  /** Swallows the click a mouse (not touch) drag leaves behind, so a swipe never doubles as a navigation. */
  function handleLinkClick(e: MouseEvent) {
    if (justDragged.current) {
      e.preventDefault();
      justDragged.current = false;
    }
  }

  const Icon = ICONS[current.icon];

  return (
    <div className="relative mb-6">
      <div className="relative overflow-hidden">
        <AnimatePresence initial={false} custom={direction} mode="popLayout">
          <motion.div
            key={current.id}
            custom={direction}
            variants={reduced ? undefined : slide}
            initial={reduced ? false : "enter"}
            animate={reduced ? undefined : "center"}
            exit={reduced ? undefined : "exit"}
            drag={total > 1 && !reduced ? "x" : false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.6}
            onDragStart={() => setPaused(true)}
            onDragEnd={handleDragEnd}
            // Without this, a real touchscreen's native pan gesture can claim
            // the swipe before Framer's own pointer listeners see it — see
            // the same fix + longer explanation in ManualCard.tsx.
            className={total > 1 && !reduced ? "touch-none" : undefined}
          >
            {current.href ? (
              <Link
                href={current.href}
                onClick={handleLinkClick}
                className={cn(
                  "glass relative flex items-center gap-3 overflow-hidden rounded-lg px-4 py-3 shadow-sm",
                  // An admin-written offer has to look different from the
                  // generated activity it sits above, or it reads as one more
                  // auto-message and gets swiped past.
                  current.icon === "announcement" && "ring-2 ring-gold-400/70 shadow-gold",
                )}
              >
                <SlideBody current={current} Icon={Icon} />
              </Link>
            ) : (
              <div className="glass relative flex items-center gap-3 overflow-hidden rounded-lg px-4 py-3 shadow-sm">
                <SlideBody current={current} Icon={Icon} />
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function SlideBody({
  current,
  Icon,
}: {
  current: ActivityInsightSlide;
  Icon: (typeof ICONS)[keyof typeof ICONS];
}) {
  const t = useT();
  return (
    <>
      <span aria-hidden className="absolute -left-6 -top-6 size-24 rounded-full bg-gold-400/20 blur-2xl" />

      {current.locked ? (
        <span aria-hidden className="relative flex shrink-0 -space-x-2.5">
          {[0, 1].map((i) => (
            <span
              key={i}
              className="size-8 rounded-full border-2 border-surface bg-gradient-to-br from-gold-200 to-wine-200 blur-[4px] dark:from-gold-900 dark:to-wine-900"
            />
          ))}
        </span>
      ) : current.avatar ? (
        <Avatar name={current.avatar.name} photoUrl={current.avatar.photoUrl} size="sm" className="relative shrink-0" />
      ) : (
        <span className="relative grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-gold-400 to-gold-600 text-primary-fg shadow-gold">
          <Icon className="size-4" />
        </span>
      )}

      <span className="relative min-w-0 flex-1">
        <p className="text-[0.875rem] leading-snug text-ink">
          {current.kind === "insight" && (
            <span className="font-semibold text-gold-700">{t("profile.aiInsightBanner.prefix", "AI Insight — ")}</span>
          )}
          {current.text}
        </p>
        {current.at && <p className="mt-0.5 text-[0.6875rem] text-subtle">{current.at}</p>}
      </span>

      {current.locked ? (
        <Lock className="relative size-4 shrink-0 text-gold-600" />
      ) : current.href ? (
        <ArrowRight className="relative size-4 shrink-0 text-gold-600" />
      ) : null}
    </>
  );
}
