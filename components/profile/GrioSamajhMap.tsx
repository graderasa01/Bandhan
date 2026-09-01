"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  Bell,
  Bookmark,
  Bot,
  Brain,
  Camera,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Eye,
  FileUser,
  Film,
  Flame,
  Heart,
  HelpCircle,
  Home,
  HouseHeart,
  Layers3,
  Loader2,
  Lock,
  MailCheck,
  MessageCircle,
  Orbit,
  Rocket,
  Route,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Telescope,
  UserRound,
  UsersRound,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n/LanguageProvider";
import type { BranchId, MapNode, NodeState, SamajhMap } from "@/lib/services/grio/samajhMap";
import GrioPrivacyPanel from "./GrioPrivacyPanel";

/**
 * Grio Samajh Map — the whole app as one canvas of bubbles.
 *
 * ## Everything is a ball, and the canvas is the whole screen
 *
 * Two earlier versions failed the same way. A nav list answered "what pages
 * exist", which somebody who has just finished a profile already knows. A ring
 * with a detail *card underneath it* answered more, but split the screen in
 * two: you tapped a bubble at the top and read about it at the bottom, and on a
 * phone the two were never visible together — so the map became a menu with a
 * document stapled to it.
 *
 * Now nothing lives outside the canvas. Selecting a page bubble blooms its
 * **action bubbles** around it — open, ask, why, and an eye for more — and the
 * words appear in one small card floating inside the canvas. The eye is what
 * keeps it small: one line by default, the long explanation only when asked
 * for. A map that printed everything at once would be a document with circles
 * on it, which is the thing this replaced.
 *
 * ## Why the three corner bubbles
 *
 * "Agla step", the privacy shield and the guided routes used to be buttons in a
 * header above the canvas. They are the map's own controls, so they are bubbles
 * too — parked in the corners, which on a square canvas holding circular rings
 * is the only space that was already empty.
 *
 * ## Grio at the centre opens Grio
 *
 * It used to be a reset. That made the one bubble named after the assistant the
 * only one that did not take you to it. Tapping a branch again closes it, which
 * is all the reset this needs.
 *
 * ## What the map never does
 *
 * No bubble executes anything. `Open` navigates and `Ask` seeds a question into
 * Grio's composer. Interest, voice notes and matchmaker requests keep their
 * existing confirmation flows — see `samajhMap.ts`, which is why a node carries
 * `href` and `ask` and nothing else.
 */

const BRANCH_ICON: Record<BranchId, LucideIcon> = {
  today: Home,
  profile: UserRound,
  trust: ShieldCheck,
  discovery: Telescope,
  rishta: Heart,
  family: UsersRound,
};

/**
 * Branch identity as a *surface*, not a fill.
 *
 * These were six saturated gradients under white icons. Six of them on one
 * cream canvas read as a chart of coloured buttons — the colour shouted louder
 * than the rings it was supposed to sit inside, and the gold arms leading to
 * them went unnoticed. A pale ground with the same hue's ink on it, ringed in
 * that hue, says exactly as much about which region a ball belongs to while
 * letting the canvas stay the subject.
 *
 * Every entry carries its own `dark:` pair: a `-100` tint is a bright disc on a
 * near-black page, which is what the earlier gradient at least never was.
 */
const BRANCH_TONE: Record<BranchId, string> = {
  today: "border-[1.5px] border-[#C99A43]/55 bg-[#FBF0DA] text-[#A87524] dark:bg-gold-900/45 dark:text-gold-200 dark:border-gold-600/50",
  profile: "border-[1.5px] border-[#CF7184]/55 bg-[#F9E7EB] text-[#A63A4C] dark:bg-wine-900/55 dark:text-wine-200 dark:border-wine-400/50",
  trust: "border-[1.5px] border-[#167A5A]/45 bg-[#DDF1E7] text-[#167A5A] dark:bg-emerald-900/45 dark:text-emerald-200 dark:border-emerald-500/45",
  discovery: "border-[1.5px] border-[#8A63B8]/50 bg-[#EEE5F8] text-[#6A4491] dark:bg-violet-900/45 dark:text-violet-200 dark:border-violet-400/45",
  rishta: "border-[1.5px] border-[#3A9BD8]/50 bg-[#E2F3FC] text-[#1F6E9E] dark:bg-sky-900/45 dark:text-sky-200 dark:border-sky-400/45",
  family: "border-[1.5px] border-[#D89A5E]/55 bg-[#FBEEE0] text-[#9A6512] dark:bg-amber-900/45 dark:text-amber-200 dark:border-amber-500/45",
};

/**
 * The same six hues, one step paler, for the page bubbles inside a branch.
 *
 * A page bubble's ring is already spoken for — it carries state, which is the
 * whole legend under the canvas — so its *fill* is the only place left to say
 * which branch it came from. Deliberately fainter than `BRANCH_TONE` and
 * without a border: the branch ball has to stay the louder of the two, or the
 * ring stops reading as parent-and-children.
 */
const BRANCH_TONE_SOFT: Record<BranchId, string> = {
  today: "bg-[#FDF8EC] text-[#A87524] dark:bg-gold-900/30 dark:text-gold-200",
  profile: "bg-[#FDF4F6] text-[#A63A4C] dark:bg-wine-900/40 dark:text-wine-200",
  trust: "bg-[#EDF8F2] text-[#167A5A] dark:bg-emerald-900/30 dark:text-emerald-200",
  discovery: "bg-[#F7F2FC] text-[#6A4491] dark:bg-violet-900/30 dark:text-violet-200",
  rishta: "bg-[#F0F9FE] text-[#1F6E9E] dark:bg-sky-900/30 dark:text-sky-200",
  family: "bg-[#FDF6EE] text-[#9A6512] dark:bg-amber-900/30 dark:text-amber-200",
};

/**
 * The same six colours as `BRANCH_TONE`, as SVG strokes for the arms.
 *
 * Two entries are theme variables and four are literal Tailwind values, which
 * looks inconsistent and is not: gold and rose move when an admin switches
 * theme pack (see /admin/theme), and the other four are the fixed palette
 * colours already hard-coded one map above. Anything else would let an arm
 * drift away from the ball it leads to.
 */
const BRANCH_STROKE: Record<BranchId, string> = {
  today: "var(--color-gold-500)",
  profile: "var(--color-rose-500)",
  trust: "#167A5A",
  discovery: "#8A63B8",
  rishta: "#3A9BD8",
  family: "#D89A5E",
};

