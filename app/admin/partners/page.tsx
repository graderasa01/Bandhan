import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { maskEmail, maskMobile } from "@/lib/services/partner/sanitize";
import AdminShell from "@/components/layout/AdminShell";
import PartnerReviewList, { type AdminPartnerRow } from "@/components/admin/PartnerReviewList";

export default async function AdminPartnersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login?next=/admin/partners");
  if (user.role !== "ADMIN" && user.role !== "SUPPORT") redirect("/");

  // M10 §23 — SUPPORT reviews and answers questions about applications; only
  // ADMIN decides them. Hiding the buttons is the courtesy half; the PATCH
  // route's `requireAdmin()` is the half that actually enforces it.
  const canReview = user.role === "ADMIN";

  const partners = await prisma.partner.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: { referralCodes: { where: { active: true }, take: 1, select: { code: true } } },
  });

  // Contact details are masked before they ever reach the client bundle —
  // an admin reviewing an application doesn't need the raw number on screen.
  const rows: AdminPartnerRow[] = partners.map((p) => ({
    id: p.id,
    fullName: p.fullName,
    maskedMobile: maskMobile(p.mobileNumber),
    maskedEmail: maskEmail(p.email),
    city: p.city,
    state: p.state,
    partnerType: p.partnerType,
    organizationName: p.organizationName,
    experienceYears: p.experienceYears,
    status: p.status,
    appliedAt: p.createdAt.toISOString().slice(0, 10),
    activeCode: p.referralCodes[0]?.code ?? null,
  }));

  const pendingCount = rows.filter((r) => r.status === "PENDING_APPROVAL").length;

  return (
    <AdminShell adminName={user.fullName}>
      <div className="mx-auto max-w-4xl">
        <section className="mb-6">
          <h1 className="text-2xl font-bold text-wine-700">Partners</h1>
          <p className="mt-2 text-sm text-muted">
            {pendingCount > 0
              ? `${pendingCount} application review ke liye pending hain.`
              : "Sab applications review ho chuki hain."}
            {!canReview && " Aapko sirf view access hai — approve/reject sirf admin kar sakta hai."}
          </p>
        </section>

        <PartnerReviewList partners={rows} canReview={canReview} />
      </div>
    </AdminShell>
  );
}
