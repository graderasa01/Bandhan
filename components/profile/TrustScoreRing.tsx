"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { TrustScoreLabel } from "@/lib/services/trust/trustScoreService";
import { cn } from "@/lib/utils";

interface Props {
  score: number | null;
  label: TrustScoreLabel;
  size?: number;
}

/** Ring colour + glow tint per band — reuses the same hex values as globals.css tokens. */
const BAND: Record<TrustScoreLabel, { from: string; to: string; glow: string; text: string }> = {
  STRONG: { from: "#4cbf94", to: "#1f7a5a", glow: "31 122 90", text: "text-trust" },
  GOOD: { from: "#4cbf94", to: "#1f7a5a", glow: "31 122 90", text: "text-trust" },
  MODERATE: { from: "#ddac51", to: "#a88848", glow: "201 169 110", text: "text-gold-700" },
  LOW: { from: "#e0b555", to: "#9a6512", glow: "154 101 18", text: "text-warn" },
  UNKNOWN: { from: "#9a8b7d", to: "#6b5d52", glow: "154 139 125", text: "text-subtle" },
};

/**
 * Glowing circular progress ring for the AI Trust Score — the "control room"
 * treatment the dashboard redesign asked for. Falls back to a flat ring with
 * no glow/animation when the score is null (not yet calculated) or reduced
 * motion is requested.
 */
export default function TrustScoreRing({ score, label, size = 116 }: Props) {
  const reduced = useReducedMotion();
  const band = BAND[label];
  const r = (size - 14) / 2;
  const circumference = 2 * Math.PI * r;
  const pct = score === null ? 0 : Math.max(0, Math.min(100, score));
  const offset = circumference - (pct / 100) * circumference;
  const gradientId = `trust-ring-${label}`;

  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      {/* Soft blurred glow behind the ring — the "glowing effects" ask */}
      {score !== null && (
        <motion.div
          aria-hidden
          className="absolute inset-2 rounded-full blur-xl"
          style={{ backgroundColor: `rgb(${band.glow} / 0.35)` }}
          animate={reduced ? undefined : { opacity: [0.35, 0.6, 0.35] }}
          transition={reduced ? undefined : { duration: 3, repeat: Infinity, ease: "easeInOut" }}
        />
      )}

      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="relative -rotate-90">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={band.from} />
            <stop offset="100%" stopColor={band.to} />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={9}
          className="stroke-line"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={9}
          strokeLinecap="round"
          stroke={`url(#${gradientId})`}
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: reduced ? offset : circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>

      <div className="absolute inset-0 grid place-items-center text-center">
        {score !== null ? (
          <div>
            <span className={cn("font-[family-name:var(--font-display)] text-3xl font-bold tabular-nums", band.text)}>
              {score}
            </span>
            <span className="block text-[0.6875rem] font-medium text-subtle">/100</span>
          </div>
        ) : (
          <span className="text-xs font-medium text-subtle">Pending</span>
        )}
      </div>
    </div>
  );
}
