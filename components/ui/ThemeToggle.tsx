"use client";

import { useEffect, useState } from "react";
import { Feather, Moon, Sparkles, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "bt-glass";

/**
 * The room switch — which of the product's four looks you are in.
 *
 *   terrace  the default: the satin room, champagne and wine behind clear
 *            glass. This is the look the product is designed to.
 *   ivory    the day room: graphite and plum, neutral panes.
 *   gold     the night room: lamp-lit, champagne bokeh.
 *   paper    the classic: cream paper, wine ink, gold rule — the look that is
 *            live on bandhantak.com, kept as a room of its own so the product
 *            can still be seen the way it shipped.
 *
 * All four are the same material system; only the light, the ground and the
 * thickness of the pane change. `paper` is the one that is a LIGHT room, and
 * it is the only value that turns the `dark:` variant off (see the
 * `@custom-variant dark` line at the top of globals.css) — which is why it can
 * be a real light theme without a single component knowing about it.
 *
 * ## Why a cycle and not a menu
 *
 * This button sits in eight different headers, several of them a 40px slot in a
 * crowded bar, and a popover would have to be positioned correctly in every one
 * of them. A cycle needs no layer and no positioning, and at four stops it is
 * still three taps to anywhere. The label always names what the NEXT press
 * gives you, so nothing depends on recognising the current icon.
 *
 * It writes three things: `data-glass` on <html>, which every token in the
 * glass scope reads; a cookie, which is what the server renders from on the
 * next navigation, so the room survives a full page load; and localStorage,
 * which the pre-paint script in app/layout.tsx reads first. That script applies
 * the same values before first paint — this only has to stay in sync with it.
 */
type Glass = "terrace" | "ivory" | "gold" | "paper";

const ORDER: Glass[] = ["terrace", "ivory", "gold", "paper"];

const LABEL: Record<Glass, string> = {
  terrace: "Satin",
  ivory: "Day",
  gold: "Night",
  paper: "Classic",
};

const ICON: Record<Glass, typeof Sun> = {
  terrace: Sparkles,
  ivory: Sun,
  gold: Moon,
  paper: Feather,
};

function isGlass(value: string | undefined): value is Glass {
  return value === "terrace" || value === "ivory" || value === "gold" || value === "paper";
}

export default function ThemeToggle({ className }: { className?: string }) {
  // `terrace` and not `null`: the server renders that room by default, and a
  // first paint of the wrong icon is the one thing this component can get
  // visibly wrong. `mounted` still gates the icon, for the case where the
  // cookie says otherwise.
  const [glass, setGlass] = useState<Glass>("terrace");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const current = document.documentElement.dataset.glass;
    if (isGlass(current)) setGlass(current);
  }, []);

  function step() {
    const next = ORDER[(ORDER.indexOf(glass) + 1) % ORDER.length];
    setGlass(next);
    const root = document.documentElement;
    root.dataset.glass = next;
    document.cookie = `bt-glass=${next};path=/;max-age=31536000;samesite=lax`;
    // Three of the four rooms are dark grounds, so the class stays on for them
    // and every `dark:` style in the app keeps applying. `paper` is the light
    // one and drops it — though the class alone is no longer what decides:
    // the `dark` variant is also gated on `data-glass` in globals.css, because
    // a dozen shells write `dark` into their own className and nothing here
    // can reach those.
    root.classList.toggle("dark", next !== "paper");
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage blocked — the room still applies for this session and the
         cookie still carries it to the next navigation */
    }
  }

  const Icon = ICON[glass];
  const next = ORDER[(ORDER.indexOf(glass) + 1) % ORDER.length];

  return (
    <button
      type="button"
      onClick={step}
      aria-label={`${LABEL[next]} theme on karein`}
      title={`${LABEL[glass]} theme — ${LABEL[next]} par jaane ke liye tap karein`}
      className={cn(
        // visually 40px, 48px hit area (D-23)
        "touch-target grid size-10 place-items-center rounded-full border border-line bg-surface text-muted",
        "transition-colors hover:border-gold-500 hover:text-primary-text",
        "focus-visible:ring-2 focus-visible:ring-gold-600 focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        className,
      )}
    >
      {mounted ? <Icon className="size-[18px]" /> : <Sparkles className="size-[18px]" />}
    </button>
  );
}
