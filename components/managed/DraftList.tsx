"use client";

import Link from "next/link";
import { CalendarClock, CheckCircle2, ChevronRight, FileText, Plus, UserPlus } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { DRAFT_STATUS_HINT, DRAFT_STATUS_LABEL } from "@/lib/services/managedProfile/managedProfilePolicy";
import type { DraftSummary } from "@/lib/services/managedProfile/managedDraftService";
import { cn } from "@/lib/utils";

const STATUS_TONE: Record<DraftSummary["status"], string> = {
  DRAFT: "border-line bg-bg-subtle text-muted",
  INVITED: "border-info/30 bg-info-bg text-info",
  CLAIMED: "border-gold-300 bg-gold-50 text-gold-700 dark:bg-gold-900/30 dark:text-gold-300",
  UNDER_REVIEW: "border-warn/40 bg-warn-bg text-warn",
  CONFIRMED: "border-trust/30 bg-trust-bg text-trust",
  CANCELLED: "border-line bg-bg-subtle text-muted",
  EXPIRED: "border-danger/25 bg-danger-bg text-danger",
};

function relativeDay(iso: string): string {
  const days = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "aaj";
  if (days === 1) return "kal";
  return `${days} din pehle`;
}

function expiryText(iso: string | null): string | null {
  if (!iso) return null;
  const hours = Math.round((new Date(iso).getTime() - Date.now()) / 3_600_000);
  if (hours <= 0) return "Link expire ho gaya";
  if (hours < 24) return `Link ${hours} ghante me expire`;
  return `Link ${Math.round(hours / 24)} din me expire`;
}

/**
 * The creator's client list. Deliberately austere on data: a label, a
 * completion count, a status and a timestamp.
 *
 * What it never shows — before or after a claim — is anything the owner would
 * consider theirs: no photo, no contact, no city, no community, and no hint of
 * what they accepted or rejected during review. A partner managing forty
 * clients should be able to hand this screen to a colleague without leaking
 * forty people's biodata.
 */
export default function DraftList({
  drafts,
  newHref,
  detailHrefPrefix,
  title,
  emptyBody,
  ctaLabel,
}: {
  drafts: DraftSummary[];
  newHref: string;
  detailHrefPrefix: string;
  title: string;
  emptyBody: string;
  ctaLabel: string;
}) {
  return (
    <div className="mx-auto max-w-2xl">
      <section className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-wine-700">{title}</h1>
          <p className="mt-1.5 text-sm text-muted">
            {drafts.length === 0
              ? "Abhi koi draft nahi hai."
              : `${drafts.length} draft${drafts.length > 1 ? "s" : ""}.`}
          </p>
        </div>
        <Link href={newHref} className="shrink-0">
          <Button size="sm" icon={<Plus className="size-4" />}>
            {ctaLabel}
          </Button>
        </Link>
      </section>

      {drafts.length === 0 ? (
        <Card variant="soft" padding="lg" className="text-center">
          <UserPlus className="mx-auto size-10 text-gold-600" aria-hidden />
          <p className="mt-3 font-semibold text-ink">Shuruaat yahin se hoti hai.</p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-muted">{emptyBody}</p>
          <div className="mt-5">
            <Link href={newHref}>
              <Button>{ctaLabel}</Button>
            </Link>
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-2.5">
          {drafts.map((d) => {
            const expiry = expiryText(d.claimLinkExpiresAt);
            return (
              <Link key={d.id} href={`${detailHrefPrefix}/${d.id}`} className="block">
                <Card variant="interactive" padding="md">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-gold-100 text-gold-700 dark:bg-gold-900/30 dark:text-gold-300">
                      <FileText className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-semibold text-ink">{d.displayLabel}</p>
                        <span
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium",
                            STATUS_TONE[d.status],
                          )}
                        >
                          {DRAFT_STATUS_LABEL[d.status]}
                        </span>
                      </div>

                      <p className="mt-1 text-xs leading-relaxed text-muted">{DRAFT_STATUS_HINT[d.status]}</p>

                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.75rem] text-muted">
                        <span className="inline-flex items-center gap-1">
                          <CheckCircle2 className="size-3.5" aria-hidden />
                          {d.filledCount}/{d.totalCount} bhare
                        </span>
                        {d.missingRequiredLabels.length > 0 && (
                          <span className="text-warn">{d.missingRequiredLabels.length} zaroori baaki</span>
                        )}
                        {expiry && (
                          <span className="inline-flex items-center gap-1">
                            <CalendarClock className="size-3.5" aria-hidden />
                            {expiry}
                          </span>
                        )}
                        <span>{relativeDay(d.updatedAt)}</span>
                      </div>
                    </div>
                    <ChevronRight className="mt-1 size-4 shrink-0 text-muted" aria-hidden />
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      <Card variant="soft" padding="md" className="mt-5">
        <p className="text-xs leading-relaxed text-muted">
          🛡 Draft claim hone ke baad profile un ki ho jaati hai. Aapko sirf status dikhta hai — unka chat,
          contact number, documents ya private notes kabhi nahi. Wo jab chahein aapka access hata sakte hain.
        </p>
      </Card>
    </div>
  );
}
