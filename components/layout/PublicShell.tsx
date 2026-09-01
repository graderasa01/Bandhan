import type { ReactNode } from "react";
import PublicHeader from "@/components/layout/PublicHeader";
import PublicFooter from "@/components/layout/PublicFooter";

/**
 * The marketing site's frame: warm paper, header, content, footer.
 *
 * `bt-canvas` is the skin's token island and `bt-paper` is the paper it
 * paints (both in app/globals.css, section `THE BANDHANTAK CANVAS`). It wraps the
 * header and footer too, not just the page body — the header is transparent
 * until you scroll, so leaving it outside the island shows a strip of the
 * app's cold near-white above the cream.
 *
 * This exists so "put a public page on the marketing skin" is one import
 * rather than a wrapper div copy-pasted into eleven route files, each free to
 * drift. Anything that renders PublicHeader should render this instead.
 *
 * ⚠️  Nothing here may take `overflow`, `transform`, `filter` or
 * `backdrop-filter`. PublicHeader is `position: sticky` and its mobile sheet
 * is `position: fixed`; any of those on an ancestor makes this div their
 * containing block and both stop behaving.
 */
export default function PublicShell({
  children,
  /** Slot above the page body — the mock-data banner on the home page. */
  banner,
  /** The home page drops the footer on phones; nobody else does. */
  footerClassName,
}: {
  children: ReactNode;
  banner?: ReactNode;
  footerClassName?: string;
}) {
  return (
    <div className="bt-canvas bt-paper min-h-dvh">
      <PublicHeader />
      {banner}
      {children}
      <PublicFooter className={footerClassName} />
    </div>
  );
}
