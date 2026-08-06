import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import BrandMark from "@/components/layout/BrandMark";

/**
 * Full-viewport "nothing to see here, and that's normal" screen — shared by
 * InviteInactiveCard and NotJoinedCard. Same calm-not-alarming instinct as
 * components/share/ShareLinkInactiveCard (a separate partition's near-copy
 * of this shell): a dead/missing link is an expected state, not a 404.
 */
export default function EmptyStateScreen({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <div className="max-w-sm text-center">
        <div className="mb-5 flex justify-center">
          <BrandMark />
        </div>
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-bg-subtle text-muted">
          <Icon className="size-6" />
        </span>
        <h1 className="mt-4 text-xl font-bold text-ink">{title}</h1>
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted">{description}</p>
        <Link
          href="/"
          className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full border border-line-strong bg-surface px-5 text-sm font-medium text-ink shadow-xs transition-colors hover:border-gold-500 hover:bg-gold-50"
        >
          Go to BandhanTak
        </Link>
      </div>
    </div>
  );
}
