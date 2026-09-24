import { cn } from "@/lib/utils";

/**
 * The room: warm satin, wine, and pearl.
 *
 * This is `reference images/Codex Image Sep 18, 2026, 12_03_41 PM.png` drawn
 * as geometry, and it is the room the WHOLE product stands in: it replaced the
 * dusk terrace under the `terrace` theme, so every shell that renders this
 * component — and every screen those shells carry — is in it. The other three
 * themes are untouched: `ivory` and `gold` ship their own rooms through
 * `AmbientBackground`, and `paper` (the classic cream look) hides both and
 * stands on the page itself.
 *
 * An admin can put a photo behind Satin, Day or Night (/admin/theme). That is
 * `PhotoRoom` below, rendered alongside this drawing everywhere it goes; with
 * `data-photo` on <html> the photo shows and every drawn room is hidden.
 *
 * The reference is a LIGHT room: champagne satin with hard-edged folds, deep
 * wine masses, pearl spheres and a few crisp gold hairlines, with glass
 * standing in it.
 *
 * ## Every number below was sampled off the reference, not chosen
 *
 * A 12x24 luminance grid over the reference says the room swings from 24
 * (#390f14, the wine corners) to 231 (#f9e1c2, the champagne at the top), and
 * that the swing is NOT evenly spread:
 *
 *   the margins        200-231 cream and 24-47 wine, side by side, with a
 *                      hard boundary between them.
 *   the content column  56-63, flat, the whole way down (sampled in the
 *                      gutters between the cards: #46382f, #473731, #433630).
 *
 * That split is the entire reason the reference's glass works. A pane in this
 * material is a warm greige at ~0.65, so it lands ~35 luminance above whatever
 * is behind it: over the column's 58 it reads 95 and ivory type clears 5.6:1;
 * over a 230 cream field it would read 165 and the same type would fail. So
 * the drama lives at the edges and the column stays calm — and anything bright
 * that does cross the column is SMALL (a gold hairline, a sphere's lit limb, a
 * fold's leading edge), never a mass.
 *
 * ## Crisp, not blurred
 *
 * The report was "background crispy clean na ki blur". Nothing here uses
 * `filter: blur()`. Softness comes from gradient falloff, which stays real
 * geometry at 3x and costs a fraction of a blur to composite; hard boundaries
 * are path edges, which is the only way to get the reference's one
 * unmistakable feature — a satin fold whose lit edge is a LINE. Blur the room
 * and the glass has nothing sharp left to soften, which is exactly when it
 * stops reading as glass.
 *
 * ## One drawing, a phone and a monitor
 *
 * Square viewBox (`1900x1900`) with `xMidYMid slice`, the same rule the
 * terrace and the mehfil hold — a phone-shaped viewBox scales off width on a
 * monitor and the drawing falls apart. What each device sees:
 *
 *   phone (375x812)     the middle `x 511..1389`, all of y
 *   monitor (1280x860)  all of x, the middle `y 312..1588`
 *
 * `CORE_L`/`CORE_R` are those numbers. Load-bearing shapes live between them;
 * the far cream fields and the outer spheres are the monitor's bonus.
 */

/* Deterministic, never `Math.random()`: this renders on the server and then
   hydrates on the client, and two different scatterings are a hydration
   mismatch. */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f = (n: number) => +n.toFixed(1);

const W = 1900;
/** The strip a phone sees. Nothing load-bearing may sit outside it. */
const CORE_L = 511;
const CORE_R = 1389;

/**
 * A sphere, which in the reference is the room's one repeated object: a ball
 * lit from the upper left, with a bright specular near the top and — the part
 * that makes it read as a sphere rather than a disc — a LIT LIMB along the
 * shaded edge, where light wraps round the far side.
 */
