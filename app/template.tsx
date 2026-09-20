import type { ReactNode } from "react";

/**
 * Every navigation arrives as a card laid on the one before it.
 *
 * A `template` (not a layout) is what makes this possible: Next mounts a fresh
 * instance of it on every navigation, so the CSS animation in `.bt-page-enter`
 * runs again each time without a single line of client JavaScript — no
 * framer-motion on the critical path, nothing to hydrate, and nothing that can
 * desync from the router.
 *
 * The movement is deliberately small: a short rise, a hair of scale and one
 * degree of tilt away from the viewer, so the new page reads as a pane sliding
 * over the room rather than as a screen wipe. It ends at `transform: none` on
 * purpose — a lingering transform would make this element the containing block
 * for every `position: fixed` child (the bottom nav, the composer, the profile
 * sheet), and those must stay pinned to the viewport.
 *
 * Reduced motion keeps the fade and drops the movement (globals.css).
 */
export default function Template({ children }: { children: ReactNode }) {
  return <div className="bt-page-enter">{children}</div>;
}
