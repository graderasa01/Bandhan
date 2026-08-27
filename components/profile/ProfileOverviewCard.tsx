"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, Check, ChevronDown, ChevronRight } from "lucide-react";
import { categoryProgress, type CategoryProgress } from "@/lib/profile/fieldGroups";
import { CATEGORY_ICON } from "@/components/profile/categoryIcons";
import { RuleMotif } from "@/components/public/_shared/Ornaments";
import { catalogKey } from "@/lib/i18n/catalogKeys";
import type { ProfileValues } from "@/lib/profile/stages";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * What's left on the profile, grouped — and the way back to each gap.
 *
 * ## The loop this card exists to close
 *
 * It used to render one flat run of chips: every unanswered field in the
 * catalog, required-first, capped at eight with a "6 aur dikhayein". Tapping
 * one opened the swipe deck on that field — and then the deck kept going
 * through *the entire catalog*, answered fields included. So filling one thing
 * meant swiping past a dozen cards you had already done, and leaving meant
 * landing on the onboarding screen rather than back at the list. Nobody fills
 * a second field that way.
 *
 * Now each chip carries its category and a `return` back to this card, and the
 * deck it opens is scoped to that category's *unanswered* fields only (see
 * `selectDeckFields` in ManualProfileFormMobile). Fill, land back here, pick
 * the next one — that is the loop.
 *
 * ## Why categories rather than a longer flat list
 *
 * Thirty-nine fields in one list is a list nobody reads to the end, which is
 * what the "show 8, then the rest" cap was really admitting. Grouping does
 * two things a cap cannot: it lets someone deliberately go and finish partner
 * preferences in one sitting (nine cards, one swipe run, a visible end), and
 * it turns "you have 14 things left" — which reads as a chore — into eight
 * short rows where most are already done.
 *
 * Sections stay in catalog order and never reshuffle by what's urgent. A rail
 * that reorders itself destroys the position memory that makes it faster than
 * reading, which is the same reason `BOTTOM_RAIL_HREFS` is fixed.
 *
 * Self-fetching, like PhotoUploadCard — the dashboard is a server component
 * and this is the one card on it that needs the live draft rather than the
 * completion percentage already computed server-side.
 */

/** Anchor for the `return` link, so coming back lands on the list, not page top. */
const ANCHOR = "profile-fields";

/** Beyond this an expanded section stops being scannable and becomes the flat
 *  list this card just replaced. The rest are reachable by the section's own
 *  "Fill These" run. */
const CHIPS_PER_SECTION = 6;

