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

const BRANCH_TONE: Record<BranchId, string> = {
  today: "from-gold-400 to-gold-600",
  profile: "from-rose-400 to-rose-600",
  trust: "from-emerald-400 to-emerald-600",
  discovery: "from-violet-400 to-violet-600",
  rishta: "from-sky-400 to-sky-600",
  family: "from-amber-400 to-amber-600",
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
  trust: "#10b981",
  discovery: "#8b5cf6",
  rishta: "#0ea5e9",
  family: "#f59e0b",
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
const BRANCH_RADIUS = 31;
const BRANCH_RADIUS_OPEN = 24;
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

type BubbleSize = "lg" | "md" | "sm";

const BUBBLE_BOX: Record<BubbleSize, string> = {
  lg: "size-14 sm:size-16",
  md: "size-11 sm:size-[3.25rem]",
  sm: "size-9 sm:size-10",
};

const BUBBLE_ICON: Record<BubbleSize, string> = {
  lg: "size-6 sm:size-7",
  md: "size-4 sm:size-5",
  sm: "size-3.5 sm:size-4",
};

interface BubbleShellProps {
  x: number;
  y: number;
  icon: LucideIcon;
  label?: string;
  /** Gradient classes for a branch bubble, or null for the plainer styling. */
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
          "grid place-items-center rounded-full ring-2 ring-offset-2 ring-offset-bg-subtle transition-all duration-300",
          "shadow-md hover:scale-110 focus-visible:scale-110",
          BUBBLE_BOX[size],
          tone ? `bg-gradient-to-br ${tone} text-white` : "bg-surface text-primary-text",
          ring,
          active && "scale-110 shadow-xl",
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
    props.dimmed ? "opacity-30" : "opacity-100",
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

/* ------------------------------------------------------------------ */
/* The map                                                             */
/* ------------------------------------------------------------------ */

/** What the floating note is showing. `note` is the default one-liner. */
type NoteMode = "note" | "more" | "why";

export default function GrioSamajhMap() {
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
  const placed = data.branches.map((branch, i) => {
    const angle = branchAngle(i, data.branches.length);
    return { branch, angle, pos: polar(angle, branchRadius) };
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
  const canvasWidth = activeNode
    ? "max-w-[34rem] sm:max-w-[37rem]"
    : activeBranch
      ? "max-w-[32rem] sm:max-w-[35rem]"
      : "max-w-[26rem] sm:max-w-[30rem]";

  return (
    <section
      id="grio-samajh-map"
      aria-labelledby="grio-map-title"
      className="overflow-hidden rounded-xl border border-line bg-bg-subtle shadow-lg"
    >
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line bg-surface px-4 py-3 sm:px-5">
        <h2 id="grio-map-title" className="text-base leading-tight">
          {t("grioMap.title", "Grio Samajh Map")}
        </h2>
        <p className="text-[0.75rem] text-muted">
          {t("grioMap.headerCount", "{done} of {total} set · ball par tap kijiye")
            .replace("{done}", String(data.totals.settled))
            .replace("{total}", String(data.totals.total))}
        </p>
      </header>

      <div className="px-3 py-4 sm:px-5">
        <div className={cn("relative mx-auto aspect-square w-full transition-[max-width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]", canvasWidth)}>
          {/* Orbit guides, so the rings read as rings before anything is picked.
              `line-strong` rather than `line`: at the lighter value the ring was
              close enough to the card behind it to disappear on a phone. */}
          <span
            aria-hidden
            className="absolute rounded-full border border-dashed border-line-strong transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{ inset: `${50 - branchRadius}%` }}
          />
          <span
            aria-hidden
            className={cn(
              "absolute rounded-full border border-dashed border-line-strong transition-opacity duration-300",
              activeBranch ? "opacity-100" : "opacity-0",
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
                strokeWidth={openBranch === branch.id ? 2 : 1.25}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                className="transition-all duration-300"
                opacity={openBranch && openBranch !== branch.id ? 0.2 : openBranch === branch.id ? 0.9 : 0.5}
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
                  strokeWidth={1.25}
                  strokeDasharray="3 3"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                  className="transition-all duration-300"
                  opacity={openNode && openNode !== node.id ? 0.2 : 0.6}
                />
              ))}
          </svg>

          {/* Centre — Grio, and tapping it opens Grio. */}
          <Link
            href="/user/concierge"
            title={t("grioMap.centreTitle", "Grio se baat karein")}
            className="absolute left-1/2 top-1/2 z-30 grid size-[4.75rem] -translate-x-1/2 -translate-y-1/2 place-content-center rounded-full bg-gradient-to-br from-accent to-primary text-center text-accent-fg shadow-[0_0_0_8px_color-mix(in_srgb,var(--color-primary)_10%,transparent)] transition-transform hover:scale-105 sm:size-[5.5rem]"
          >
            <Bot className="mx-auto size-5" />
            <strong className="mt-0.5 block font-display text-lg leading-none">Grio</strong>
          </Link>

          {/* Branch bubbles */}
          {placed.map(({ branch, pos }) => (
            <Bubble
              key={branch.id}
              x={pos.x}
              y={pos.y}
              icon={BRANCH_ICON[branch.id]}
              label={branch.short}
              tone={BRANCH_TONE[branch.id]}
              ring={openBranch === branch.id ? "ring-primary" : "ring-transparent"}
              size={openBranch && openBranch !== branch.id ? "sm" : "lg"}
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
                  tone={null}
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

          {/* ── Corner controls. The map's own tools, as bubbles. ────────── */}
          <div data-map-keep className="absolute left-0 top-0 z-40 flex flex-col items-start gap-1">
            <button
              type="button"
              onClick={() => {
                if (!data.next) return;
                setJourneyId(null);
                setRoutesOpen(false);
                setNextShown(true);
                focusNode(data.next.nodeId);
              }}
              disabled={!data.next}
              title={data.next ? data.next.reason : t("grioMap.allSet", "Sab kuch set hai")}
              className={cn(
                "grid size-10 place-items-center rounded-full shadow-md transition-transform hover:scale-110 disabled:opacity-40 sm:size-11",
                nextShown ? "bg-accent text-accent-fg ring-2 ring-primary" : "bg-gradient-to-br from-gold-400 to-gold-600 text-white",
              )}
            >
              <Sparkles className="size-4" />
            </button>
            <span className="w-14 text-center text-[0.5625rem] font-semibold leading-tight text-muted sm:text-[0.625rem]">
              {t("grioMap.corner.next", "Agla step")}
            </span>
          </div>

          <div data-map-keep className="absolute right-0 top-0 z-40 flex flex-col items-end gap-1">
            <button
              type="button"
              onClick={() => setPrivacyOpen(true)}
              title={t("grioMap.corner.shieldTitle", "Grio mere baare me kya jaanta hai?")}
              className="grid size-10 place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-md transition-transform hover:scale-110 sm:size-11"
            >
              <ShieldCheck className="size-4" />
            </button>
            <span className="w-14 text-center text-[0.5625rem] font-semibold leading-tight text-muted sm:text-[0.625rem]">
              {t("grioMap.corner.shield", "Kya jaanta hai")}
            </span>
          </div>

          <div data-map-keep className="absolute left-0 bottom-0 z-40 flex flex-col items-start gap-1">
            <span className="w-14 text-center text-[0.5625rem] font-semibold leading-tight text-muted sm:text-[0.625rem]">
              {t("grioMap.corner.routes", "Raaste")}
            </span>
            <button
              type="button"
              onClick={() => setRoutesOpen((v) => !v)}
              aria-expanded={routesOpen}
              title={t("grioMap.corner.routesTitle", "Guided raaste")}
              className={cn(
                "grid size-10 place-items-center rounded-full shadow-md transition-transform hover:scale-110 sm:size-11",
                routesOpen || journey ? "bg-accent text-accent-fg ring-2 ring-primary" : "bg-gradient-to-br from-sky-400 to-sky-600 text-white",
              )}
            >
              <Route className="size-4" />
            </button>
          </div>

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

        {/* One quiet strip under the canvas: the ring legend (cheaper than a
            legend panel, and directly under the thing it describes) and the
            scope disclaimer. Together inside one divider rather than stacked as
            two separate bars — as two, the bottom of the card carried more
            horizontal rules than the map above it had rings. */}
        <div className="mt-3 space-y-1.5 border-t border-line pt-2">
          <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[0.625rem] text-subtle">
            <span className="inline-flex items-center gap-1"><i className="size-2 rounded-full bg-trust" /> {STATE_LABEL.done}</span>
            <span className="inline-flex items-center gap-1"><i className="size-2 rounded-full bg-gold-500" /> {STATE_LABEL.partial}</span>
            <span className="inline-flex items-center gap-1"><i className="size-2 rounded-full bg-line-strong" /> {STATE_LABEL.empty}</span>
            <span className="inline-flex items-center gap-1"><i className="size-2 rounded-full bg-subtle" /> {STATE_LABEL.locked}</span>
          </p>
          <p className="flex items-start justify-center gap-1.5 text-[0.6875rem] leading-snug text-muted">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-trust" />
            <span className="text-left">
              {t(
                "grioMap.footer",
                "Grio raasta samjhata hai. Rishton ka order matching engine banata hai — faisla aapka aur ghar walon ka.",
              )}
            </span>
          </p>
        </div>
      </div>
    </section>
  );
}
