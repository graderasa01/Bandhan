import { cn } from "@/lib/utils";
import AppBackground, { type AppBackgroundVariant } from "@/components/theme/AppBackground";

/**
 * The room every BandhanTak screen stands in — whichever one the person picked.
 *
 * There are four now, chosen by `data-glass` on <html> (see `ThemeToggle` and
 * the pre-paint script in app/layout.tsx):
 *
 *   terrace  the default. The satin room — `AppBackground`.
 *   ivory    the day room: graphite and plum, a breath of champagne.
 *   gold     the night room: lamp-lit, champagne bokeh.
 *   paper    the classic: no room at all. Both of the rooms below are hidden
 *            and the cream page is the ground (see THE PAPER ROOM in
 *            globals.css) — a drawn room behind paper is just a picture
 *            somebody left under the page.
 *
 * ## Why this renders both and lets CSS choose
 *
 * `data-glass` is server-rendered from a cookie, so the honest thing would be
 * to read that cookie here and render one room. This component cannot: half its
 * callers (`AppShell`, `OnboardingShell`, `AdminLoginView`) are client
 * components, and a server-only API in their tree is a build error. Threading
 * the value through every shell would touch every page — the exact cost this
 * component exists to avoid.
 *
 * So both markups ship and two CSS rules pick. The cost is one hidden subtree:
 * four spans on the default theme, and the terrace's drawing on the other two.
 * `display: none` means it is parsed but never laid out or painted.
 *
 * ## Where it goes
 *
 * At the top of a shell, as a sibling of the content, inside an element that
 * establishes a stacking context (`.bt-glass` does, and the shells add
 * `isolate`). Both rooms paint at `z-index: -1`; without a stacking context
 * they sink behind the document background and vanish.
 *
 * ## The variants
 *
 *   default  the room at full strength.
 *   soft     dimmer, for pages that are mostly reading.
 *   deep     darker still, for long dense screens (tables, admin).
 *   focus    one pool behind the middle: auth, onboarding, a single card.
 *   hearth   asked for by name by `/bolo`. It no longer means a palette of its
 *            own — there is one terrace now — so it maps to `default`.
 *
 * New code should import `AppBackground` directly and pick its own weight;
 * this stays for the ~20 call sites that predate the terrace.
 */
export type AmbientVariant = "default" | "soft" | "deep" | "focus" | "hearth";

const WEIGHT: Record<AmbientVariant, AppBackgroundVariant> = {
  default: "default",
  hearth: "default",
  soft: "soft",
  deep: "deep",
  focus: "focus",
};

export default function AmbientBackground({
  variant = "default",
  className,
}: {
  variant?: AmbientVariant;
  className?: string;
}) {
  return (
    <>
      <AppBackground variant={WEIGHT[variant]} className={className} />
      <div
        className={cn(
          "bt-ambience",
          variant === "soft" && "bt-ambience--soft",
          variant === "deep" && "bt-ambience--deep",
          variant === "focus" && "bt-ambience--focus",
          variant === "hearth" && "bt-ambience--hearth",
          className,
        )}
        aria-hidden
      >
        <span className="bt-ambience__room" />
        <span className="bt-ambience__lights" />
        <span className="bt-ambience__lights bt-ambience__lights--near" />
        <span className="bt-ambience__veil" />
      </div>
    </>
  );
}