function SectionRow({
  row,
  open,
  onToggle,
  returnTo,
}: {
  row: CategoryProgress;
  open: boolean;
  onToggle: () => void;
  returnTo: string;
}) {
  const t = useT();
  const { category, filled, pending } = row;
  const total = filled.length + pending.length;
  const done = pending.length === 0;

  /** `cat` scopes the deck, `field` picks the landing card, `all=1` keeps
   *  answered fields in so an existing value can be corrected. */
  function href(fieldKey?: string, includeFilled?: boolean) {
    const p = new URLSearchParams({ mode: "manual", cat: category.key, return: returnTo });
    if (fieldKey) p.set("field", fieldKey);
    if (includeFilled) p.set("all", "1");
    return `/profile/build?${p.toString()}`;
  }

  const Icon = CATEGORY_ICON[category.key];

  return (
    <li
      className={cn(
        "border-t border-line/70 first:border-t-0",
        // An open section gets its own ground, so the chips inside it read as
        // belonging to that row rather than floating between two rows.
        open && "-mx-2 rounded-2xl border-t-transparent bg-surface-2/70 px-2",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex min-h-14 w-full items-center gap-3.5 py-2.5 text-left"
      >
        <span
          className={cn(
            "bt-ring [--paper-ring-size:2.25rem]",
            done ? "bt-ring--trust" : "bt-ring--blush",
          )}
          aria-hidden
        >
          <Icon className="size-4" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="bt-display block truncate text-[1.0625rem] leading-snug">
            {t(catalogKey.categoryLabel(category.key), category.label)}
          </span>
          {/* Only while something is left. The count is the honest denominator
              — "2 of 7" reads very differently from a bare "2 baaki" on a
              section of seven — but repeating "Pura ho gaya" under a green
              tick on every finished row is noise the tick already carried. */}
          {!done && (
            <span className="mt-0.5 block text-[0.75rem] text-subtle">
              {t("profile.overviewCard.sectionPending", "{total} me se {count} baaki")
                .replace("{count}", String(pending.length))
                .replace("{total}", String(total))}
            </span>
          )}
        </span>

        {done ? (
          <Check className="size-[18px] shrink-0 text-trust" aria-hidden />
        ) : (
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-gold-100 text-[0.6875rem] font-semibold tabular-nums text-gold-800 dark:bg-gold-900/40 dark:text-gold-200">
            {pending.length}
          </span>
        )}
        {open ? (
          <ChevronDown className="size-4 shrink-0 text-subtle" aria-hidden />
        ) : (
          <ChevronRight className="size-4 shrink-0 text-subtle" aria-hidden />
        )}
      </button>

      {open && (
        <div className="pb-4 pl-[3.25rem]">
          <p className="text-[0.75rem] leading-relaxed text-muted">
            {t(catalogKey.categoryHint(category.key), category.hint)}
          </p>

          {pending.length > 0 && (
            <>
              <ul className="mt-2.5 flex flex-wrap gap-1.5">
                {pending.slice(0, CHIPS_PER_SECTION).map((f) => (
                  <li key={f.key}>
                    <Link
                      href={href(f.key)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-[0.8125rem] font-medium transition-colors",
                        "border-gold-300/60 bg-surface text-gold-800 hover:border-gold-500 hover:bg-gold-50",
                        "dark:border-gold-400/30 dark:bg-gold-900/30 dark:text-gold-200",
                      )}
                    >
                      {f.label}
                      {f.required && <span className="text-danger">*</span>}
                    </Link>
                  </li>
                ))}
                {pending.length > CHIPS_PER_SECTION && (
                  <li className="self-center text-[0.75rem] text-subtle">
                    {t("profile.overviewCard.andMore", "+{count} aur").replace(
                      "{count}",
                      String(pending.length - CHIPS_PER_SECTION),
                    )}
                  </li>
                )}
              </ul>

              {/* The whole section as one swipe run — the thing that makes
                  "let me just finish partner preferences" a single decision
                  instead of nine separate taps. */}
              <Link
                href={href()}
                className="group mt-2.5 inline-flex min-h-9 items-center gap-1 text-[0.8125rem] font-semibold text-gold-700 dark:text-gold-300"
              >
                {t("profile.overviewCard.fillThese", "Fill These")}
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </>
          )}

          {filled.length > 0 && (
            <p className="mt-2.5 text-[0.75rem] leading-relaxed text-subtle">
              <span className="text-muted">{t("profile.overviewCard.alreadyFilled", "Bhar chuke hain:")} </span>
              {filled.map((f, i) => (
                <span key={f.key}>
                  {i > 0 && ", "}
                  {/* Tappable, and the only link here that keeps answered
                      fields in the deck — correcting a value is the one case
                      that needs to reach a card that is no longer a gap. */}
                  <Link href={href(f.key, true)} className="underline decoration-line underline-offset-2 hover:text-ink">
                    {f.label}
                  </Link>
                </span>
              ))}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

export default function ProfileOverviewCard() {
  const t = useT();
  const pathname = usePathname();
  const [values, setValues] = useState<ProfileValues | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  /** Set once the first time data lands, so the auto-expand can't fight a
   *  user who has since collapsed that section. */
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/profile/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { values?: ProfileValues } | null) => {
        if (!cancelled && body?.values) setValues(body.values);
      })
      .catch(() => {
        /* dashboard still works without this card — completion % already loaded server-side */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo(() => (values ? categoryProgress(values) : []), [values]);

  // Open the first section with something left in it. A card that opens with
  // every section collapsed is eight rows of nothing to do; one open section
  // shows what a tap gets you.
  useEffect(() => {
    if (touched || rows.length === 0) return;
    setOpenKey(rows.find((r) => r.pending.length > 0)?.category.key ?? null);
    setTouched(true);
  }, [rows, touched]);

  /**
   * Honour `#profile-fields` ourselves.
   *
   * Coming back from the deck lands on `/user/dashboard#profile-fields`, and
   * the browser's own hash scroll runs at navigation — by which point this
   * card has rendered `null`, because its values are still in flight. The
   * anchor genuinely does not exist yet, so nothing scrolls and the user is
   * dropped at the top of a long dashboard with no idea the list they were
   * just in is a thousand pixels down. Re-running the scroll once the rows
   * are actually on screen is what closes the fill → return → fill loop.
   */
  useEffect(() => {
    if (rows.length === 0) return;
    if (window.location.hash !== `#${ANCHOR}`) return;
    // A frame, so the sections have laid out before we measure them.
    const id = requestAnimationFrame(() => {
      document.getElementById(ANCHOR)?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
    return () => cancelAnimationFrame(id);
  }, [rows]);

  if (!values) return null;

  const filled = rows.reduce((n, r) => n + r.filled.length, 0);
  const total = rows.reduce((n, r) => n + r.filled.length + r.pending.length, 0);
  const pending = total - filled;
  const percent = total === 0 ? 0 : Math.round((filled / total) * 100);
  const returnTo = `${pathname ?? "/user/dashboard"}#${ANCHOR}`;

  return (
    <div className="bt-card p-5 sm:p-6">
      {/* The scroll target for every `return` link this card hands out. */}
      <div id={ANCHOR} className="scroll-mt-20" />

      <div className="flex items-center justify-between gap-3">
        <h3 className="bt-display text-[1.3rem] leading-snug">
          {t("profile.overviewCard.title", "Aapki Profile")}
        </h3>
        <span className="shrink-0 text-[0.8125rem] font-medium tabular-nums text-muted">
          {t("profile.overviewCard.detailsCount", "{filled}/{total} details")
            .replace("{filled}", String(filled))
            .replace("{total}", String(total))}
        </span>
      </div>

      {/* The motif caps the bar rather than floating on its own line: an
          ornament with nothing attached is decoration, one that starts a rule
          is a ruling. */}
      <div className="mt-4 flex items-center gap-2.5">
        <RuleMotif className="h-3 w-8 shrink-0 text-primary" />
        <div
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-1.5 flex-1 overflow-hidden rounded-full bg-line"
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-gold-400 to-gold-600 transition-[width] duration-700"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {pending > 0 && (
        <p className="mt-3 text-[0.75rem] leading-relaxed text-muted">
          {t(
            "profile.overviewCard.pendingHint",
            "{count} baaki hain. Ek section chuniye — sirf usi ke khaali sawaal aayenge, swipe karke bhar dijiye.",
          ).replace("{count}", String(pending))}
        </p>
      )}

      <ul className="mt-4">
        {rows.map((row) => (
          <SectionRow
            key={row.category.key}
            row={row}
            open={openKey === row.category.key}
            onToggle={() => {
              setTouched(true);
              setOpenKey((k) => (k === row.category.key ? null : row.category.key));
            }}
            returnTo={returnTo}
          />
        ))}
      </ul>
    </div>
  );
}
