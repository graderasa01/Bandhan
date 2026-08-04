"use client";

import {
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type PanInfo,
} from "framer-motion";
import { Check, HelpCircle, Lock, Sparkles, Users, X } from "lucide-react";
import ProgressRing from "@/components/ui/ProgressRing";
import ReelTrustStrip from "@/components/reel/ReelTrustStrip";
import ReelInsightPanel from "@/components/reel/ReelInsightPanel";
import KundliNoteList from "@/components/profile/KundliNoteList";
import PhotoSlideDeck from "@/components/profile/PhotoSlideDeck";
import { cn } from "@/lib/utils";
import { spring } from "@/lib/motion";
import type { ReelCardViewModel, ReelSwipeDirection } from "@/lib/contracts/reel";

export interface ReelCardProps {
  card: ReelCardViewModel;
  /** Only the top card of the stack drags — cards behind it just peek. */
  draggable: boolean;
  depth: number;
  onDismiss: (direction: ReelSwipeDirection, meta: { decisionMs: number; wasButton: boolean }) => void;
  /** Phase D — omitted (not just disabled) when Ask Bridge itself is off. */
  onAsk?: () => void;
  /** The owner previewing their own card — `card.compatibility`/`segments` are
   *  meaningless here (there's no one to match against), so the ring shows a
   *  plain "Aap" instead of a fake or misleading number. */
  selfPreview?: boolean;
  /** Set only on a replay pass — the decision already recorded for this card earlier today. */
  previousDecision?: ReelSwipeDirection | null;
}

const PREVIOUS_DECISION_LABEL: Record<ReelSwipeDirection, string> = {
  RIGHT: "Interest bheja",
  LEFT: "Skip kiya",
  DOWN: "Family ko dikhaya",
  UP: "",
};

const DRAG_THRESHOLD = 120;
const VELOCITY_THRESHOLD = 500;
/** Skip stays loose/easy; Interest and AI-ask feel heavier — a real decision, not a flick. */
const DRAG_ELASTIC = { left: 0.75, right: 0.45, top: 0.45, bottom: 0.55 };
const STACK_OPACITY = [1, 1, 0.85, 0.6];

