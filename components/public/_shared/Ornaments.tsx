import { cn } from "@/lib/utils";

/**
 * The marketing page's line-work.
 *
 * Everything here is `currentColor` and `aria-hidden`: it is margin
 * decoration, never content. Colour, opacity and placement belong to the call
 * site (`.bt-vine` in globals.css owns the ink and the fade), so one sprig can
 * sit on cream, on blush, or on the wine panel without a second copy.
 *
 * Drawn rather than shipped as assets on purpose — an SVG that inherits
 * colour follows the active theme pack and dark mode for free, and costs no
 * network request on the one page where first paint matters most.
 */

/* ------------------------------------------------------------------ */

/**
 * A botanical spray — one long stem with paired leaves, a shorter offshoot
 * behind it, and three berries. Sized to a 180×300 box; scale it with a
 * width/height class, not a transform, so the hairlines stay hairlines.
 */
export function LeafSpray({
  className,
  flip = false,
}: {
  className?: string;
  /** Mirror it, for the opposite margin. */
  flip?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 180 300"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.15}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn(flip && "-scale-x-100", className)}
      aria-hidden
    >
      {/* Stems are drawn THINNER than the leaves they carry. At full weight a
          stem crossing a headline stops reading as a branch and starts
          reading as a scratch on the page — the leaves have to be the
          heavier shape for the eye to resolve the whole thing as botany. */}
      <path d="M24 6 C74 62, 108 140, 118 268" strokeWidth={0.8} />
      <path d="M30 40 C12 96, 26 150, 58 190" strokeWidth={0.65} />

      {/* Leaves ride the stem in mirrored pairs, biggest at the waist of the
          curve and tapering to a bud at the tip — a real sprig is never
          evenly weighted. */}
      <g>
        {[
          [33, 16, -26, 0.44],
          [33, 16, 118, 0.4],
          [45, 33, -15, 0.62],
          [45, 33, 125, 0.55],
          [65, 64, -8, 0.78],
          [65, 64, 132, 0.7],
          [81, 100, -2, 0.9],
          [81, 100, 138, 0.82],
          [95, 142, 4, 0.95],
          [95, 142, 144, 0.86],
          [106, 191, 10, 0.82],
          [106, 191, 150, 0.74],
          [113, 240, 13, 0.62],
          [113, 240, 153, 0.56],
          [115, 250, 86, 0.42],
          [22, 90, 20, 0.5],
          [22, 90, 160, 0.45],
          [29, 136, 3, 0.58],
          [29, 136, 143, 0.5],
          [45, 171, -11, 0.48],
          [45, 171, 129, 0.42],
        ].map(([x, y, rot, s], i) => (
          <g key={i} transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
            <path d="M0 0 C10 -11, 30 -13, 46 0 C30 13, 10 11, 0 0 Z" />
            <path d="M3 0 C16 -1.5, 32 -1.5, 43 0" strokeWidth={0.75} />
          </g>
        ))}
      </g>

      {/* berries */}
      <circle cx="58" cy="52" r="2.6" />
      <circle cx="89" cy="122" r="2.2" />
      <circle cx="109" cy="212" r="2.4" />
    </svg>
  );
}

/**
 * The small sprig that sits in the middle of an ornamental rule. Lives inside
 * `.bt-rule`, which draws the two hairlines around it.
 */
export function RuleMotif({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 14"
      fill="none"
      stroke="currentColor"
      strokeWidth={0.9}
      strokeLinejoin="round"
      className={cn("h-3 w-10 shrink-0", className)}
      aria-hidden
    >
      <path d="M20 2 C22.6 5, 22.6 9, 20 12 C17.4 9, 17.4 5, 20 2 Z" />
      <path d="M15.5 7 C11.5 3.6, 6 4.4, 3 7 C6 9.6, 11.5 10.4, 15.5 7 Z" />
      <path d="M24.5 7 C28.5 3.6, 34 4.4, 37 7 C34 9.6, 28.5 10.4, 24.5 7 Z" />
    </svg>
  );
}

