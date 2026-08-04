"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode, Ref } from "react";

/**
 * Scroll-triggered entrance. Respects prefers-reduced-motion by rendering
 * the content statically instead of animating it.
 */
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
      viewport={{ once, margin: "-80px" }}
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
      viewport={{ once: true, margin: "-60px" }}
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