const NODE_ICON: Record<string, LucideIcon> = {
  dashboard: Home,
  reel: Film,
  vibe: Flame,
  circle: Route,
  "profile-core": UserRound,
  "view-profile": Eye,
  intelligence: Brain,
  "deep-profile": Layers3,
  preferences: SlidersHorizontal,
  plan: CreditCard,
  "verify-contact": MailCheck,
  photos: Camera,
  "trust-score": BadgeCheck,
  "app-setup": Smartphone,
  filters: Search,
  behaviour: Wand2,
  shortlist: Bookmark,
  boost: Rocket,
  matches: Heart,
  interests: Send,
  messages: MessageCircle,
  questions: Bell,
  family: HouseHeart,
  kundli: Orbit,
  biodata: FileUser,
};

/**
 * State is the bubble's ring, not a badge beside it.
 *
 * Twenty-five bubbles cannot each carry a word. The ring colour is the whole
 * signal on the canvas; the number it stands for is in the note card, so
 * nothing here is the *only* place a fact appears.
 */
const STATE_RING: Record<NodeState, string> = {
  done: "ring-trust",
  partial: "ring-gold-500",
  empty: "ring-line-strong",
  locked: "ring-subtle",
};

/**
 * Built from `t` rather than declared as a constant: these four words are the
 * whole legend *and* every bubble's tooltip, so a hard-coded map would be the
 * one place on this screen that never translated.
 */
function stateLabels(t: (key: string, fallback: string) => string): Record<NodeState, string> {
  return {
    done: t("grioMap.state.done", "ho gaya"),
    partial: t("grioMap.state.partial", "chal raha hai"),
    empty: t("grioMap.state.empty", "shuru nahi"),
    locked: t("grioMap.state.locked", "plan me nahi"),
  };
}

/* ------------------------------------------------------------------ */
/* Geometry — percent coordinates inside a square canvas               */
/* ------------------------------------------------------------------ */

function polar(angleDeg: number, radius: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: 50 + radius * Math.cos(rad), y: 50 + radius * Math.sin(rad) };
}

/**
 * Two branch radii, not one.
 *
 * At a single radius the two rings sit 13% apart, which on a 320px phone is
 * ~41px between centres — less than the two balls' combined radii, so a branch
 * overlapped its own children. Pulling the branch ring inward on selection
 * opens that to 19% and animates the relationship at the same time.
 */
/*
 * Radii chosen against the phone, where the canvas is ~343px across, so every
 * number below is really a pixel gap in disguise:
 *
 *   closed  — branch ring at 33% is 113px out; Grio's edge is at 44 and a
 *             branch ball's is 26, leaving 43px of clear cream between them.
 *   open    — the branch ring pulls in to 23% (79px) and the children sit at
 *             43% (147px): 147 − 79 − 26 − 22 = 20px between a parent and its
 *             own child, which is the tightest pair on the canvas and still
 *             above the point where two circles start to look joined.
 *
 * The child ring stays at 43 rather than following the branch ring outward:
 * at 45% a 44px ball reaches 176px on a canvas whose half-width is 171, and
 * the card's `overflow-hidden` would have sliced the far side off.
 */
const BRANCH_RADIUS = 33;
const BRANCH_RADIUS_OPEN = 23;
const CHILD_RADIUS = 43;
/** Set from the *label* width, not the ball's — the name is the wider thing. */
const CHILD_STEP = 27;
function branchAngle(index: number, total: number): number {
  return -90 + (360 / total) * index;
}

function childAngle(parentAngle: number, index: number, count: number): number {
  const span = (count - 1) * CHILD_STEP;
  return parentAngle - span / 2 + index * CHILD_STEP;
}

/*
 * Action bubbles used to orbit the page bubble they belong to. It looked right
 * in a sketch and failed in use: a page bubble already sits on the outer ring
 * between its own siblings and its parent, so a satellite cluster had nowhere
 * to go — facing outward it left the canvas, facing inward it landed on top of
 * the branch bubble, and "Kholo" — the one action that actually navigates —
 * was the one most often buried. Reported as "page open hone ka option nahi aa
 * raha", which is exactly what it looked like.
 *
 * They now sit in a fixed row at the top of the note card: same place every
 * time, never overlapping anything, and `Kholo` always visible. Position
 * memory beats proximity here for the same reason the Reel's action rail is
 * fixed rather than rolling.
 */

/* ------------------------------------------------------------------ */
/* Bubbles                                                             */
/* ------------------------------------------------------------------ */

/**
 * Four tiers, not three, and the new one is the top of the ring.
 *
 * Six branch balls at one size made a wheel with no way in: every ball had the
 * same claim on the eye, so the ring read as six equal options and the answer
 * to "where do I start" was nowhere. The first branch — the one already parked
 * directly above Grio — now leads at `xl`, which is the only change needed to
 * turn a wheel into a path: Grio, the ball above it, then the rest.
 *
 * Sizes step down deliberately (88 · 68 · 52 · 44 · 40) rather than by a scale
 * factor: a phone is where these are read, and the gaps between adjacent tiers
 * have to survive being drawn at 343px across.
 */
type BubbleSize = "xl" | "lg" | "md" | "sm";

const BUBBLE_BOX: Record<BubbleSize, string> = {
  xl: "size-[4.25rem] sm:size-[4.5rem]",
  lg: "size-[3.25rem] sm:size-16",
  md: "size-11 sm:size-[3.25rem]",
  sm: "size-10",
};

const BUBBLE_ICON: Record<BubbleSize, string> = {
  xl: "size-7 sm:size-8",
  lg: "size-[1.375rem] sm:size-7",
  md: "size-4 sm:size-5",
  sm: "size-4",
};

interface BubbleShellProps {
  x: number;
  y: number;
  icon: LucideIcon;
  label?: string;
  /** Fill/ink/border classes from BRANCH_TONE(_SOFT), or null for the plain surface. */
  tone: string | null;
  ring: string;
  size: BubbleSize;
  active?: boolean;
  dimmed?: boolean;
  /** True for the one bubble Grio is pointing at. */
  flagged?: boolean;
  title: string;
  className?: string;
}

