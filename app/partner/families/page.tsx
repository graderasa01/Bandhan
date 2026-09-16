import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, QrCode, Send, UserPlus } from "lucide-react";
import { requirePartner } from "@/lib/auth/requirePartner";
import { getFamilyPipeline } from "@/lib/data/partnerJourneyData";
import { getT } from "@/lib/i18n/server";
import PartnerShell from "@/components/layout/PartnerShell";
import PartnerSpaceTabs from "@/components/partner/PartnerSpaceTabs";
import { getActivePartnerCode } from "@/components/partner/_shared/getActivePartnerCode";
import Card from "@/components/ui/Card";
import Pill from "@/components/ui/Pill";

export const dynamic = "force-dynamic";

/**
 * Families — the partner's whole book in one list (D-90 Partner Journey).
 *
 * One row per family, at the furthest stage it has reached, with one next
 * step. The pages each stage lives on (leads, client drafts, desks, rooms,
 * invites) are still there, one tap away as tabs; this page is where a
 * partner starts instead of guessing which of them a family is on.
 */
export default async function PartnerFamiliesPage() {
  const { partner, redirectTo } = await requirePartner(["APPROVED", "ACTIVE"]);
  if (!partner) redirect(redirectTo);

  const t = await getT();
  const [pipeline, partnerCode] = await Promise.all([getFamilyPipeline(partner, t), getActivePartnerCode(partner.id)]);
  const reached = pipeline.stages.filter((s) => s.count > 0);

  return (
    <PartnerShell partnerName={partner.fullName} partnerCode={partnerCode}>
      <PartnerSpaceTabs space="families" current="/partner/families" />
      <div className="mx-auto max-w-2xl">
        <section className="mb-5">
          <h1 className="text-2xl font-bold text-wine-700">{t("partnerJourney.families.title", "Families")}</h1>
          <p className="mt-1.5 text-base text-muted">
            {t(
              "partnerJourney.families.subtitle",
              "Har parivaar ek line me — wo kahan hain, aur aapka agla kadam kya hai.",
            )}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/partner/invite"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
            >
              <Send className="size-4" aria-hidden />
              {t("partnerJourney.families.cta.invite", "Invite Family")}
            </Link>
            <Link
              href="/partner/clients/new"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line-strong bg-surface px-4 text-sm font-semibold text-ink hover:border-gold-400"
            >
              <UserPlus className="size-4" aria-hidden />
              {t("partnerJourney.families.cta.create", "Create Profile")}
            </Link>
            <Link
              href="/partner/referral-tools"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line-strong bg-surface px-4 text-sm font-semibold text-ink hover:border-gold-400"
            >
              <QrCode className="size-4" aria-hidden />
              {t("partnerJourney.families.cta.share", "Share QR")}
            </Link>
          </div>
        </section>

        {pipeline.rows.length === 0 ? (
          <Card variant="soft" padding="lg">
            <p className="text-base text-muted">
              {t(
                "partnerJourney.families.empty",
                "Abhi koi parivaar nahi. Kisi ko invite karein, ya unki profile khud banana shuru karein.",
              )}
            </p>
          </Card>
        ) : (
          <>
            {/* The whole journey at a glance — only the stages somebody is on. */}
            <ul className="mb-4 flex flex-wrap gap-2" aria-label={t("partnerJourney.families.title", "Families")}>
              {reached.map((s) => (
                <li key={s.stage}>
                  <Pill tone="neutral" size="sm">
                    {s.label} · {s.count}
                  </Pill>
                </li>
              ))}
            </ul>

            <div className="flex flex-col gap-5">
              {reached
                .slice()
                .reverse()
                .map((s) => (
                  <section key={s.stage} aria-labelledby={`stage-${s.stage}`}>
                    <h2 id={`stage-${s.stage}`} className="mb-2 text-sm font-semibold uppercase tracking-[0.08em] text-subtle">
                      {s.label} ({s.count})
                    </h2>
                    <ul className="flex flex-col gap-2">
                      {pipeline.rows
                        .filter((row) => row.stage === s.stage)
                        .map((row) => (
                          <li key={row.key}>
                            <Card padding="sm" className="flex min-h-14 items-center gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-semibold text-ink">
                                  {row.firstName}
                                  {row.city && <span className="font-normal text-muted"> · {row.city}</span>}
                                </p>
                                <p className="text-sm text-muted">{row.detail}</p>
                              </div>
                              {row.paid && (
                                <Pill tone="trust" size="sm">
                                  {t("partnerJourney.paid", "Kharch kiya")}
                                </Pill>
                              )}
                              {row.next && (
                                <Link
                                  href={row.next.href}
                                  className="inline-flex min-h-11 shrink-0 items-center gap-0.5 text-sm font-semibold text-primary-text underline underline-offset-2"
                                >
                                  {row.next.label}
                                  <ChevronRight className="size-4" aria-hidden />
                                </Link>
                              )}
                            </Card>
                          </li>
                        ))}
                    </ul>
                  </section>
                ))}
            </div>
          </>
        )}

        <p className="mt-6 text-sm text-muted">
          🛡{" "}
          {t(
            "partnerJourney.families.privacy",
            "Aapko sirf pehla naam, city aur progress dikhta hai — contact ya photo kabhi nahi.",
          )}
        </p>
      </div>
    </PartnerShell>
  );
}
