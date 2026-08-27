"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode, Ref } from "react";

/**
 * Scroll-triggered entrance. Respects prefers-reduced-motion by rendering
 * the content statically instead of animating it.
 *
 * `EARLY` grows the observer's root downward instead of shrinking it, so a
 * block starts animating while it is still below the fold and is settled by
 * the time it is actually readable. The old inset margins (-80px / -60px)
 * held the animation back until the block was already 60–80px on screen,
 * which was invisible on the previous full-bleed layout and is not on the
 * current one: every marketing section is now a bordered panel, and a
 * bordered panel with nothing in it for half a second does not read as
 * "arriving", it reads as broken.
 */
const EARLY = "0px 0px 160px 0px";
export default function Reveal({
  children,
  delay = 0,
  y = 18,
  className,
  once = true,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  once?: boolean;
}) {
  const reduced = useReducedMotion();

  if (reduced) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, margin: EARLY }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

/** Staggered list wrapper — pair with <RevealItem>. */
export function RevealGroup({
  children,
  className,
  stagger = 0.08,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  stagger?: number;
  /** Passed through so the group can also be a labelled scroll region. */
  ref?: Ref<HTMLDivElement>;
  role?: string;
  tabIndex?: number;
  "aria-label"?: string;
}) {
  const reduced = useReducedMotion();

  if (reduced)
    return (
      <div className={className} {...rest}>
        {children}
      </div>
    );

  return (
    <motion.div
      className={className}
      {...rest}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: EARLY }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: stagger } } }}
    >
      {children}
    </motion.div>
  );
}

export function RevealItem({ children, className }: { children: ReactNode; className?: string }) {
  const reduced = useReducedMotion();

  if (reduced) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: 18 },
        show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } },
      }}
    >
      {children}
    </motion.div>
  );
}
