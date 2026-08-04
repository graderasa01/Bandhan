"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import CountUp from "@/components/ui/CountUp";

export type RingSegment = {
  key: string;
  label: string;
  value: number;   // 0..100
  color: string;   // any CSS colour
};

export interface ProgressRingProps {
  /** Single overall value. Ignored when `segments` is given. */
  value?: number;
  /** Segmented ring — each arc is a scoring component. */
  segments?: RingSegment[];
  size?: number;
  thickness?: number;
  label?: string;
  /** Renders instead of the default number. */
  children?: ReactNode;
  /** Confidence below 0.6 → dashed ring, no number (05_ai_spec §15.3). */
  unknown?: boolean;
  className?: string;
  /** Soft pulsing halo behind the ring — opt-in, off by default. */
  glow?: boolean;
  /** "R G B" triplet for the glow colour. Defaults to gold — reel/trust surfaces stay gold or trust-green, never rose. */
  glowColor?: string;
}

/**
 * The compatibility / trust ring.
 *
 * Segmented mode is deliberate: a single "84%" is a black box, but five arcs
 * that each mean something can be tapped and explained. That is the difference
 * between a score users trust and one they dismiss.
 */
export default function ProgressRing({
  value = 0,
  segments,
  size = 140,
  thickness = 12,
  label,
  children,
  unknown = false,
  className,
  glow = false,
  glowColor = "201 169 110",
}: ProgressRingProps) {
  const ref = useRef<SVGSVGElement>(null);
  const reduced = useReducedMotion();
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const [animate, setAnimate] = useState(reduced);

  useEffect(() => {
    if (inView) setAnimate(true);
  }, [inView]);

  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const cx = size / 2;

  // In segmented mode each arc gets an equal slice of the circle.
  const arcs =
    segments && segments.length > 0
      ? segments.map((s, i) => {
          const slice = c / segments.length;
          const filled = (slice * Math.min(Math.max(s.value, 0), 100)) / 100;
          return {
            ...s,
            dasharray: `${filled} ${c - filled}`,
            dashoffset: -(slice * i),
          };
        })
      : null;

  const total = arcs
    ? Math.round(segments!.reduce((sum, s) => sum + s.value, 0) / segments!.length)
    : Math.round(value);

  return (
    <div
      className={cn("relative grid shrink-0 place-items-center", className)}
      style={{ width: size, height: size }}
    >
      {glow && !unknown && (
        <motion.span
          aria-hidden
          className="absolute inset-1 rounded-full blur-lg"
          style={{ backgroundColor: `rgb(${glowColor} / 0.35)` }}
          animate={reduced ? undefined : { opacity: [0.35, 0.6, 0.35] }}
          transition={reduced ? undefined : { duration: 3, repeat: Infinity, ease: "easeInOut" }}
        />
      )}

      <svg
        ref={ref}
        viewBox={`0 0 ${size} ${size}`}
        className="relative size-full -rotate-90"
        role="img"
        aria-label={
          unknown
            ? `${label ?? "Score"}: abhi calculate nahi ho saka`
            : `${label ?? "Score"}: ${total} percent`
        }
      >
        {/* track */}
        <circle
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          strokeWidth={thickness}
          className="stroke-line"
        />

        {unknown ? (
          <circle
            cx={cx}
            cy={cx}
            r={r}
            fill="none"
            strokeWidth={thickness}
            strokeLinecap="round"
            strokeDasharray="6 10"
            className="stroke-line-strong"
          />
        ) : arcs ? (
          arcs.map((a) => (
            <circle
              key={a.key}
              cx={cx}
              cy={cx}
              r={r}
              fill="none"
              strokeWidth={thickness}
              strokeLinecap="round"
              stroke={a.color}
              strokeDasharray={animate ? a.dasharray : `0 ${c}`}
              strokeDashoffset={a.dashoffset}
              style={{ transition: "stroke-dasharray 1.1s cubic-bezier(0.22,1,0.36,1)" }}
            />
          ))
        ) : (
          <circle
            cx={cx}
            cy={cx}
            r={r}
            fill="none"
            strokeWidth={thickness}
            strokeLinecap="round"
            stroke="url(#bt-ring-grad)"
            strokeDasharray={c}
            strokeDashoffset={animate ? c * (1 - value / 100) : c}
            style={{ transition: "stroke-dashoffset 1.1s cubic-bezier(0.22,1,0.36,1)" }}
          />
        )}

        <defs>
          <linearGradient id="bt-ring-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#c9a96e" />
            <stop offset="100%" stopColor="#1f7a5a" />
          </linearGradient>
        </defs>
      </svg>

      <div className="absolute flex flex-col items-center text-center">
        {children ?? (
          <>
            {unknown ? (
              <span className="font-[family-name:var(--font-display)] text-lg leading-none text-muted">
                ?
              </span>
            ) : (
              <span className="font-[family-name:var(--font-display)] text-3xl leading-none text-ink">
                <CountUp value={total} suffix="%" />
              </span>
            )}
            {label && (
              <span className="mt-1 text-[0.625rem] font-semibold uppercase tracking-wider text-muted">
                {label}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
