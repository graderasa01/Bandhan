import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { maskEmail, maskMobile } from "@/lib/services/partner/sanitize";
import AdminShell from "@/components/layout/AdminShell";
import VoiceAccessReviewList, { type AdminVoiceAccessRow } from "@/components/admin/VoiceAccessReviewList";

export default async function AdminVoiceAccessPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin/voice-access");
  if (user.role !== "ADMIN") redirect("/");

  const users = await prisma.user.findMany({
    where: { voiceSelfFillStatus: { not: "NOT_REQUESTED" } },
    orderBy: [{ voiceSelfFillReviewedAt: "asc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      fullName: true,
      mobile: true,
      email: true,
      voiceSelfFillStatus: true,
      voiceSelfFillReason: true,
      updatedAt: true,
    },
    take: 100,
  });

  const rows: AdminVoiceAccessRow[] = users.map((u) => ({
    id: u.id,
    fullName: u.fullName,
    maskedMobile: u.mobile ? maskMobile(u.mobile) : null,
    maskedEmail: u.email ? maskEmail(u.email) : null,
    status: u.voiceSelfFillStatus,
    reason: u.voiceSelfFillReason,
    requestedAt: u.updatedAt.toISOString().slice(0, 10),
  }));

  const pendingCount = rows.filter((r) => r.status === "PENDING").length;

  return (
    <AdminShell adminName={user.fullName}>
      <div className="mx-auto max-w-4xl">
        <section className="mb-6">
          <h1 className="text-2xl font-bold text-wine-700">Voice Access</h1>
          <p className="mt-2 text-sm text-muted">
            Voice se profile bharna default me sirf &ldquo;bete/beti ke liye&rdquo; ke liye khula hai — apne liye
            bharne ke liye ye ek-baar ki chhoot hai.{" "}
            {pendingCount > 0
              ? `${pendingCount} request review ke liye pending hain.`
              : "Koi request pending nahi hai."}
          </p>
        </section>

        <VoiceAccessReviewList rows={rows} />
      </div>
    </AdminShell>
  );
}
