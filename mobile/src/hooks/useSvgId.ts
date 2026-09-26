import { useId } from "react";

/**
 * A gradient id unique to this SVG instance.
 *
 * On the web every screen in the navigation stack stays in the DOM (hidden),
 * and `url(#id)` resolves to the *first* element with that id — so two copies
 * of a drawing sharing an id paint nothing once the first copy is hidden.
 * Native scopes ids per <Svg>, but unique ids are correct on both.
 */
export function useSvgId(prefix: string): string {
  return `${prefix}-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
}
