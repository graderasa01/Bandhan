import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The column a page's content stands in.
 *
 * It owns the things every page used to re-declare: the safe width, the side
 * gutters (including a notch's), the bottom inset above a home indicator, and
 * the page's text colour. The ambience and the theme scope come from the shell
 * above it (`AmbientBackground`, `.bt-glass`), so a page never paints its own
 * ground — that is what keeps one background world across the product.
 *
 *   narrow    a single column to read or fill in: auth, a form, a report
 *   default   most pages
 *   wide      dashboards and grids
 *   full      the page manages its own width (a map, a reel, a table view)
 */
export default function PageShell({
  width = "default",
  className,
  children,
}: {
  width?: "narrow" | "default" | "wide" | "full";
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "bt-page",
        width === "narrow" && "bt-page--narrow",
        width === "default" && "bt-page--default",
        width === "wide" && "bt-page--wide",
        width === "full" && "bt-page--full",
        className,
      )}
    >
      {children}
    </div>
  );
}
