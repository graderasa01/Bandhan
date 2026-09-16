import Link from "next/link";
import { redirect } from "next/navigation";
import { Clock, ShieldAlert, XCircle } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { sanitizeReasonForPartner } from "@/lib/services/partner/sanitize";
import { getT } from "@/lib/i18n/server";
import PublicShell from "@/components/layout/PublicShell";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import LogoutButton from "@/components/auth/LogoutButton";

export default async function PartnerPendingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/partner/pending");

  const partner = await prisma.partner.findUnique({ where: { userId: user.id } });
  if (!partner) redirect("/partner/register");

  // Approved partners have a dashboard to be in — this page is only for the
  // states that block them.
  if (partner.status === "APPROVED" || partner.status === "ACTIVE" || partner.status === "INACTIVE") {
    redirect("/partner/dashboard");
  }

  const t = await getT();

  const view =
    partner.status === "REJECTED"
      ? {
          icon: XCircle,
          tone: "danger" as const,
          title: "Aapka partner application approve nahi ho paaya.",
          body: partner.rejectionReason
            ? sanitizeReasonForPartner(partner.rejectionReason)
            : "Admin ne application review ki hai. Aur jaankari ke liye support se contact karein.",
        }
      : partner.status === "SUSPENDED"
        ? {
            icon: ShieldAlert,
            tone: "warning" as const,
            title: "Aapka partner account suspended hai. Support se contact karein.",
            body: partner.suspensionReason
              ? sanitizeReasonForPartner(partner.suspensionReason)
              : "Support team aapki madad kar degi.",
          }
        : {
            icon: Clock,
            tone: "info" as const,
            title: "Aapka partner account abhi approval pending hai.",
            body: "Admin aapki application review karega — aam taur par 24–48 ghante lagte hain. Approve hote hi aapko referral code aur tools mil jayenge.",
          };

  const Icon = view.icon;

  // D-90 Partner Journey: while they wait, show the road rather than a blank
  // wall — the same four spaces the app opens with once approved.
  const journey = [
    t("partnerJourney.pending.step1", "Apna contact verify karein aur UPI jodein"),
    t("partnerJourney.pending.step2", "Apna QR aur link parivaaron ko bhejein"),
    t("partnerJourney.pending.step3", "Families me har parivaar ka agla kadam dekhein"),
    t("partnerJourney.pending.step4", "Earnings me unke Chat Unlock aur Rishta Pass ki commission"),
  ];

  return (
    <PublicShell>
      <main className="mx-auto max-w-xl px-4 py-16">
        <Card variant={view.tone} padding="lg" className="text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-full bg-surface shadow-sm">
            <Icon className="size-7 text-muted" />
          </span>
          <h1 className="mt-4 text-xl font-bold text-ink">{view.title}</h1>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">{view.body}</p>

          <dl className="mx-auto mt-6 grid max-w-sm grid-cols-2 gap-2 text-left text-sm">
            <dt className="text-muted">Naam</dt>
            <dd className="text-ink">{partner.fullName}</dd>
            <dt className="text-muted">City</dt>
            <dd className="text-ink">{partner.city}</dd>
            <dt className="text-muted">Status</dt>
            <dd className="text-ink">{partner.status}</dd>
          </dl>

          {/* Logout, not just "Go to Home": home keeps the same session, so a
              partner stuck on this screen could never sign in to their member
              account from here. */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link href="/">
              <Button variant="secondary" size="md">
                Go to Home
              </Button>
            </Link>
            <LogoutButton />
          </div>
          <p className="mt-3 text-xs text-muted">
            Kisi aur account se login karna hai? Pehle logout kar dijiye.
          </p>
        </Card>

        {partner.status === "PENDING_APPROVAL" && (
          <Card padding="lg" className="mt-5">
            <h2 className="text-lg font-semibold text-ink">
              {t("partnerJourney.pending.title", "Approve hote hi aapka raasta")}
            </h2>
            <ol className="mt-3 flex flex-col gap-2.5">
              {journey.map((line, i) => (
                <li key={line} className="flex items-start gap-3 text-sm text-ink">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-gold-100 text-xs font-bold text-gold-800 dark:bg-gold-900/40 dark:text-gold-200">
                    {i + 1}
                  </span>
                  <span className="pt-0.5">{line}</span>
                </li>
              ))}
            </ol>
          </Card>
        )}
      </main>
    </PublicShell>
  );
}