function Sphere({
  cx,
  cy,
  r,
  tone,
  o = 1,
  limb = 0.5,
}: {
  cx: number;
  cy: number;
  r: number;
  tone: "pearl" | "wine" | "dim";
  o?: number;
  limb?: number;
}) {
  return (
    <g opacity={o}>
      <circle cx={cx} cy={cy} r={r} fill={`url(#sr-ball-${tone})`} />
      {/* The limb. A stroke carrying a diagonal gradient is bright on the
          lower-right and gone on the upper-left, which is what a real one
          does — and it is one element rather than an arc nobody can retune. */}
      <circle
        cx={cx}
        cy={cy}
        r={f(r - r * 0.018)}
        fill="none"
        stroke="url(#sr-limb)"
        strokeWidth={f(Math.max(1.5, r * 0.022))}
        opacity={limb}
      />
      <ellipse
        cx={f(cx - r * 0.3)}
        cy={f(cy - r * 0.34)}
        rx={f(r * 0.34)}
        ry={f(r * 0.24)}
        fill="url(#sr-spec)"
        transform={`rotate(-28 ${f(cx - r * 0.3)} ${f(cy - r * 0.34)})`}
      />
    </g>
  );
}

/* ---- the gold hairlines ----
   In the reference these are the only pure-line objects in the picture: ~1px
   of bright amber running the whole way across, with a faint bloom either
   side. They are what stop a field of soft masses from reading as a blur. Two
   of the four cross the content column, which is allowed precisely because a
   line is thin — a pane over one shows a thread, not a hot spot. */
const HAIRLINES = [
  { d: "M-80,742 C420,548 980,300 1430,132 C1650,50 1820,10 1980,-40", w: 2.4, o: 0.9 },
  { d: "M902,-60 C1046,330 1240,690 1470,980 C1660,1220 1830,1390 1980,1520", w: 2, o: 0.72 },
  { d: "M1980,1186 C1700,1326 1400,1526 1170,1772 C1080,1868 1026,1936 1000,1990", w: 1.7, o: 0.56 },
  /* The one that exists for the phone: it runs down the middle strip, where
     the drawing would otherwise be nothing but soft masses. A pane over a line
     shows a thread, which is why a line is allowed to cross the column here
     and a bright field is not. */
  { d: "M1980,516 C1594,668 1176,910 886,1210 C662,1444 522,1682 452,1960", w: 1.6, o: 0.5 },
];

/* ---- the engraved leaves ----
   The reference's bottom-left corner has a botanical drawn as a gold OUTLINE —
   no fill, veins showing. It is the one piece of the picture that says this is
   a wedding and not a product shot.

   The spray runs from well outside the phone's strip to just inside it, so a
   monitor gets the whole plant in its left margin and a phone still catches
   the last two leaves under its final call to action. Anchored on `CORE_L`
   rather than on a literal, because that is the number the rule is about. */
const LEAVES = (() => {
  const r = rng(77);
  return Array.from({ length: 8 }, (_, i) => {
    const t = i / 7;
    return {
      key: i,
      x: f(CORE_L - 430 + t * 560 + (r() - 0.5) * 90),
      y: f(1902 - t * 250 + (r() - 0.5) * 80),
      a: f(-64 + t * 78 + (r() - 0.5) * 26),
      s: f(0.7 + r() * 0.75),
    };
  });
})();

