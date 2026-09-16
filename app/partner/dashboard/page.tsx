import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  CalendarCheck,
  ChevronRight,
  ClipboardList,
  DoorOpen,
  Lightbulb,
  MessageSquare,
  Share2,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { requirePartner } from "@/lib/auth/requirePartner";
import { getPartnerDashboardData, getPartnerTodayWork } from "@/lib/data/partnerData";
import { getPartnerSetup } from "@/lib/data/partnerJourneyData";
import { getPartnerBalance } from "@/lib/services/payouts/payoutService";
import { paiseToRupeeDisplay } from "@/lib/utils/money";
import { getT } from "@/lib/i18n/server";
import PartnerShell from "@/components/layout/PartnerShell";
import LeadRow from "@/components/partner/LeadRow";
import PartnerCard from "@/components/partner/PartnerCard";
import PartnerSetupChecklist from "@/components/partner/PartnerSetupChecklist";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";

type WorkRow = {
  href: string;
  icon: LucideIcon;
  count: number;
  label: string;
  /** Sorted first: a running SLA clock beats a draft nobody is waiting on. */
  urgent?: boolean;
};

/**
 * The partner's day, in the order it should be worked.
 *
 *   0. Shuruaat — the set-up checklist, only while a required step is left
 *      (D-90 Partner Journey). A partner with no UPI or no first family has
 *      no "day" yet; this is what they are shown instead of empty queues.
 *   1. Aaj ka kaam — everything somebody is waiting on this partner for,
 *      one row per queue, counts from the pages that own those lists.
 *   2. Paisa — what can be withdrawn right now.
 *   3. Leads — the referral funnel, compact.
 *   4. Referral tools — one row, last. Referrals are how a partner gets found;
 *      they used to fill this whole screen because they were all a partner
 *      could do, and the card + insight + empty state all pushed the same link.
 */
