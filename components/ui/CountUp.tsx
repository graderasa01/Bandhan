"use client";

import { useEffect, useRef, useState } from "react";
import { useInView, useMotionValue, useSpring, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface CountUpProps {
  value: number;
  /** Rendered before the number, e.g. "₹". */
  prefix?: string;
  /** Rendered after, e.g. "%". */
  suffix?: string;
  decimals?: number;
  /** Insert Indian-style grouping (1,23,456). */
  indianFormat?: boolean;
  duration?: number;
  className?: string;
  /** Start only when scrolled into view. */
  onView?: boolean;
}

function formatIndian(n: number, decimals: number) {
  const [whole, frac] = n.toFixed(decimals).split(".");
  const last3 = whole.slice(-3);
  const rest = whole.slice(0, -3);
  const grouped = rest
    ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3
    : last3;
  return frac ? `${grouped}.${frac}` : grouped;
}

/**
 * Animated number. Used on trust scores, match scores, earnings and counts.
 *
 * The count-up is what makes a score feel *earned* rather than just printed —
 * it is the cheapest high-impact motion in the product.
 */
export default function CountUp({
  value,
  prefix,
  suffix,
  decimals = 0,
  indianFormat = false,
  duration = 1.1,
  className,
  onView = true,
}: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const [display, setDisplay] = useState(reduced ? value : 0);

  const motionValue = useMotionValue(0);
  const springValue = useSpring(motionValue, {
    duration: duration * 1000,
    bounce: 0,
  });

  const shouldStart = reduced ? true : onView ? inView : true;

  useEffect(() => {
    if (reduced) {
      setDisplay(value);
      return;
    }
    if (shouldStart) motionValue.set(value);
  }, [shouldStart, value, motionValue, reduced]);

  useEffect(() => {
    if (reduced) return;
    return springValue.on("change", (v) => setDisplay(v));
  }, [springValue, reduced]);

  const rendered = indianFormat
    ? formatIndian(display, decimals)
    : display.toFixed(decimals);

  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {prefix}
      {rendered}
      {suffix}
    </span>
  );
}
