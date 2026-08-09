import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Check, Clock, Mail, MessageCircle, Send, TrendingUp } from "lucide-react";
import { requirePartner } from "@/lib/auth/requirePartner";
import { getPartnerLeadDetail } from "@/lib/data/partnerData";
import { templateForStatus } from "@/lib/partner/leadTemplates";
import { getT } from "@/lib/i18n/server";
import PartnerShell from "@/components/layout/PartnerShell";
import SendForMeButton from "@/components/partner/SendForMeButton";
import { getActivePartnerCode } from "@/components/partner/_shared/getActivePartnerCode";
import Card from "@/components/ui/Card";
import Pill from "@/components/ui/Pill";
import Avatar from "@/components/ui/Avatar";

/**
 * One lead, in as much detail as a partner is allowed to have.
 *
 * The additions over the list row are all about the *partner's* relationship
 * with this person — what they sent, when, and what it earned — plus a coarser
 * timeline of progress the row already summarised in a pill. Nothing here
 * crosses lib/partner/visibility.ts: still no contact details, no photo, no
 * age, no exact completion score, and nothing about their matches or messages.
 */
export default async function PartnerLeadDetailPage({ params }: { params: Promise<{ leadId: string }> }) {
  const { partner, redirectTo } = await requirePartner(["APPROVED", "ACTIVE"]);
  if (!partner) redirect(redirectTo);

  const { leadId } = await params;
  const t = await getT();
  const [detail, partnerCode] = await Promise.all([
    getPartnerLeadDetail(partner, leadId, t),
    getActivePartnerCode(partner.id),
  ]);
  if (!detail) notFound();

  const { lead } = detail;
  const template = templateForStatus(lead.status);
  const selfSendText = template.whatsapp({
    firstName: lead.firstName,
    partnerName: partner.fullName,
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "https://bandhantak.com",
  });

  return (
    <PartnerShell partnerName={partner.fullName} partnerCode={partnerCode}>
      <div className="mx-auto max-w-2xl">
        <Link
          href="/partner/leads"
          className="mb-4 inline-flex min-h-8 items-center gap-1 text-sm font-semibold text-primary-text underline underline-offset-2"
        >
          <ArrowLeft className="size-4" />
          All Leads
        </Link>

        <Card variant="elevated" padding="lg" className="mb-4">
          <div className="flex items-center gap-3">
            <Avatar name={lead.firstName} size="md" />
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-bold text-ink">{lead.firstName}</h1>
              <p className="mt-0.5 text-sm text-muted">
                {lead.city ?? "City nahi bataayi"} · Joined {lead.joinedAt}
              </p>
            </div>
            <Pill tone={lead.hasPlan ? "trust" : "neutral"} size="sm">
              {lead.hasPlan ? "Plan liya" : `Profile ${lead.completionBucket}`}
            </Pill>
          </div>

          {/* `warn`/`warn-bg`, not `warning-soft` — the `--color-warning*`
              aliases live in `:root` for unmigrated pages, not in `@theme`, so
              Tailwind generates no class for them and they fail silently. */}
          {detail.stalledNote && (
            <p className="mt-4 flex items-center gap-2 rounded-lg bg-warn-bg px-3 py-2 text-sm text-ink">
              <Clock className="size-4 shrink-0 text-warn" />
              {detail.stalledNote}
            </p>
          )}
        </Card>

        <div className="mb-4 grid grid-cols-2 gap-3">
          <Card variant="soft" padding="md" className="text-center">
            <p className="text-[1.75rem] font-bold leading-none text-wine-700">{detail.earnedPaiseDisplay}</p>
            <p className="mt-1.5 text-[0.8125rem] text-muted">Is lead se mila</p>
          </Card>
          <Card variant="soft" padding="md" className="text-center">
            <p className="text-[1.75rem] font-bold leading-none text-wine-700">{detail.commissionCount}</p>
            <p className="mt-1.5 text-[0.8125rem] text-muted">Payments</p>
          </Card>
        </div>

        {detail.suggestedAction && (
          <Card variant="trust" padding="md" className="mb-4">
            <div className="flex items-start gap-2.5">
              <TrendingUp className="mt-0.5 size-4 shrink-0 text-trust" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink">{detail.suggestedAction.label}</p>
                <p className="mt-0.5 text-sm text-muted">{detail.suggestedAction.reason}</p>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(selfSendText)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-8 items-center gap-1 text-[0.8125rem] font-semibold text-trust underline underline-offset-2"
                  >
                    <MessageCircle className="size-3.5" />
                    Send Myself
                  </a>
                  <SendForMeButton leadId={lead.leadId} channel="WHATSAPP" label="BandhanTak se WhatsApp" />
                  <SendForMeButton leadId={lead.leadId} channel="EMAIL" label="BandhanTak se Email" />
                </div>
              </div>
            </div>
          </Card>
        )}

        <section className="mb-4">
          <h2 className="mb-3 text-lg font-semibold text-ink">Progress</h2>
          <Card variant="default" padding="md">
            <ol className="flex flex-col gap-3">
              {detail.timeline.map((step) => (
                <li key={step.key} className="flex items-center gap-3">
                  <span
                    className={`grid size-6 shrink-0 place-items-center rounded-full ${
                      step.done ? "bg-trust text-white" : "border border-line bg-surface text-subtle"
                    }`}
                  >
                    {step.done ? <Check className="size-3.5" /> : <span className="size-1.5 rounded-full bg-subtle" />}
                  </span>
                  <span className={`flex-1 text-sm ${step.done ? "text-ink" : "text-subtle"}`}>{step.label}</span>
                  <span className="text-[0.6875rem] text-subtle">{step.at ?? "—"}</span>
                </li>
              ))}
            </ol>
          </Card>
        </section>

        <section className="mb-4">
          <h2 className="mb-3 text-lg font-semibold text-ink">Bheje gaye messages</h2>
          {detail.outreach.length === 0 ? (
            <Card variant="soft" padding="md">
              <p className="text-sm text-muted">
                Abhi tak koi message nahi bheja gaya. Upar se WhatsApp ya email bhej sakte hain.
              </p>
            </Card>
          ) : (
            <div className="flex flex-col gap-2">
              {detail.outreach.map((entry) => (
                <Card key={entry.id} variant="default" padding="sm" className="flex items-center gap-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-2">
                    {entry.channel === "EMAIL" ? (
                      <Mail className="size-4 text-muted" />
                    ) : (
                      <Send className="size-4 text-muted" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{entry.templateLabel}</p>
                    <p className="mt-0.5 text-[0.6875rem] text-subtle">
                      {entry.automated ? "Automatic gaya" : "Aapne bheja"} · {entry.at}
                      {entry.failureReason ? ` · ${entry.failureReason}` : ""}
                    </p>
                  </div>
                  <Pill tone={entry.status === "SENT" ? "trust" : "neutral"} size="sm">
                    {entry.status === "SENT" ? "Gaya" : entry.status === "FAILED" ? "Fail" : "Queue"}
                  </Pill>
                </Card>
              ))}
            </div>
          )}
        </section>

        <Card variant="soft" padding="md">
          <p className="text-xs text-muted">
            🛡 Privacy: aapko sirf pehla naam, city aur progress dikhta hai. Is lead ka mobile number ya email
            aapko kabhi nahi dikhega — &quot;BandhanTak se bhejein&quot; par message hamare server se jaata hai,
            aapke naam ke saath.
          </p>
        </Card>
      </div>
    </PartnerShell>
  );
}