/**
 * The curl printed into a card's corner on an invitation — a quarter-frame of
 * two rules and a small leaf, not a picture. Rotate it with a utility class to
 * put it in any of the four corners.
 */
export function CornerFlourish({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 72 72"
      fill="none"
      stroke="currentColor"
      strokeWidth={1}
      strokeLinecap="round"
      className={className}
      aria-hidden
    >
      <path d="M2 14 C24 14, 44 8, 58 2" strokeWidth={0.85} />
      <path d="M14 2 C14 24, 8 44, 2 58" strokeWidth={0.85} />
      <path d="M20 20 C30 14, 44 16, 52 24 C42 30, 28 28, 20 20 Z" />
      <path d="M20 20 C14 30, 16 44, 24 52 C30 42, 28 28, 20 20 Z" />
      <circle cx="34" cy="34" r="1.8" />
    </svg>
  );
}

/** A four-point sparkle — used sparingly, as punctuation. */
export function Sparkle({ className }: { className?: string }) {
  return (
    <svg viewBox="-8 -8 16 16" fill="currentColor" className={className} aria-hidden>
      <path d="M0 -7 Q1.1 -1.1 7 0 Q1.1 1.1 0 7 Q-1.1 1.1 -7 0 Q-1.1 -1.1 0 -7 Z" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */

/**
 * A family, holding hands, as a warm silhouette — the "parivaar shuru se
 * saath hai" promise drawn instead of claimed. Filled shapes, no faces: a
 * silhouette is every family, a face is one.
 */
export function FamilySilhouette({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 260 160" className={className} aria-hidden>
      {/* the light they are standing in */}
      <circle cx="128" cy="86" r="72" fill="currentColor" opacity={0.07} />
      <ellipse cx="128" cy="134" rx="112" ry="9" fill="currentColor" opacity={0.09} />

      <g fill="currentColor">
        {/* father */}
        <g transform="translate(76 132)">
          <circle cx="0" cy="-92" r="11" />
          <path d="M-14 -74 q14 -8 28 0 l-3 40 h-22 z" />
          <path d="M-11 -34 h8 l3 34 h-9 z" />
          <path d="M4 -34 h7 l-2 34 h-8 z" />
        </g>

        {/* mother */}
        <g transform="translate(132 132)">
          <circle cx="0" cy="-92" r="11" />
          {/* the drape of a dupatta, so the two adults are not one shape twice */}
          <path d="M-13 -80 q-9 6 -11 18 l5 2 q3 -11 10 -16 z" opacity={0.75} />
          <path d="M-14 -74 q14 -8 28 0 l16 74 h-60 z" />
        </g>

        {/* child */}
        <g transform="translate(180 132) scale(0.56)">
          <circle cx="0" cy="-92" r="12" />
          <path d="M-14 -74 q14 -8 28 0 l-3 40 h-22 z" />
          <path d="M-11 -34 h8 l3 34 h-9 z" />
          <path d="M4 -34 h7 l-2 34 h-8 z" />
        </g>
      </g>

      {/* joined hands */}
      <g fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round">
        <path d="M90 62 Q104 74 118 62" />
        <path d="M146 66 Q158 86 169 93" />
      </g>

      {/* one heart above them, and two sparks */}
      <g fill="currentColor">
        <path
          d="M112 22 c0 -5.4 -8.1 -9.9 -8.1 -15.3 a4 4 0 0 1 8.1 -1.5 a4 4 0 0 1 8.1 1.5 c0 5.4 -8.1 9.9 -8.1 15.3 z"
          transform="translate(16 4)"
          opacity={0.55}
        />
        <path
          d="M0 -5 Q0.8 -0.8 5 0 Q0.8 0.8 0 5 Q-0.8 0.8 -5 0 Q-0.8 -0.8 0 -5 Z"
          transform="translate(62 26)"
          opacity={0.5}
        />
        <path
          d="M0 -4 Q0.6 -0.6 4 0 Q0.6 0.6 0 4 Q-0.6 0.6 -4 0 Q-0.6 -0.6 0 -4 Z"
          transform="translate(206 44)"
          opacity={0.45}
        />
      </g>
    </svg>
  );
}