/** The visual; `Bubble` and `BubbleLink` share it so a link and a button match. */
function bubbleInner({ icon: Icon, label, tone, ring, size, active, flagged, y }: BubbleShellProps) {
  /*
   * The label sits on whichever side faces *away* from the centre.
   *
   * Always-below put every top-half label between its own bubble and Grio,
   * where the centre bubble simply covered it. Away-from-centre also spreads
   * adjacent labels apart, since siblings either side of the horizontal axis
   * stop stacking their text in the same band.
   */
  const labelAbove = y < 50;
  return (
    <>
      <span
        className={cn(
          // `ring-offset-surface-2`, not `bg-subtle`: the canvas behind these
          // balls is the card's cream gradient now, and a grey offset ring on
          // cream drew a hairline halo around every bubble.
          "grid place-items-center rounded-full ring-2 ring-offset-2 ring-offset-surface-2 transition-all duration-300",
          // Soft shadows only. `md` under twenty-five circles stacked a grey
          // cast over the cream that read as dirt rather than depth; the one
          // ball you have selected is allowed a little more.
          "shadow-sm hover:scale-110 focus-visible:scale-110",
          BUBBLE_BOX[size],
          tone ?? "bg-surface text-primary-text",
          ring,
          active && "scale-110 shadow-[0_6px_18px_rgb(201_169_110_/_0.35)]",
          flagged && "animate-pulse",
        )}
      >
        <Icon className={BUBBLE_ICON[size]} />
      </span>
      {label && (
        <span
          className={cn(
            "absolute left-1/2 block w-14 -translate-x-1/2 text-center text-[0.5625rem] font-semibold leading-tight sm:w-[4.5rem] sm:text-[0.6875rem]",
            labelAbove ? "bottom-full mb-1" : "top-full mt-1",
            active ? "text-ink" : "text-muted",
          )}
        >
          {label}
        </span>
      )}
    </>
  );
}

function bubbleShellClass(props: BubbleShellProps) {
  return cn(
    // `transition-all`, not `transition-opacity`: left/top move when the branch
    // ring pulls inward, and an untweened jump there reads as a glitch rather
    // than as the arm drawing in.
    "absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] focus:outline-none",
    // 50, not 30: at three-tenths a dimmed ball stopped being a ball you had
    // not picked and became one you could no longer see, and the ring it sits
    // on lost its shape the moment anything was selected.
    props.dimmed ? "opacity-50" : "opacity-100",
    props.className,
  );
}

function Bubble(props: BubbleShellProps & { onClick: () => void; pressed?: boolean }) {
  return (
    <button
      type="button"
      data-map-keep
      onClick={props.onClick}
      title={props.title}
      aria-pressed={props.pressed ?? props.active}
      className={bubbleShellClass(props)}
      style={{ left: `${props.x}%`, top: `${props.y}%` }}
    >
      {bubbleInner(props)}
    </button>
  );
}

/**
 * The card's corner ornament — a gold vine in two opposite corners.
 *
 * Drawn rather than tinted: a cream card with a plain border reads as a form
 * field at this size, and the one thing the map is not is a form. Kept at the
 * opacity where you notice it only after the rings, and marked `aria-hidden`
 * with no pointer events so it can never eat a tap meant for a corner control.
 */
function MapOrnament() {
  /*
   * Two fixed-size corner SVGs rather than one stretched across the card: a
   * single `inset-0` sheet has to take the card's proportions, and a vine drawn
   * on a square viewBox and squashed onto a wide card comes out smeared. Sized
   * in rem, placed with `-translate`, so the same drawing lands in the corner of
   * a phone-width card and a max-w-3xl one alike.
   */
  const vine = (
    <g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <path d="M0 14c34 6 58 26 70 54 11 26 3 52-17 63-16 9-35 2-39-13-4-14 6-25 17-24" />
      <path d="M10 4c26 16 40 40 42 69" />
      <path d="M52 24c14 2 24 12 26 25-13 4-25-2-30-15" />
    </g>
  );
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 text-gold-600 opacity-[0.13] dark:opacity-[0.2]">
      <svg viewBox="0 0 90 90" className="absolute right-0 top-0 size-28 -scale-x-100 sm:size-36">{vine}</svg>
      <svg viewBox="0 0 90 90" className="absolute bottom-0 left-0 size-28 -scale-y-100 sm:size-36">{vine}</svg>
    </div>
  );
}

/**
 * A gold rule with a knot in it, under the rail's heading.
 *
 * Typographic furniture, and the one mark on this card that says "wedding"
 * before a word of it has been read — which is the job a plain `<hr>` was never
 * going to do on a matrimony page.
 */
