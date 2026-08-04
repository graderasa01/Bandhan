"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/motion";

const PARTICLE_COLORS = ["#c9a96e", "#ddac51", "#ebd3a0", "#1f7a5a", "#fff0cb"];

type Particle = {
  id: number;
  x: number;
  y: number;
  rotate: number;
  scale: number;
  color: string;
  delay: number;
};

/**
 * Gold-particle burst for genuine milestones only.
 *
 * Deliberately rationed — profile complete, first verification, first match.
 * Firing this on routine actions turns a moment of delight into noise, and
 * matrimony is not a game.
 */
export default function Celebrate({
  trigger,
  count = 26,
  origin = "center",
  onDone,
}: {
  trigger: boolean;
  count?: number;
  origin?: "center" | "top";
  onDone?: () => void;
}) {
  const reduced = useReducedMotion();
  const [active, setActive] = useState(false);

  const particles = useMemo<Particle[]>(
    () =>
      Array.from({ length: count }).map((_, i) => {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
        const distance = 90 + Math.random() * 130;
        return {
          id: i,
          x: Math.cos(angle) * distance,
          y: Math.sin(angle) * distance - (origin === "top" ? 40 : 0),
          rotate: Math.random() * 540 - 270,
          scale: 0.5 + Math.random() * 0.7,
          color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
          delay: Math.random() * 0.12,
        };
      }),
    [count, origin],
  );

  useEffect(() => {
    if (!trigger) return;
    if (reduced) {
      onDone?.();
      return;
    }
    setActive(true);
    haptic("success");
    const t = setTimeout(() => {
      setActive(false);
      onDone?.();
    }, 1500);
    return () => clearTimeout(t);
  }, [trigger, reduced, onDone]);

  if (reduced) return null;

  return (
    <AnimatePresence>
      {active && (
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 z-30 grid",
            origin === "top" ? "place-items-start justify-center pt-8" : "place-items-center",
          )}
        >
          {particles.map((p) => (
            <motion.span
              key={p.id}
              className="absolute block size-2 rounded-[2px]"
              style={{ backgroundColor: p.color }}
              initial={{ opacity: 0, x: 0, y: 0, scale: 0, rotate: 0 }}
              animate={{
                opacity: [0, 1, 1, 0],
                x: p.x,
                y: [0, p.y * 0.6, p.y + 60],
                scale: [0, p.scale, p.scale, p.scale * 0.8],
                rotate: p.rotate,
              }}
              exit={{ opacity: 0 }}
              transition={{
                duration: 1.3,
                delay: p.delay,
                ease: [0.22, 1, 0.36, 1],
                times: [0, 0.15, 0.6, 1],
              }}
            />
          ))}
        </div>
      )}
    </AnimatePresence>
  );
}