export default async function PartnerDashboardPage() {
  const { partner, redirectTo } = await requirePartner(["APPROVED", "ACTIVE", "INACTIVE"]);
  if (!partner) redirect(redirectTo);

  const t = await getT();
  const [data, work, balance, setup] = await Promise.all([
    getPartnerDashboardData(partner, t),
    getPartnerTodayWork(partner.id),
    // Best-effort: the payout ledger is a separate subsystem and a hiccup
    // there must not blank the work list above it.
    getPartnerBalance(partner.id).catch(() => null),
    getPartnerSetup(partner, t),
  ]);

  const stalledLeads = data.leads.filter((l) => l.status === "PROFILE_STARTED").length;

  const rows: WorkRow[] = [
    {
      href: "/partner/bookings",
      icon: CalendarCheck,
      count: work.bookingsToAccept,
      label: t("partnerPage.dashboard.work.bookingsToAccept", "booking accept karni hai"),
      urgent: true,
    },
    {
      href: "/partner/enquiries",
      icon: MessageSquare,
      count: work.enquiriesWaiting,
      label: t("partnerPage.dashboard.work.enquiriesWaiting", "enquiry jawaab ka intezaar kar rahi"),
      urgent: true,
    },
    {
      href: "/partner/rooms",
      icon: DoorOpen,
      count: work.roomTasksOpen,
      label: t("partnerPage.dashboard.work.roomTasks", "kaam rishton me aapke zimme"),
    },
    {
      href: "/partner/bookings",
      icon: CalendarCheck,
      count: work.bookingsInProgress,
      label: t("partnerPage.dashboard.work.bookingsInProgress", "booking chal rahi — kaam deliver karna hai"),
    },
    {
      href: "/partner/clients",
      icon: ClipboardList,
      count: work.draftsInProgress,
      label: t("partnerPage.dashboard.work.drafts", "client profile adhoori — bhar kar claim link bhejein"),
    },
    {
      href: "/partner/leads",
      icon: ClipboardList,
      count: stalledLeads,
      label: t("partnerPage.dashboard.work.stalledLeads", "lead ne profile shuru ki par poori nahi — reminder bhejein"),
    },
  ]
    .filter((r) => r.count > 0)
    .sort((a, b) => Number(Boolean(b.urgent)) - Number(Boolean(a.urgent)));

  const totalWork = rows.reduce((sum, r) => sum + r.count, 0);
  const primary = rows[0] ?? null;
  const available = balance ? paiseToRupeeDisplay(balance.availablePaise) : null;

  return (
    <PartnerShell partnerName={data.partner.displayName} partnerCode={data.partner.partnerCode}>
      <div className="mx-auto flex max-w-3xl flex-col gap-5">
        {/* One heading, one line, one button — the most urgent queue. */}
        <section>
          <h1 className="text-2xl font-bold text-wine-700">{t("partnerPage.dashboard.title", "Aaj")}</h1>
          <p className="mt-1.5 text-base text-muted">
            {totalWork === 0
              ? t("partnerPage.dashboard.allClear", "Aaj koi kaam pending nahi — sab jawaab de diye gaye hain.")
              : `${totalWork} ${t("partnerPage.dashboard.pendingLine", "cheezein aapka intezaar kar rahi hain.")}`}
          </p>
          {primary && (
            <div className="mt-3">
              <Link href={primary.href}>
                <Button variant="primary" size="md" iconAfter={<ArrowRight className="size-4" />}>
                  {t("partnerPage.dashboard.startCta", "Start Now")}
                </Button>
              </Link>
            </div>
          )}
        </section>

        {setup.requiredLeft > 0 && <PartnerSetupChecklist setup={setup} />}

        <section aria-labelledby="today-work">
          <h2 id="today-work" className="mb-2 text-lg font-semibold text-ink">
            {t("partnerPage.dashboard.workHeading", "Aaj ka kaam")}
          </h2>
          {rows.length === 0 ? (
            <Card variant="soft" padding="md">
              <p className="text-base text-muted">
                {t("partnerPage.dashboard.workEmpty", "Koi booking, enquiry ya client kaam pending nahi.")}
              </p>
              <div className="mt-3">
                <Link href="/partner/clients/new">
                  <Button variant="secondary" size="md">
                    {t("partnerPage.dashboard.newClientCta", "New Client Draft")}
                  </Button>
                </Link>
              </div>
            </Card>
          ) : (
            <ul className="flex flex-col gap-2">
              {rows.map((row, i) => (
                <li key={`${row.href}-${i}`}>
                  <Link href={row.href} className="block">
                    <Card padding="sm" className="flex min-h-14 items-center gap-3 transition-colors hover:border-gold-400">
                      <span
                        className={
                          row.urgent
                            ? "grid size-9 shrink-0 place-items-center rounded-full bg-gold-100 text-gold-700 dark:bg-gold-900/30 dark:text-gold-300"
                            : "grid size-9 shrink-0 place-items-center rounded-full bg-bg-subtle text-muted"
                        }
                      >
                        <row.icon className="size-4" aria-hidden />
                      </span>
                      <p className="min-w-0 flex-1 text-base text-ink">
                        <strong className="font-bold text-wine-700">{row.count}</strong> {row.label}
                      </p>
                      <ChevronRight className="size-5 shrink-0 text-subtle" aria-hidden />
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Money: the one number a partner checks daily, with the door to it. */}
        <section aria-labelledby="money">
          <h2 id="money" className="mb-2 text-lg font-semibold text-ink">
            {t("partnerPage.dashboard.moneyHeading", "Paisa")}
          </h2>
          <Card variant="soft" padding="md" className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-gold-100 text-gold-700 dark:bg-gold-900/30 dark:text-gold-300">
              <Wallet className="size-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[1.75rem] font-bold leading-none text-wine-700">
                {available ?? data.metrics[2]?.value ?? "—"}
              </p>
              <p className="mt-1 text-sm text-muted">
                {available
                  ? t("partnerPage.dashboard.availableNow", "abhi withdraw kar sakte hain")
                  : t("partnerPage.dashboard.totalEarned", "ab tak kamaya")}
                {" · "}
                {data.metrics[3]?.value} {t("partnerPage.dashboard.upcoming", "aane wala")}
              </p>
            </div>
            <Link
              href="/partner/payouts"
              className="inline-flex min-h-11 shrink-0 items-center gap-1 text-sm font-semibold text-primary-text underline underline-offset-2"
            >
              {t("partnerPage.dashboard.payoutsLink", "Payouts")}
              <ChevronRight className="size-4" aria-hidden />
            </Link>
          </Card>
        </section>

        {data.insight && rows.length > 0 && (
          <Card variant="trust" padding="md">
            <div className="flex items-start gap-2.5">
              <Lightbulb className="mt-0.5 size-4 shrink-0 text-trust" aria-hidden />
              <div>
                <p className="font-semibold text-ink">{data.insight.title}</p>
                <p className="mt-0.5 text-sm text-muted">{data.insight.message}</p>
              </div>
            </div>
          </Card>
        )}

        <section aria-labelledby="recent-leads">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 id="recent-leads" className="text-lg font-semibold text-ink">
              {t("partnerPage.dashboard.leadsHeading", "Leads")}
            </h2>
            <p className="text-sm text-muted">{data.conversionSentence}</p>
          </div>

          {data.leads.length === 0 ? (
            <Card variant="soft" padding="md">
              <p className="text-base text-muted">
                {t("partnerPage.dashboard.leadsEmpty", "Aapke referral se abhi tak koi join nahi hua.")}
              </p>
            </Card>
          ) : (
            <div className="flex flex-col gap-2">
              {data.leads.slice(0, 3).map((lead) => (
                <LeadRow key={lead.leadId} lead={lead} partnerName={data.partner.displayName} />
              ))}
              {data.leads.length > 3 && (
                <Link
                  href="/partner/leads"
                  className="inline-flex min-h-11 items-center gap-1 self-start text-sm font-semibold text-primary-text underline underline-offset-2"
                >
                  {t("partnerPage.dashboard.viewAllLeads", "View All")}
                  <ChevronRight className="size-4" aria-hidden />
                </Link>
              )}
            </div>
          )}
        </section>

        {/* The partner's card, below the work — it is about them, not the day. */}
        <details className="group">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 text-sm font-semibold text-primary-text underline underline-offset-2">
            {t("partnerPage.dashboard.showCard", "My partner card & tier")}
            <ChevronRight className="size-4 transition-transform group-open:rotate-90" aria-hidden />
          </summary>
          <div className="mt-3">
            <PartnerCard card={data.card} />
          </div>
        </details>

        {/* Referral promotion: one row, last. */}
        <Link href="/partner/referral-tools" className="block">
          <Card padding="sm" className="flex min-h-12 items-center gap-3 transition-colors hover:border-gold-400">
            <Share2 className="size-4 shrink-0 text-muted" aria-hidden />
            <p className="min-w-0 flex-1 text-sm text-ink">
              {t("partnerPage.dashboard.referralRow", "Referral link aur QR — naye log jodne ke liye")}
            </p>
            <ChevronRight className="size-4 shrink-0 text-subtle" aria-hidden />
          </Card>
        </Link>

        <p className="text-sm text-muted">
          🛡 {t("partnerPage.dashboard.privacy", "Privacy: aapko sirf pehla naam, city aur progress dikhta hai — contact ya photo kabhi nahi.")}
        </p>
      </div>
    </PartnerShell>
  );
}