function KnotRule() {
  return (
    <svg aria-hidden viewBox="0 0 120 14" className="mt-4 h-3.5 w-[7.5rem] text-primary">
      <g fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
        <line x1="0" y1="7" x2="38" y2="7" />
        <line x1="82" y1="7" x2="120" y2="7" />
        <path d="M46 7c0-4 6-4 6 0s-6 4-6 0" />
        <path d="M60 3.4c2.4-2.6 6-.6 6 2 0 2.6-6 6-6 6s-6-3.4-6-6c0-2.6 3.6-4.6 6-2" />
        <path d="M74 7c0-4-6-4-6 0s6 4 6 0" />
      </g>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* The map                                                             */
/* ------------------------------------------------------------------ */

/** What the floating note is showing. `note` is the default one-liner. */
type NoteMode = "note" | "more" | "why";

/**
 * `page` is the map on its own address; `embedded` is the map inside another
 * screen (the profile builder's "live" step).
 *
 * The difference is only where the map's own words and tools live. On its own
 * page the card IS the page, so the title, the tagline and the three controls
 * belong on the canvas card — a heading floating above a card and a second
 * heading inside it was the same name printed twice with a border between
 * them. Embedded, the surrounding screen already owns the page's title, so the
 * card keeps its modest one-line header and nothing is claimed twice.
 */
type MapLayout = "page" | "embedded";

export default function GrioSamajhMap({ layout = "embedded" }: { layout?: MapLayout } = {}) {
  const page = layout === "page";
  const t = useT();
  const STATE_LABEL = stateLabels(t);
  const [data, setData] = useState<SamajhMap | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const [openBranch, setOpenBranch] = useState<BranchId | null>(null);
  const [openNode, setOpenNode] = useState<string | null>(null);
  const [noteMode, setNoteMode] = useState<NoteMode>("note");
  const [journeyId, setJourneyId] = useState<string | null>(null);
  const [routesOpen, setRoutesOpen] = useState(false);
  const [nextShown, setNextShown] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);

  const reduced = useReducedMotion();

  useEffect(() => {
    let alive = true;
    fetch("/api/grio/samajh-map")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((json: { ok: boolean; map: SamajhMap }) => {
        if (!alive) return;
        setData(json.map);
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setFailed(true);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const branchOfNode = useMemo(() => {
    const m = new Map<string, BranchId>();
    for (const b of data?.branches ?? []) for (const n of b.nodes) m.set(n.id, b.id);
    return m;
  }, [data]);

  const nodeById = useMemo(() => {
    const m = new Map<string, MapNode>();
    for (const b of data?.branches ?? []) for (const n of b.nodes) m.set(n.id, n);
    return m;
  }, [data]);

  const journey = data?.journeys.find((j) => j.id === journeyId) ?? null;
  const journeyStep = journey && openNode ? journey.nodeIds.indexOf(openNode) : -1;

  const focusNode = useCallback(
    (nodeId: string) => {
      const branch = branchOfNode.get(nodeId);
      if (!branch) return;
      setOpenBranch(branch);
      setOpenNode(nodeId);
      setNoteMode("note");
    },
    [branchOfNode],
  );

  /*
   * Tap anywhere else and the open note closes.
   *
   * A document listener with a selector exclusion, not `stopPropagation` on the
   * bubbles: under the App Router React attaches at `document`, so a handler
   * bound there fires *before* any component's own stopPropagation can matter —
   * the same trap the photo-slide tap bug hit. `data-map-keep` marks the
   * regions a click inside must not close, and everything else closes.
   *
   * The privacy panel is excluded from this entirely — it is a panel with its
   * own controls and its own close button, and dismissing it on a stray tap
   * would throw away whatever the user was reading about their own data.
   */
  useEffect(() => {
    if (!openNode && !nextShown && !routesOpen) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.closest("[data-map-keep]")) return;
      setOpenNode(null);
      setNoteMode("note");
      setNextShown(false);
      setRoutesOpen(false);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [openNode, nextShown, routesOpen]);

  function stepJourney(delta: number) {
    if (!journey) return;
    const at = journeyStep < 0 ? 0 : journeyStep + delta;
    const next = journey.nodeIds[Math.max(0, Math.min(journey.nodeIds.length - 1, at))];
    if (next) focusNode(next);
  }

  if (loading) {
    return (
      <div className="flex min-h-40 items-center justify-center gap-2 rounded-xl border border-line bg-surface-2 text-[0.8125rem] text-muted">
        <Loader2 className="size-4 animate-spin" /> {t("grioMap.loading", "Aapka map ban raha hai…")}
      </div>
    );
  }

  // A failed map earns no error box: the screen it sits on says "your profile
  // is live", and a red panel there reads as though the profile broke.
  if (failed || !data) return null;

  const activeBranch = data.branches.find((b) => b.id === openBranch) ?? null;
  const activeNode = openNode ? nodeById.get(openNode) ?? null : null;
  const journeySet = journey ? new Set(journey.nodeIds) : null;

  /* Rings. */
  const branchRadius = openBranch ? BRANCH_RADIUS_OPEN : BRANCH_RADIUS;
  /*
   * `lead` is the first branch, which `branchAngle` already puts at -90° —
   * straight above Grio. Naming it here rather than testing for `"today"` at
   * the render keeps the rule visual, not lexical: whatever the service puts
   * first is the one the ring starts from, and that is the one drawn larger.
   */
  const placed = data.branches.map((branch, i) => {
    const angle = branchAngle(i, data.branches.length);
    return { branch, angle, lead: i === 0, pos: polar(angle, branchRadius) };
  });

  const activePlacement = placed.find((p) => p.branch.id === openBranch) ?? null;
  const children =
    activePlacement && activeBranch
      ? activeBranch.nodes.map((node, j) => {
          const angle = childAngle(activePlacement.angle, j, activeBranch.nodes.length);
          return { node, angle, pos: polar(angle, CHILD_RADIUS) };
        })
      : [];

  /*
   * The note opens *next to* the bubble it describes.
   *
   * Two earlier tries were wrong in opposite directions. Pinned to the bottom
   * it covered the bubble you had just tapped. Flipped to the far side it no
   * longer covered anything but opened half a canvas away, so the card and its
   * bubble were never in the same glance.
   *
   * Now it hangs directly off the bubble: above it for the lower half of the
   * ring, below it for the upper half, horizontally centred on it and clamped
   * so it cannot leave the canvas. Anchoring the *far* edge — `bottom` for a
   * card that opens upward — is what lets the height stay dynamic; anchoring
   * `top` would need a height nobody has at render time.
   *
   * Width is a percentage of the canvas rather than a rem value so the clamp
   * arithmetic is exact at every screen size instead of correct on one.
   */
  const selectedPos = children.find((c) => c.node.id === openNode)?.pos ?? null;
  // 62%, not 54%: at the narrower figure the card was ~170px on a phone, which
  // is under the four action bubbles' natural width and wrapped the note into a
  // column of two-word lines.
  const NOTE_WIDTH_PCT = 62;
  const NOTE_GAP_PCT = 8;
  const noteOpensUp = selectedPos !== null && selectedPos.y > 50;
  const noteStyle: React.CSSProperties | undefined = selectedPos
    ? {
        width: `${NOTE_WIDTH_PCT}%`,
        left: `${Math.max(2, Math.min(98 - NOTE_WIDTH_PCT, selectedPos.x - NOTE_WIDTH_PCT / 2))}%`,
        ...(noteOpensUp
          ? { bottom: `${100 - selectedPos.y + NOTE_GAP_PCT}%` }
          : { top: `${selectedPos.y + NOTE_GAP_PCT}%` }),
      }
    : undefined;

  /*
   * Actions for the selected page. `Kholo` and `Poochho` navigate, so they are
   * links; the eye and the why only change what this card is showing.
   */
  const actions = activeNode
    ? [
        {
          id: "open",
          icon: ArrowRight,
          label: t("grioMap.action.open", "Kholo"),
          href: activeNode.href,
          title: t("grioMap.action.openTitle", "{label} kholein").replace("{label}", activeNode.label),
        },
        {
          id: "ask",
          icon: Sparkles,
          label: t("grioMap.action.ask", "Poochho"),
          href: `/user/concierge?q=${encodeURIComponent(activeNode.ask)}`,
          title: activeNode.ask,
        },
        {
          id: "more",
          icon: Eye,
          label: t("grioMap.action.more", "Aur"),
          href: null,
          title: t("grioMap.action.moreTitle", "Ye kya karta hai, aur Grio ka daayra"),
        },
        {
          id: "why",
          icon: HelpCircle,
          label: t("grioMap.action.why", "Kyun"),
          href: null,
          title: t("grioMap.action.whyTitle", "Aisa kyun hai"),
        },
      ]
    : [];

  /*
   * The map's three own tools, declared once and drawn twice.
   *
   * On a phone they are bubbles parked in the canvas's corners — the reasoning
   * that put them there has not changed: on a square holding circular rings the
   * corners are the only space already empty. Give the card a second column,
   * though, and the emptiest space is the column itself, so on a wide screen
   * the same three become cards in the rail where there is finally room to say
   * what each one is *for*. One array, so a label or a handler can never drift
   * between the two.
   *
   * `corner` is the placement of the bubble form; `bottom` flips the label
   * under-to-over so it never leaves the canvas.
   */
  const controls = [
    {
      id: "next",
      icon: Sparkles,
      label: t("grioMap.corner.next", "Agla step"),
      hint: data.next ? data.next.reason : t("grioMap.allSet", "Sab kuch set hai"),
      tone: BRANCH_TONE.today,
      active: nextShown,
      disabled: !data.next,
      corner: "left-1 top-1 items-start",
      bottom: false,
      onClick: () => {
        if (!data.next) return;
        setJourneyId(null);
        setRoutesOpen(false);
        setNextShown(true);
        focusNode(data.next.nodeId);
      },
    },
    {
      id: "shield",
      icon: ShieldCheck,
      label: t("grioMap.corner.shield", "Kya jaanta hai"),
      hint: t("grioMap.corner.shieldTitle", "Grio mere baare me kya jaanta hai?"),
      tone: BRANCH_TONE.trust,
      active: false,
      disabled: false,
      corner: "right-1 top-1 items-end",
      bottom: false,
      onClick: () => setPrivacyOpen(true),
    },
    {
      id: "routes",
      icon: Route,
      label: t("grioMap.corner.routes", "Raaste"),
      hint: t("grioMap.corner.routesTitle", "Guided raaste"),
      tone: BRANCH_TONE.rishta,
      active: routesOpen || Boolean(journey),
      disabled: false,
      corner: "left-1 bottom-1 items-start",
      bottom: true,
      onClick: () => setRoutesOpen((v) => !v),
    },
  ];

  /*
   * Canvas grows with depth — one ring needs less room than two. Kept smaller
   * than it wants to be: the note now hangs off its bubble rather than
   * stretching the full width, so the ring no longer has to leave a clear band
   * at the bottom for a card to sit in.
   */
  /*
   * The `sm:` step is where "bahut small dikh raha hai" actually lived. On a
   * phone the cap never binds — the canvas is already the full column width —
   * so raising a single number only ever helped the one screen that was not the
   * problem, the same trap the Reel's `max-w-md` cap fell into. The second
   * value is the one desktop sees.
   */
  /*
   * The `lg:` step exists only for the page layout, where the rail has taken
   * the left third and the canvas would otherwise sit in the middle of the
   * remaining two thirds looking like a thumbnail of itself.
   */
  const canvasWidth = cn(
    activeNode
      ? "max-w-[34rem] sm:max-w-[37rem]"
      : activeBranch
        ? "max-w-[32rem] sm:max-w-[35rem]"
        : "max-w-[26rem] sm:max-w-[30rem]",
    page &&
      (activeNode
        ? "lg:max-w-[38rem] xl:max-w-[42rem]"
        : activeBranch
          ? "lg:max-w-[36rem] xl:max-w-[40rem]"
          : "lg:max-w-[32rem] xl:max-w-[38rem]"),
  );

  const countLine = t("grioMap.headerCount", "{done} of {total} set · ball par tap kijiye")
    .replace("{done}", String(data.totals.settled))
    .replace("{total}", String(data.totals.total));

  const disclaimer = (
    <>
      <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-trust" />
      {/* `min-w-0`: a flex child's min-width is `auto`, so on a phone this
          sentence grew past the card and the last word was sliced off by the
          card's own `overflow-hidden`. */}
      <span className="min-w-0 text-left">
        {t(
          "grioMap.footer",
          "Grio raasta samjhata hai. Rishton ka order matching engine banata hai — faisla aapka aur ghar walon ka.",
        )}
      </span>
    </>
  );

  return (
    <section
      id="grio-samajh-map"
      aria-labelledby="grio-map-title"
      // Full-bleed was the wrong trade. A card with no margin, no radius and
      // no side border is not a card, it is a page — and the map's whole
      // premise is that it sits *on* something. It keeps its frame; the canvas
      // inside reclaims the padding instead (see the column below), and on a
      // phone the card stretches to the full height of the shell so the map is
      // centred on the screen rather than parked at the top of it.
      className={cn(
        "relative overflow-hidden rounded-2xl border border-gold-500/30 bg-grad-card shadow-xl",
        page && "max-lg:flex max-lg:h-full max-lg:flex-col",
      )}
    >
      <MapOrnament />

      {!page && (
        <header className="relative flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-gold-500/25 px-4 py-3 sm:px-5">
          <h2 id="grio-map-title" className="font-display text-lg font-semibold leading-tight text-accent-text">
            {t("grioMap.title", "Grio Samajh Map")}
          </h2>
          <p className="text-[0.75rem] text-muted">{countLine}</p>
        </header>
      )}

      <div
        className={cn(
          "relative",
          // The rail is a fixed 14rem before it is 18rem, and the padding grows
          // with it. At one 19rem rail for every width the canvas — the only
          // thing anybody opened this page for — came out narrower than the
          // column of cards beside it on a laptop.
          page
            ? "grid gap-7 p-5 sm:p-7 max-lg:flex max-lg:flex-1 max-lg:flex-col lg:grid-cols-[14rem_minmax(0,1fr)] lg:items-center lg:gap-6 lg:p-6 xl:grid-cols-[18rem_minmax(0,1fr)] xl:gap-10 xl:p-9"
            : "px-3 py-4 sm:px-5",
        )}
      >
        {page && (
          <aside className="flex flex-col">
            <h2
              id="grio-map-title"
              // The `lg` step is a step *down*: that is where the rail narrows
              // to 14rem, and at 2.5rem "Grio Samajh Map" broke into three
              // lines there — a title taller than the two cards under it.
              className="font-display text-[2rem] font-semibold leading-[1.05] tracking-tight text-balance text-accent-text sm:text-[2.5rem] lg:text-[1.75rem] xl:text-[2.375rem]"
            >
              {t("grioMap.title", "Grio Samajh Map")}
            </h2>

            <KnotRule />

            {/* Desktop only. On a phone this paragraph sat between the title
                and the canvas and pushed the map itself under the fold — and
                the canvas is the sentence, so a sentence describing it is the
                one thing there that can be spared. */}
            {/* Short on purpose. The rail is 14rem on a laptop, and the long
                version spent five lines of it saying what the canvas beside it
                was already showing. */}
            <p className="mt-5 hidden max-w-[19rem] text-[0.9375rem] leading-relaxed text-muted sm:text-base lg:block">
              {t("grioMap.tagline", "Ek hi canvas par — Grio kya samajhta hai, aur aage kya chahiye.")}
            </p>

            {/* Also desktop only, and for the same reason as the tagline: on a
                phone the map has to start as close to the title as it can, and
                every bubble on it already carries its own state. */}
            <p className="mt-4 hidden text-[0.8125rem] font-semibold tracking-wide text-primary-text lg:block">
              {countLine}
            </p>

            {/* The rail's copy of the three controls. Hidden until there is a
                rail: below `lg` this column is just the top of a stacked card,
                and the bubbles in the canvas corners are still the ones on
                screen. */}
            <div className="mt-7 hidden flex-col gap-2.5 lg:flex">
              {controls.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  data-map-keep
                  onClick={c.onClick}
                  disabled={c.disabled}
                  aria-expanded={c.id === "routes" ? routesOpen : undefined}
                  title={c.hint}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border px-3.5 py-3 text-left shadow-sm transition-colors disabled:opacity-50",
                    c.active ? "border-primary bg-primary/10" : "border-line bg-surface/70 hover:bg-surface",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-11 shrink-0 place-items-center rounded-full",
                      c.active ? "bg-accent text-accent-fg" : c.tone,
                    )}
                  >
                    <c.icon className="size-4" />
                  </span>
                  {/* Label only. The sub-line under each of these was a
                      different length on every card, so three buttons that
                      should have looked like one set came out as three
                      different heights. The sentence still lives on `title`,
                      which is where a hint belongs. */}
                  <span className="min-w-0 text-[0.8125rem] font-semibold text-ink">{c.label}</span>
                </button>
              ))}
            </div>

            <p className="mt-8 hidden items-start gap-1.5 text-[0.6875rem] leading-snug text-muted lg:flex">
              {disclaimer}
            </p>
          </aside>
        )}

        {/* On a phone the canvas steps back out of the card's own padding.
            Everything on it is placed in percentages, so the 40px it reclaims
            is 40px of ring — the balls, the arms and the gaps between them all
            grow together. The padding comes back at `sm`, where the card is
            wide enough that edge-to-edge would just look unfinished. */}
        <div
          className={cn(
            "min-w-0",
            // Phone: this column takes whatever height the title leaves and
            // centres the canvas in it, so the map sits in the middle of the
            // card instead of at the top with a band of cream under it.
            page && "-mx-5 sm:mx-0 max-lg:flex max-lg:flex-1 max-lg:flex-col max-lg:justify-center",
          )}
        >
        <div className={cn("relative mx-auto aspect-square w-full transition-[max-width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]", canvasWidth)}>
          {/* Orbit guides, so the rings read as rings before anything is picked.
              Dotted gold rather than a dashed neutral: the arms leaving Grio are
              already gold, and a grey ring crossing them made the canvas look
              like two drawings on the same square.

              Three of them, and the outer one leads nowhere — a single ring with
              one ball on it is a diagram, a field of rings is a map, and the
              cost of the extra ring is a dotted line. The child ring keeps its
              own opacity step (it *does* mean something once a branch is open)
              but no longer starts at zero, so nothing pops into existence. */}
          <span
            aria-hidden
            className="absolute rounded-full border border-dashed border-[#E7D6B8]/70 dark:border-gold-800/70"
            style={{ inset: "2%" }}
          />
          <span
            aria-hidden
            className="absolute rounded-full border border-dashed border-[#E7D6B8] transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] dark:border-gold-800"
            style={{ inset: `${50 - branchRadius}%` }}
          />
          <span
            aria-hidden
            className={cn(
              "absolute rounded-full border border-dashed border-[#E7D6B8] transition-opacity duration-300 dark:border-gold-800",
              activeBranch ? "opacity-100" : "opacity-40",
            )}
            style={{ inset: `${50 - CHILD_RADIUS}%` }}
          />

          {/* Connectors. The canvas is square, so a 0-100 viewBox maps onto it
              without distortion and the arithmetic above is reused as-is.

              Each arm carries its own branch's colour instead of one shared
              grey. A single grey drew a hub-and-spoke chart where the only
              thing telling one region from another was the ball on the end;
              tinting the line lets the arm belong to the region. Kept low —
              these are guides under the bubbles, not the subject. */}
          <svg aria-hidden className="absolute inset-0 size-full" viewBox="0 0 100 100">
            {placed.map(({ branch, pos }) => (
              <line
                key={branch.id}
                x1={50}
                y1={50}
                x2={pos.x}
                y2={pos.y}
                stroke={BRANCH_STROKE[branch.id]}
                strokeWidth={openBranch === branch.id ? 1.75 : 1}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                className="transition-all duration-300"
                opacity={openBranch && openBranch !== branch.id ? 0.16 : openBranch === branch.id ? 0.75 : 0.38}
              />
            ))}
            {activePlacement &&
              children.map(({ node, pos }) => (
                <line
                  key={node.id}
                  x1={activePlacement.pos.x}
                  y1={activePlacement.pos.y}
                  x2={pos.x}
                  y2={pos.y}
                  stroke={BRANCH_STROKE[activePlacement.branch.id]}
                  strokeWidth={1}
                  strokeDasharray="3 4"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                  className="transition-all duration-300"
                  opacity={openNode && openNode !== node.id ? 0.16 : 0.45}
                />
              ))}
          </svg>

          {/* Centre — Grio, and tapping it opens Grio.

              The gold ring is a 3px padded wrapper, not a `ring-*` utility: a
              ring would have to sit outside the glow that already surrounds
              this ball, and two gold circles with a gap between them read as a
              target, not a seal. Both gradients are literal palette colours
              rather than `--bt-accent`/`--bt-primary` — this ball stays wine in
              dark mode and under every theme pack, and `accent` flips to a much
              lighter wine-400 on dark, which took the white lettering with it. */}
          <Link
            href="/user/concierge"
            title={t("grioMap.centreTitle", "Grio se baat karein")}
            // The halo is 4px, not 10. At ten it was a second gold disc around
            // the first, wide enough to reach the inner ring and read as part
            // of the map rather than as light coming off the ball.
            className="absolute left-1/2 top-1/2 z-30 size-[5.25rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-gold-300 via-gold-500 to-gold-600 p-[2px] shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-primary)_10%,transparent)] transition-transform hover:scale-105 sm:size-[6rem]"
          >
            <span className="grid size-full place-content-center rounded-full bg-gradient-to-br from-wine-500 via-wine-700 to-sand-800 text-center">
              <Bot className="mx-auto size-5 text-gold-300" />
              <strong className="mt-0.5 block font-display text-lg leading-none text-white">Grio</strong>
            </span>
          </Link>

          {/* Branch bubbles */}
          {placed.map(({ branch, pos, lead }) => (
            <Bubble
              key={branch.id}
              x={pos.x}
              y={pos.y}
              icon={BRANCH_ICON[branch.id]}
              label={branch.short}
              tone={BRANCH_TONE[branch.id]}
              ring={openBranch === branch.id ? "ring-primary" : "ring-transparent"}
              size={openBranch && openBranch !== branch.id ? "sm" : lead ? "xl" : "lg"}
              active={openBranch === branch.id}
              dimmed={openBranch !== null && openBranch !== branch.id}
              title={`${branch.label} — ${branch.summary}`}
              className="z-10"
              onClick={() => {
                setNextShown(false);
                setOpenNode(null);
                setOpenBranch((c) => (c === branch.id ? null : branch.id));
              }}
            />
          ))}

          {/* Page bubbles */}
          <AnimatePresence>
            {children.map(({ node, pos }, index) => (
              <motion.div
                key={node.id}
                initial={reduced ? false : { opacity: 0, scale: 0.3 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={reduced ? undefined : { opacity: 0, scale: 0.3 }}
                transition={{ duration: 0.28, delay: reduced ? 0 : index * 0.045, type: "spring", bounce: 0.3 }}
              >
                <Bubble
                  x={pos.x}
                  y={pos.y}
                  icon={node.locked ? Lock : NODE_ICON[node.id] ?? Sparkles}
                  label={node.short}
                  // A locked page keeps the plain surface: tinting it with its
                  // branch's colour would make the one bubble you cannot open
                  // look as alive as the ones you can.
                  tone={node.locked ? null : BRANCH_TONE_SOFT[activePlacement!.branch.id]}
                  ring={openNode === node.id ? "ring-primary" : STATE_RING[node.state]}
                  size="md"
                  active={openNode === node.id}
                  dimmed={(openNode !== null && openNode !== node.id) || (Boolean(journeySet) && !journeySet!.has(node.id))}
                  flagged={nextShown && data.next?.nodeId === node.id && openNode !== node.id}
                  title={`${node.label} — ${STATE_LABEL[node.state]}${node.value ? ` (${node.value})` : ""}`}
                  className="z-20"
                  onClick={() => {
                    setNoteMode("note");
                    setOpenNode((c) => (c === node.id ? null : node.id));
                  }}
                />
              </motion.div>
            ))}
          </AnimatePresence>

          {/* ── Corner controls. The map's own tools, as bubbles.
                 On its own page these give way to the rail's cards once there
                 is a rail to give way to — see the `controls` array. ───────── */}
          {controls.map((c) => (
            <div
              key={c.id}
              data-map-keep
              className={cn(
                "absolute z-40 flex flex-col gap-1",
                c.corner,
                c.bottom && "flex-col-reverse",
                page && "lg:hidden",
              )}
            >
              <button
                type="button"
                onClick={c.onClick}
                disabled={c.disabled}
                aria-expanded={c.id === "routes" ? routesOpen : undefined}
                title={c.hint}
                className={cn(
                  "grid size-10 place-items-center rounded-full shadow-md transition-transform hover:scale-110 disabled:opacity-40 sm:size-11",
                  c.active ? "bg-accent text-accent-fg ring-2 ring-primary" : c.tone,
                )}
              >
                <c.icon className="size-4" />
              </button>
              <span className="w-14 text-center text-[0.5625rem] font-semibold leading-tight text-muted sm:text-[0.625rem]">
                {c.label}
              </span>
            </div>
          ))}

          {/* ── Route picker, in canvas ──────────────────────────────────── */}
          <AnimatePresence>
            {routesOpen && (
              <motion.div
                initial={reduced ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduced ? undefined : { opacity: 0, y: 8 }}
                data-map-keep className="absolute inset-x-2 bottom-2 z-50 rounded-lg border border-line bg-surface p-2 shadow-xl"
              >
                <div className="flex flex-wrap gap-1.5">
                  {data.journeys.map((j) => (
                    <button
                      key={j.id}
                      type="button"
                      onClick={() => {
                        if (journeyId === j.id) {
                          setJourneyId(null);
                          setRoutesOpen(false);
                          return;
                        }
                        setJourneyId(j.id);
                        setNextShown(false);
                        setRoutesOpen(false);
                        if (j.nodeIds[0]) focusNode(j.nodeIds[0]);
                      }}
                      aria-pressed={journeyId === j.id}
                      className={cn(
                        "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-2.5 text-[0.6875rem] font-medium transition-colors",
                        journeyId === j.id ? "border-primary bg-primary/10 text-primary-text" : "border-line bg-bg-subtle text-muted hover:bg-surface",
                      )}
                    >
                      {j.label}
                      <span className="text-[0.5625rem] opacity-70">{j.nodeIds.length}</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── The note. Small by default; the eye is what makes it long. ── */}
          <AnimatePresence mode="wait">
            {!routesOpen && (activeNode || (nextShown && data.next) || journey) && (
              <motion.div
                key={`${activeNode?.id ?? "next"}-${noteMode}`}
                initial={reduced ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduced ? undefined : { opacity: 0, y: 6 }}
                transition={{ duration: 0.2 }}
                data-map-keep
                style={noteStyle}
                className={cn(
                  "absolute z-40 max-h-[58%] overflow-y-auto rounded-lg border border-line bg-surface/95 p-2 shadow-xl backdrop-blur-sm",
                  // The next-step and journey cards have no bubble to hang off
                  // yet, so they keep the old full-width footing.
                  !noteStyle && "inset-x-2 bottom-2 sm:inset-x-6",
                )}
              >
                {journey && (
                  <div className="mb-1.5 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => stepJourney(-1)}
                      disabled={journeyStep <= 0}
                      className="grid size-7 shrink-0 place-items-center rounded-full text-primary-text transition-colors hover:bg-primary/10 disabled:opacity-30"
                      aria-label={t("grioMap.journey.prev", "Pichhla")}
                    >
                      <ChevronLeft className="size-3.5" />
                    </button>
                    <span className="min-w-0 flex-1 truncate text-center text-[0.625rem] font-semibold text-primary-text">
                      {journey.label} · {Math.max(journeyStep, 0) + 1}/{journey.nodeIds.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => stepJourney(1)}
                      disabled={journeyStep >= journey.nodeIds.length - 1}
                      className="grid size-7 shrink-0 place-items-center rounded-full text-primary-text transition-colors hover:bg-primary/10 disabled:opacity-30"
                      aria-label={t("grioMap.journey.next", "Agla")}
                    >
                      <ChevronRight className="size-3.5" />
                    </button>
                  </div>
                )}

                {activeNode ? (
                  <>
                    {/* The action rail. Bubbles, but in a fixed row — see the
                        note above `branchAngle` for why they no longer orbit. */}
                    <div className="mb-1.5 flex items-start justify-between gap-1 border-b border-line pb-1.5">
                      {actions.map((a) =>
                        a.href ? (
                          <Link
                            key={a.id}
                            href={a.href}
                            title={a.title}
                            className="flex min-w-0 flex-1 flex-col items-center gap-0.5"
                          >
                            <span className="grid size-8 place-items-center rounded-full bg-gradient-to-br from-accent to-primary text-accent-fg shadow-md transition-transform hover:scale-110">
                              <a.icon className="size-3.5" />
                            </span>
                            <span className="text-center text-[0.5rem] font-semibold leading-tight text-ink sm:text-[0.5625rem]">{a.label}</span>
                          </Link>
                        ) : (
                          <button
                            key={a.id}
                            type="button"
                            title={a.title}
                            aria-pressed={noteMode === a.id}
                            onClick={() => setNoteMode((m) => (m === a.id ? "note" : (a.id as NoteMode)))}
                            className="flex min-w-0 flex-1 flex-col items-center gap-0.5"
                          >
                            <span
                              className={cn(
                                "grid size-8 place-items-center rounded-full bg-bg-subtle text-ink ring-2 transition-transform hover:scale-110",
                                noteMode === a.id ? "ring-primary" : "ring-line",
                              )}
                            >
                              <a.icon className="size-3.5" />
                            </span>
                            <span className="text-center text-[0.5rem] font-semibold leading-tight text-muted sm:text-[0.5625rem]">{a.label}</span>
                          </button>
                        ),
                      )}
                    </div>

                    <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <strong className="text-[0.8125rem] leading-tight text-ink">{activeNode.label}</strong>
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 text-[0.5625rem] font-semibold",
                          activeNode.state === "done"
                            ? "bg-trust-bg text-trust"
                            : activeNode.state === "partial"
                              ? "bg-gold-100 text-gold-700 dark:bg-gold-900/45 dark:text-gold-200"
                              : "bg-bg-subtle text-muted",
                        )}
                      >
                        {activeNode.value ?? STATE_LABEL[activeNode.state]}
                      </span>
                      {activeNode.plan && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-warn-bg px-1.5 py-0.5 text-[0.5625rem] font-semibold text-warn">
                          <Lock className="size-2.5" />
                          {t("grioMap.planLocked", "{plan} plan").replace("{plan}", activeNode.plan)}
                        </span>
                      )}
                    </p>

                    {noteMode === "note" && (
                      <>
                        <p className="mt-1 text-[0.75rem] leading-snug text-muted">{activeNode.note}</p>
                        {activeNode.unlocks && (
                          <p className="mt-1 text-[0.75rem] leading-snug text-trust">{activeNode.unlocks}</p>
                        )}
                      </>
                    )}

                    {noteMode === "why" && (
                      <p className="mt-1 border-l-2 border-info pl-2 text-[0.75rem] leading-snug text-info">{activeNode.why}</p>
                    )}

                    {noteMode === "more" && (
                      <div className="mt-1 space-y-1">
                        <p className="text-[0.75rem] leading-snug text-ink">{activeNode.does}</p>
                        <p className="text-[0.6875rem] leading-snug text-muted">
                          <span className="font-semibold text-info">{t("grioMap.access.reads", "Grio padhta hai:")}</span>{" "}
                          {activeNode.grioReads}
                        </p>
                        <p className="text-[0.6875rem] leading-snug text-muted">
                          <span className="font-semibold text-primary-text">{t("grioMap.access.does", "Kar sakta hai:")}</span>{" "}
                          {activeNode.grioDoes}
                        </p>
                        <p className="text-[0.6875rem] leading-snug text-muted">
                          <span className="font-semibold text-trust">{t("grioMap.access.private", "Private:")}</span>{" "}
                          {activeNode.grioPrivate}
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  data.next && <p className="text-[0.75rem] leading-snug text-ink">{data.next.reason}</p>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Privacy Inspector, over the canvas ───────────────────────── */}
          <AnimatePresence>
            {privacyOpen && (
              <motion.div
                initial={reduced ? false : { opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={reduced ? undefined : { opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.22 }}
                data-map-keep className="absolute inset-0 z-50 overflow-y-auto rounded-lg border border-line bg-surface shadow-2xl"
              >
                <GrioPrivacyPanel onClose={() => setPrivacyOpen(false)} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* The four-word ring legend that used to sit here is gone.
            Four colour swatches under a canvas of twenty-five balls read as a
            key to a chart, and it was the one row on the card that looked like
            documentation. Nothing it said is lost: every bubble's `title` still
            names its state on hover, and tapping one puts the state — with its
            value — in the note card's pill, which is where somebody asking
            "what about this one" is already looking.

            The disclaimer stays, but only where it has not already been said:
            the page layout puts it at the foot of the rail. */}
        {/* No rule above this any more. With the legend gone there was one
            sentence under the divider, and a horizontal line drawn across the
            card to separate a single quiet line from the map is more furniture
            than the thing it was framing. */}
        {/* Page layout drops this entirely: the rail already carries it on a
            wide screen, and on a phone three lines of legal footing under a
            full-bleed canvas were the only thing left keeping the map off the
            screen it now fills. */}
        <div className={cn("mt-3", page && "hidden")}>
          <p className="flex items-start justify-center gap-1.5 text-[0.6875rem] leading-snug text-muted">
            {disclaimer}
          </p>
        </div>
        </div>
      </div>
    </section>
  );
}
