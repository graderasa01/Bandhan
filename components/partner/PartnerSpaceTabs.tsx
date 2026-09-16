import Link from "next/link";
import { PARTNER_NAV_GROUPS, groupItems, type PartnerNavGroup } from "@/components/layout/partnerNavItems";
import { getT } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";

/**
 * The tabs across the top of a partner space — Families, Work, Earnings.
 *
 * Built from the same `partnerNavItems.ts` rows the sidebar lists, so a page
 * can never offer a tab the navigation does not know about, and a partner
 * moves between four places instead of hunting through fifteen pages.
 * Server-rendered links: switching tabs is a navigation, not client state, so
 * it costs nothing in the bundle.
 */
export default async function PartnerSpaceTabs({
  space,
  current,
  className,
}: {
  space: Exclude<PartnerNavGroup["id"], "today">;
  /** The href of the page rendering the tabs — marked as the current one. */
  current: string;
  /** To match the page's own content width; defaults to `max-w-2xl`. */
  className?: string;
}) {
  const t = await getT();
  const group = PARTNER_NAV_GROUPS.find((g) => g.id === space);
  const items = group ? groupItems(group) : [];
  if (!group || items.length < 2) return null;

  return (
    <nav aria-label={t(group.key, group.label)} className={cn("mx-auto mb-5 max-w-2xl", className)}>
      <ul className="flex gap-2 overflow-x-auto pb-1">
        {items.map((item) => {
          const active = item.href === current;
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-sm font-medium transition-colors",
                  active
                    ? "border-gold-500 bg-gold-50 text-gold-800 dark:bg-gold-900/30 dark:text-gold-200"
                    : "border-line bg-surface text-muted hover:border-gold-400 hover:text-ink",
                )}
              >
                <item.icon className="size-4" aria-hidden />
                {t(item.key, item.label)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
