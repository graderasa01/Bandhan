import Link from "next/link";
import { redirect } from "next/navigation";
import { Clock, ShieldAlert, XCircle } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { sanitizeReasonForPartner } from "@/lib/services/partner/sanitize";
import PublicHeader from "@/components/layout/PublicHeader";
import PublicFooter from "@/components/layout/PublicFooter";
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

  return (
    <>
      <PublicHeader />
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
      </main>
      <PublicFooter />
    </>
  );
}