export default function ReelCard({
  card,
  draggable,
  depth,
  onDismiss,
  onAsk,
  selfPreview = false,
  previousDecision = null,
}: ReelCardProps) {
  const reduced = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const mountedAt = useMotionValue(Date.now());

  // §4.4 physics — tilt with drag, direction overlays fade in, ring glows gold
  // as the drag commits toward "interest".
  const rotate = useTransform(x, [-200, 200], [-14, 14]);
  const rightBadgeOpacity = useTransform(x, [40, 140], [0, 1]);
  const leftBadgeOpacity = useTransform(x, [-140, -40], [1, 0]);
  const upBadgeOpacity = useTransform(y, [-140, -40], [1, 0]);
  const downBadgeOpacity = useTransform(y, [40, 140], [0, 1]);
  const ringGlow = useTransform(x, [0, 160], [0, 1]);
  const ringScale = useTransform(x, [0, 160], [1, 1.08]);

  function handleDragEnd(_: unknown, info: PanInfo) {
    const decisionMs = Date.now() - mountedAt.get();
    const { offset, velocity } = info;

    if (offset.x > DRAG_THRESHOLD || velocity.x > VELOCITY_THRESHOLD) {
      onDismiss("RIGHT", { decisionMs, wasButton: false });
      return;
    }
    if (offset.x < -DRAG_THRESHOLD || velocity.x < -VELOCITY_THRESHOLD) {
      onDismiss("LEFT", { decisionMs, wasButton: false });
      return;
    }
    if (offset.y < -DRAG_THRESHOLD || velocity.y < -VELOCITY_THRESHOLD) {
      onDismiss("UP", { decisionMs, wasButton: false });
      return;
    }
    if (offset.y > DRAG_THRESHOLD || velocity.y > VELOCITY_THRESHOLD) {
      onDismiss("DOWN", { decisionMs, wasButton: false });
      return;
    }
  }

  // Depth 1–3 form the "digital biodata stack" — a hand-set pile of papers,
  // not parallel photocopies, so the offset alternates side per layer.
  const sign = depth % 2 === 0 ? 1 : -1;
  const peekScale = 1 - depth * 0.035;
  const peekY = depth * 8;
  const peekX = sign * depth * 4;
  const peekRotate = sign * depth * 1.2;
  const peekOpacity = STACK_OPACITY[Math.min(depth, STACK_OPACITY.length - 1)];

  return (
    <motion.div
      drag={draggable && !reduced}
      dragElastic={DRAG_ELASTIC}
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      onDragEnd={draggable ? handleDragEnd : undefined}
      style={draggable ? { x, y, rotate } : undefined}
      initial={false}
      animate={{
        scale: peekScale,
        y: peekY,
        opacity: peekOpacity,
        ...(draggable ? {} : { x: peekX, rotate: peekRotate }),
      }}
      transition={spring.soft}
      className={cn(
        "absolute inset-0 overflow-hidden rounded-lg border border-line bg-surface shadow-xl",
        // `touch-none!` (`!important`), not plain `touch-none` — Framer sets
        // its own inline `touch-action` on a draggable element, which always
        // wins over a plain stylesheet class regardless of specificity; only
        // `!important` beats it. Here `drag` is a bare boolean, so Framer's
        // own default already computes "none" and the two agree — the `!` is
        // insurance against that silently regressing if `drag` ever becomes
        // axis-locked (`drag="x"`), where Framer writes `pan-y` instead.
        //
        // This card keeps Framer's `drag`; ManualCard.tsx
        // (components/profile/ManualCard.tsx) had to drop it for hand-rolled
        // pointer handlers, because its cards wrap scrollable content that
        // Framer's drag-intent detection couldn't share a finger with. If
        // this card ever grows scrollable content, it will need the same.
        draggable && "cursor-grab active:cursor-grabbing touch-none!",
      )}
    >
      {/* Photo — consent-gated blur, §3 trust-by-design */}
      <div className="relative aspect-[4/3] shrink-0 bg-gradient-to-br from-wine-100 via-gold-100 to-sand-200 dark:from-wine-900 dark:via-gold-900 dark:to-sand-800">
        {card.photoUnlocked && card.photoUrl ? (
          <PhotoSlideDeck
            slides={card.slides}
            bioNote={card.bioNote}
            fallbackPhotoUrl={card.photoUrl}
            fallbackFocalY={card.photoFocalY}
            displayName={card.displayName}
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center">
            <div className="flex flex-col items-center gap-2 px-6 text-center">
              <span className="grid size-11 place-items-center rounded-full bg-surface/80 backdrop-blur-sm">
                <Lock className="size-5 text-muted" />
              </span>
              <p className="max-w-[220px] text-[0.75rem] leading-snug text-sand-700 dark:text-sand-300">
                Photo mutual interest ke baad dikhegi
              </p>
            </div>
          </div>
        )}

        {/* Mission badge — server-decided, at most twice a day, and only above
            the score floor. See ReelCardViewModel.mission for why the scarcity
            is the point rather than a tuning knob. */}
        {card.mission && (
          <div className="absolute left-3 right-3 top-3 flex items-start gap-2 rounded-md border border-gold-400/60 bg-surface/92 px-3 py-2 shadow-sm backdrop-blur-sm">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-gold-700" />
            <p className="min-w-0 text-[0.75rem] font-medium leading-snug text-gold-700">
              {card.mission.headline}
            </p>
          </div>
        )}

        {/* Floating shared-trait chips — deterministic overlap, never AI-generated (D-32) */}
        {card.sharedTags.length > 0 && (
          <div className="absolute bottom-3 left-3 flex flex-col items-start gap-1.5">
            {card.sharedTags.map((tag, i) => (
              <span
                key={tag}
                style={{ animationDelay: `${i * 0.4}s` }}
                className="animate-float rounded-full border border-gold-300/50 bg-surface/90 px-2.5 py-1 text-[0.6875rem] font-medium text-gold-700 shadow-sm backdrop-blur-sm dark:border-gold-700/40 dark:bg-surface/70 dark:text-gold-200"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Replay pass — this card already got a decision earlier today. Bottom-right:
            top is the mission banner's territory, bottom-left is sharedTags. */}
        {previousDecision && previousDecision !== "UP" && (
          <div
            className={cn(
              "absolute bottom-3 right-3 flex items-center gap-1 rounded-full border bg-surface/90 px-2.5 py-1 text-[0.6875rem] font-medium shadow-sm backdrop-blur-sm",
              previousDecision === "RIGHT" && "border-gold-400/60 text-gold-700",
              previousDecision === "LEFT" && "border-line-strong text-muted",
              previousDecision === "DOWN" && "border-trust/50 text-trust",
            )}
          >
            {previousDecision === "RIGHT" && <Check className="size-3" />}
            {previousDecision === "LEFT" && <X className="size-3" />}
            {previousDecision === "DOWN" && <Users className="size-3" />}
            {PREVIOUS_DECISION_LABEL[previousDecision]}
          </div>
        )}

        {/* Direction overlays */}
        {draggable && (
          <>
            <motion.div
              aria-hidden
              style={{ opacity: rightBadgeOpacity }}
              className="absolute right-4 top-4 -rotate-12 rounded-md border-2 border-gold-500 bg-surface/90 px-3 py-1 text-sm font-bold uppercase tracking-wide text-gold-700"
            >
              Interest
            </motion.div>
            <motion.div
              aria-hidden
              style={{ opacity: leftBadgeOpacity }}
              className="absolute left-4 top-4 rotate-12 rounded-md border-2 border-line-strong bg-surface/90 px-3 py-1 text-sm font-bold uppercase tracking-wide text-muted"
            >
              Abhi Nahi
            </motion.div>
            <motion.div
              aria-hidden
              style={{ opacity: upBadgeOpacity }}
              className="absolute left-1/2 top-4 -translate-x-1/2 rounded-md border-2 border-wine-500 bg-surface/90 px-3 py-1 text-sm font-bold uppercase tracking-wide text-wine-700"
            >
              AI se Poocho
            </motion.div>
            <motion.div
              aria-hidden
              style={{ opacity: downBadgeOpacity }}
              className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-md border-2 border-trust bg-surface/90 px-3 py-1 text-sm font-bold uppercase tracking-wide text-trust"
            >
              Family Ko
            </motion.div>
          </>
        )}
      </div>

      <ReelTrustStrip photoVerified={card.verified} mobileVerified={card.mobileVerified} />

      {/* Details */}
      <div className="flex-1 overflow-y-auto p-4 pt-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-lg font-semibold leading-tight text-ink">
              {card.displayName}
              {card.age ? `, ${card.age}` : ""}
            </p>
            <p className="text-[0.8125rem] text-muted">
              {[card.city, card.education].filter(Boolean).join(" · ")}
            </p>
            {card.profession && <p className="text-[0.8125rem] text-muted">{card.profession}</p>}
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {/* C5 — deterministic, from this candidate's own poll answers.
                  A chip, not a 5th action button (D-23: no 5th 48px target). */}
              {card.vibeBadge && (
                <span
                  title={card.vibeBadge.description}
                  className="inline-flex items-center gap-1 rounded-full border border-wine-300/50 bg-wine-50 px-2 py-0.5 text-[0.6875rem] font-medium text-wine-700 dark:border-wine-700/40 dark:bg-wine-900/20 dark:text-wine-200"
                >
                  {card.vibeBadge.label}
                </span>
              )}

              {/* Phase D — a chip too, same D-23 reasoning. `onPointerDown`
                  stops the drag gesture from ever engaging for this tap, so a
                  stationary click always reaches onAsk rather than risking a
                  half-drag on the surface underneath. */}
              {onAsk && card.askedStatus === "NONE" && (
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onAsk();
                  }}
                  className="inline-flex items-center gap-1 rounded-full border border-line bg-surface/90 px-2 py-0.5 text-[0.6875rem] font-medium text-muted shadow-sm backdrop-blur-sm transition-colors hover:border-gold-400 hover:text-gold-700"
                >
                  <HelpCircle className="size-3" />
                  Kuch Poochein
                </button>
              )}
              {card.askedStatus === "PENDING" && (
                <span className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[0.6875rem] text-subtle">
                  <HelpCircle className="size-3" />
                  Sawaal poocha hua hai
                </span>
              )}
            </div>
          </div>

          <motion.div style={draggable ? { scale: ringScale } : undefined} className="relative shrink-0">
            {draggable && (
              <motion.span
                aria-hidden
                style={{ opacity: ringGlow }}
                className="pointer-events-none absolute -inset-1.5 rounded-full shadow-[0_0_0_4px_rgba(201,169,110,0.35)]"
              />
            )}
            <ProgressRing size={62} thickness={6} segments={selfPreview ? [] : card.segments} glow>
              <span className="font-[family-name:var(--font-display)] text-base leading-none text-ink">
                {selfPreview ? "Aap" : `${card.compatibility}%`}
              </span>
            </ProgressRing>
          </motion.div>
        </div>

        <ReelInsightPanel strengths={card.strengths} concern={card.concern} />
        <KundliNoteList notes={card.kundliNotes} />
      </div>
    </motion.div>
  );
}
