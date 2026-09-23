"use client";

import Link from "next/link";
import { BadgeCheck, Lock, X } from "lucide-react";
import { useT } from "@/components/i18n/LanguageProvider";
import type { GrioProfileHeader } from "@/lib/contracts/grioProfile";

/**
 * Whose profile this conversation is about — pinned above the messages for as
 * long as it is.
 *
 * The old scope marker was a small gold pill ("🔍 Priya ki profile par") that
 * scrolled nowhere and said little: no face, no age, no way to tell two Priyas
 * apart, and nothing that changed when the member swiped to someone else. A
 * member asking "family kaisi hai?" has to *know* which family Grio is about to
 * describe, so the answer's subject stays on screen, with the same facts the
 * profile page's first screen shows — the photo only when the photo gate opens
 * it (the header arrives from the server already gated).
 *
 * `header` is null for the moment between opening and the brief arriving; the
 * name from the scope is shown meanwhile so the subject is never blank.
 */
export default function GrioProfileContext({
  name,
  header,
  onClear,
  onNavigate,
}: {
  name: string;
  header: GrioProfileHeader | null;
  onClear: () => void;
  /** Called before following "View profile" — the overlay closes so the page is visible. */
  onNavigate: () => void;
}) {
  const t = useT();
  const title = header ? `${header.name}${header.age ? `, ${header.age}` : ""}` : name;
  const sub = header ? [header.city, header.headline].filter(Boolean).join(" · ") : null;

  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-line bg-bg-subtle/60 px-4 py-2.5 sm:px-6">
      <div className="relative size-11 shrink-0 overflow-hidden rounded-full border border-line bg-surface">
        {header?.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={header.photoUrl} alt="" className="size-full object-cover" />
        ) : (
          <span className="grid size-full place-items-center text-[0.9375rem] font-semibold text-muted">
            {(header?.name ?? name).trim().charAt(0).toUpperCase() || "?"}
          </span>
        )}
        {header && !header.photoUrl && (
          <span className="absolute -bottom-0.5 -right-0.5 grid size-4 place-items-center rounded-full border border-line bg-surface">
            <Lock className="size-2.5 text-muted" aria-hidden />
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-center gap-1 text-[0.875rem] font-semibold text-ink">
          <span className="truncate">{title}</span>
          {header?.verified && (
            <BadgeCheck className="size-3.5 shrink-0 text-trust" aria-label={t("grio.profile.verified", "Photo verified")} />
          )}
        </p>
        {sub ? (
          <p className="truncate text-[0.75rem] text-muted">{sub}</p>
        ) : (
          !header && <p className="h-3.5 w-32 animate-pulse rounded bg-line/60" aria-hidden />
        )}
        <div className="mt-1 flex min-w-0 items-center gap-2">
          <span className="shrink-0 rounded-full border border-gold-300 bg-gold-50 px-2 py-0.5 text-[0.6875rem] font-medium text-gold-700 dark:border-gold-700/50 dark:bg-gold-900/20 dark:text-gold-300">
            {t("grio.profile.currentChip", "Current profile")}
          </span>
          {header && <span className="truncate text-[0.6875rem] text-subtle">{header.levelLabel}</span>}
          {header && (
            <Link
              href={`/user/profile/${header.profileId}`}
              onClick={onNavigate}
              className="ml-auto shrink-0 text-[0.75rem] font-semibold text-gold-700 underline-offset-2 hover:underline dark:text-gold-300"
            >
              View profile
            </Link>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={onClear}
        aria-label={t("grio.profile.clear", "Is profile se hatkar baat karein")}
        className="grid size-8 shrink-0 place-items-center self-start rounded-full text-muted transition-colors hover:bg-bg-subtle hover:text-ink"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