/** One leaf: an outline and five veins. Drawn, never filled. */
function Leaf({ x, y, a, s }: { x: number; y: number; a: number; s: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${a}) scale(${s})`}>
      <path
        d="M0,0 C46,-34 128,-38 182,0 C128,38 46,34 0,0 Z"
        fill="none"
        stroke="#e6b872"
        strokeWidth="2.2"
        strokeOpacity="0.62"
      />
      <path d="M0,0 L182,0" stroke="#e6b872" strokeWidth="1.8" strokeOpacity="0.5" />
      {[36, 68, 100, 132].map((vx) => (
        <g key={vx}>
          <path d={`M${vx},0 C${vx + 14},-12 ${vx + 30},-18 ${vx + 44},-17`} fill="none" stroke="#e6b872" strokeWidth="1.3" strokeOpacity="0.38" />
          <path d={`M${vx},0 C${vx + 14},12 ${vx + 30},18 ${vx + 44},17`} fill="none" stroke="#e6b872" strokeWidth="1.3" strokeOpacity="0.38" />
        </g>
      ))}
    </g>
  );
}

/** The four weights — see "the four weights" in globals.css for the ladder. */
export type AppBackgroundVariant = "default" | "soft" | "deep" | "focus";

/**
 * The room an admin put a photo in (/admin/theme) — Satin, Day or Night with
 * their drawing replaced by a picture. Always in the markup and `display:
 * none` until `data-photo` is on <html>; the photo itself, its scrim and its
 * crop point arrive as custom properties from the root layout (see "THE PHOTO
 * ROOM" in globals.css). Three layers: a tiny blurred copy that shows while
 * the photo loads and fills the sides of a wide screen, the photo, and the
 * scrim that keeps type on the glass readable.
 *
 * Rendered by `AppBackground`, so every place that shows a room — every shell,
 * `/bolo`, the profile deck — gets it without knowing it exists.
 */
export function PhotoRoom({
  variant = "default",
  className,
}: {
  variant?: AppBackgroundVariant;
  className?: string;
}) {
  return (
    <div className={cn("photo-room", variant !== "default" && `photo-room--${variant}`, className)} aria-hidden>
      <span className="photo-room__backdrop" />
      <span className="photo-room__image" />
      <span className="photo-room__scrim" />
    </div>
  );
}

export default function AppBackground({
  variant = "default",
  className,
}: {
  variant?: AppBackgroundVariant;
  className?: string;
}) {
  return (
    <>
      <PhotoRoom variant={variant} className={className} />
      <div
        className={cn("satin-room", variant !== "default" && `satin-room--${variant}`, className)}
        aria-hidden
      >
        <svg
          className="satin-room__art"
          viewBox={`0 0 ${W} 1900`}
          preserveAspectRatio="xMidYMid slice"
          focusable="false"
        >
          <defs>
            {/* The ground, and it is the legibility budget: every stop that lands
                inside the content column sits between 45 and 80 luminance. The
                cream and the wine are painted ON it as objects, so the calm part
                of the picture can never be accidentally lifted by a colour
                change here. */}
            <linearGradient id="sr-ground" x1="0.08" y1="0" x2="0.86" y2="1">
              <stop offset="0" stopColor="#4a2c1c" />
              <stop offset="0.22" stopColor="#603d24" />
              <stop offset="0.46" stopColor="#5c3a22" />
              <stop offset="0.66" stopColor="#4c2d1e" />
              <stop offset="0.85" stopColor="#3b211c" />
              <stop offset="1" stopColor="#2c171b" />
            </linearGradient>

            {/* Champagne satin. Two weights: the full-strength one for the
                margins (peaks ~228, the reference's brightest field) and a
                held-back one for anything that reaches toward the column. */}
            <radialGradient id="sr-cream" cx="0.38" cy="0.32" r="0.68">
              <stop offset="0" stopColor="#fdeed2" stopOpacity="0.96" />
              <stop offset="0.42" stopColor="#f0d2ab" stopOpacity="0.82" />
              <stop offset="0.72" stopColor="#c69b76" stopOpacity="0.44" />
              <stop offset="1" stopColor="#8a6350" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="sr-cream-held" cx="0.38" cy="0.32" r="0.68">
              <stop offset="0" stopColor="#e8c79f" stopOpacity="0.62" />
              <stop offset="0.5" stopColor="#c99a72" stopOpacity="0.38" />
              <stop offset="1" stopColor="#8a6350" stopOpacity="0" />
            </radialGradient>

            {/* Wine. Sampled #390f14 / #4a1c23 / #652024 — a red that is almost
                black in the corners and opens to a lit maroon where the satin
                catches it. */}
            <linearGradient id="sr-wine" x1="0.1" y1="0" x2="0.9" y2="1">
              <stop offset="0" stopColor="#8a2029" />
              <stop offset="0.34" stopColor="#68121e" />
              <stop offset="0.72" stopColor="#3d0c16" />
              <stop offset="1" stopColor="#2a0710" />
            </linearGradient>
            <linearGradient id="sr-wine-low" x1="0.9" y1="0" x2="0.1" y2="1">
              <stop offset="0" stopColor="#6d1f28" />
              <stop offset="0.45" stopColor="#4b1119" />
              <stop offset="1" stopColor="#2c0a12" />
            </linearGradient>

            {/* A fold is not a colour, it is an EDGE: bright where the satin
                turns into the light and falling away to nothing across the
                width of the cloth. The hard stop at 0 is the edge itself. */}
            <linearGradient id="sr-fold-warm" x1="0" y1="0" x2="0.35" y2="1">
              <stop offset="0" stopColor="#ffeecd" stopOpacity="0.72" />
              <stop offset="0.12" stopColor="#e8c298" stopOpacity="0.4" />
              <stop offset="0.46" stopColor="#a87a5f" stopOpacity="0.18" />
              <stop offset="1" stopColor="#5a3a30" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="sr-fold-deep" x1="1" y1="0" x2="0.2" y2="1">
              <stop offset="0" stopColor="#ffe6bd" stopOpacity="0.44" />
              <stop offset="0.2" stopColor="#c08f6c" stopOpacity="0.22" />
              <stop offset="0.7" stopColor="#4e2c26" stopOpacity="0.12" />
              <stop offset="1" stopColor="#2c1518" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="sr-fold-edge" x1="0" y1="0" x2="1" y2="0.3">
              <stop offset="0" stopColor="#fff6e2" stopOpacity="0" />
              <stop offset="0.3" stopColor="#fff2d8" stopOpacity="0.68" />
              <stop offset="0.68" stopColor="#ffe6bb" stopOpacity="0.5" />
              <stop offset="1" stopColor="#ffdfae" stopOpacity="0" />
            </linearGradient>

            {/* The spheres. Lit at 32/26 — upper left, one source, the same one
                the rim on every pane above is catching. */}
            <radialGradient id="sr-ball-pearl" cx="0.32" cy="0.26" r="0.78">
              <stop offset="0" stopColor="#fff7ea" />
              <stop offset="0.34" stopColor="#efd3b2" />
              <stop offset="0.64" stopColor="#bf9a7c" />
              <stop offset="0.86" stopColor="#8a6450" />
              <stop offset="1" stopColor="#4e3430" />
            </radialGradient>
            <radialGradient id="sr-ball-dim" cx="0.32" cy="0.26" r="0.78">
              <stop offset="0" stopColor="#d9bfa4" />
              <stop offset="0.4" stopColor="#ad8b72" />
              <stop offset="0.76" stopColor="#6e4d42" />
              <stop offset="1" stopColor="#3c2724" />
            </radialGradient>
            <radialGradient id="sr-ball-wine" cx="0.32" cy="0.26" r="0.78">
              <stop offset="0" stopColor="#b56a64" />
              <stop offset="0.36" stopColor="#8a3239" />
              <stop offset="0.72" stopColor="#551520" />
              <stop offset="1" stopColor="#2c0a12" />
            </radialGradient>
            <linearGradient id="sr-limb" x1="0.1" y1="0.05" x2="0.92" y2="0.95">
              <stop offset="0" stopColor="#ffe9c4" stopOpacity="0" />
              <stop offset="0.62" stopColor="#ffe0ae" stopOpacity="0.04" />
              <stop offset="0.9" stopColor="#fff0d2" stopOpacity="0.5" />
              <stop offset="1" stopColor="#ffe3b6" stopOpacity="0.2" />
            </linearGradient>
            <radialGradient id="sr-spec" cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stopColor="#fffaf0" stopOpacity="0.68" />
              <stop offset="0.55" stopColor="#fff2dc" stopOpacity="0.22" />
              <stop offset="1" stopColor="#ffeed4" stopOpacity="0" />
            </radialGradient>

            {/* The crown: the band the sticky header sits in, on every screen in
                the product. Measured rather than chosen — the drawing's top-left
                is champagne at ~200 luminance, and the page puts words closest
                to the picture here. A breath only: the sticky header carries its
                own shade (see `header.bg-transparent` in globals.css), because a
                band dark enough to carry NAV LINKS is a band dark enough to read
                as a toolbar across a lit room. */}
            <linearGradient id="sr-crown" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#25120f" stopOpacity="0.34" />
              <stop offset="0.5" stopColor="#25120f" stopOpacity="0.15" />
              <stop offset="1" stopColor="#25120f" stopOpacity="0" />
            </linearGradient>

            <linearGradient id="sr-gold" x1="0" y1="0" x2="1" y2="0.4">
              <stop offset="0" stopColor="#f6d79a" stopOpacity="0.2" />
              <stop offset="0.3" stopColor="#ffe9b8" stopOpacity="0.95" />
              <stop offset="0.62" stopColor="#e9b866" stopOpacity="0.8" />
              <stop offset="1" stopColor="#ffeec6" stopOpacity="0.3" />
            </linearGradient>
          </defs>

          <rect className="satin-room__ground" width={W} height="1900" fill="url(#sr-ground)" />

          {/* ---- the satin ----
              The largest thing in the reference is not an object, it is CLOTH:
              two or three enormous smooth sheets of it, champagne where the light
              falls and bronze where it turns away. Everything else in the picture
              is small by comparison. An earlier pass had this the other way round
              — a dozen spheres over a flat ground — and it read as bubble
              wallpaper rather than as a room. */}
          <g className="satin-room__cream">
            <ellipse cx="60" cy="150" rx="880" ry="760" fill="url(#sr-cream)" />
            <ellipse cx="1880" cy="1520" rx="860" ry="780" fill="url(#sr-cream)" />
            <ellipse cx="-60" cy="1180" rx="560" ry="820" fill="url(#sr-cream)" opacity="0.88" />
            {/* The two that reach into the strip a phone sees. Held weight and
                nothing more: they peak near 150, which is ~25 luminance of
                movement once a pane is over them — enough to see the room
                through the glass, not enough to cost a paragraph its contrast. */}
            <ellipse cx="760" cy="560" rx="620" ry="540" fill="url(#sr-cream-held)" opacity="0.62" />
            <ellipse cx="1240" cy="1420" rx="580" ry="620" fill="url(#sr-cream-held)" opacity="0.5" />
          </g>

          {/* ---- the wine ----
              Corners, with a HARD curved boundary and a hairline of light running
              along it. That edge is the one unmistakably crisp thing in the
              reference, and it is why this room is drawn rather than blurred. */}
          <g className="satin-room__wine">
            <path
              d="M1060,-40 C1128,210 1290,452 1498,624 C1690,782 1846,876 1980,930 L1980,-40 Z"
              fill="url(#sr-wine)"
            />
            <path
              d="M1060,-40 C1128,210 1290,452 1498,624 C1690,782 1846,876 1980,930"
              fill="none"
              stroke="url(#sr-fold-edge)"
              strokeWidth="2.6"
              opacity="0.72"
            />

            <path
              d="M-40,1500 C260,1452 560,1512 810,1650 C1000,1756 1124,1866 1180,1960 L-40,1960 Z"
              fill="url(#sr-wine-low)"
            />
            <path
              d="M-40,1500 C260,1452 560,1512 810,1650 C1000,1756 1124,1866 1180,1960"
              fill="none"
              stroke="url(#sr-fold-edge)"
              strokeWidth="2.2"
              opacity="0.56"
            />

            <path
              d="M1980,1730 C1846,1726 1722,1780 1636,1866 C1594,1908 1570,1940 1560,1960 L1980,1960 Z"
              fill="url(#sr-wine)"
              opacity="0.88"
            />
          </g>

          {/* ---- the folds ----
              A fold is a mass with ONE lit edge drawn on it. The mass says which
              way the cloth turns; the edge is the object. Three of them, and the
              middle one crosses the column twice on its way down so a phone gets
              a fold of its own rather than a flat field. */}
          <g className="satin-room__folds">
            <path
              d="M-60,1010 C300,806 720,516 1150,390 C1470,296 1740,258 1980,262 L1980,-40 L-60,-40 Z"
              fill="url(#sr-fold-warm)"
            />
            <path
              d="M-60,1010 C300,806 720,516 1150,390 C1470,296 1740,258 1980,262"
              fill="none"
              stroke="url(#sr-fold-edge)"
              strokeWidth="3.4"
            />

            <path
              d="M1980,700 C1580,856 1160,1092 872,1382 C650,1606 512,1800 440,1960 L-60,1960 L-60,1560 C220,1330 560,1086 940,894 C1268,728 1640,610 1980,556 Z"
              fill="url(#sr-fold-deep)"
              opacity="0.82"
            />
            <path
              d="M1980,700 C1580,856 1160,1092 872,1382 C650,1606 512,1800 440,1960"
              fill="none"
              stroke="url(#sr-fold-edge)"
              strokeWidth="2.8"
              opacity="0.78"
            />

            {/* The vertical fold, and it is deliberately the quiet weight: what
                it contributes is an edge for the panes' rims to be read against,
                not brightness. */}
            <path
              d="M600,-40 C648,440 630,930 668,1380 C696,1690 742,1852 796,1960 L392,1960 C406,1548 398,1060 382,620 C372,320 370,96 372,-40 Z"
              fill="url(#sr-fold-warm)"
              opacity="0.42"
            />
            <path
              d="M600,-40 C648,440 630,930 668,1380 C696,1690 742,1852 796,1960"
              fill="none"
              stroke="url(#sr-fold-edge)"
              strokeWidth="2.2"
              opacity="0.52"
            />
          </g>

          {/* ---- the spheres ----
              Six, and five of them are cut by the frame. That is how the
              reference uses them: they are not a motif scattered across the
              picture, they are two or three very large objects you only ever see
              part of. The sixth is the soft mass standing inside the column —
              big, faint, and there so a pane has something of the room to show. */}
          <g className="satin-room__spheres">
            <Sphere cx={1810} cy={72} r={372} tone="wine" o={0.92} limb={0.42} />
            <Sphere cx={1962} cy={706} r={286} tone="dim" o={0.6} limb={0.3} />
            <Sphere cx={1790} cy={1712} r={396} tone="pearl" o={0.82} limb={0.34} />
            <Sphere cx={-118} cy={598} r={330} tone="pearl" o={0.78} limb={0.3} />
            <Sphere cx={-70} cy={1466} r={430} tone="pearl" o={0.84} limb={0.32} />
            <Sphere cx={CORE_R - 40} cy={1210} r={300} tone="dim" o={0.34} limb={0.2} />
            <Sphere cx={CORE_L + 190} cy={1706} r={286} tone="dim" o={0.3} limb={0.18} />
          </g>

          <g className="satin-room__hairlines">
            {HAIRLINES.map((h, i) => (
              <g key={i}>
                {/* The bloom, drawn as a wide soft stroke rather than a blur —
                    same reason as everything else in this file. */}
                <path d={h.d} fill="none" stroke="#ffd591" strokeWidth={f(h.w * 5)} strokeOpacity={0.08 * h.o} />
                <path d={h.d} fill="none" stroke="url(#sr-gold)" strokeWidth={h.w} strokeOpacity={h.o} />
              </g>
            ))}
          </g>

          <g className="satin-room__leaves">
            {LEAVES.map(({ key, ...l }) => (
              <Leaf key={key} {...l} />
            ))}
          </g>

          {/* The page puts words closest to the picture under the sticky header,
              so the top of the drawing settles a little. A gradient, not a flat
              rect: a flat wash over a fold flattens the fold, which is the one
              thing in this room that must stay crisp. */}
          <rect x="0" y="0" width={W} height="420" fill="url(#sr-crown)" />
        </svg>

        <span className="satin-room__veil" />
      </div>
    </>
  );
}
