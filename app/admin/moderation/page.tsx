import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getPendingMedia } from "@/lib/services/voice/voiceNoteService";
import { getPendingQuestions } from "@/lib/services/askBridge/profileQuestionService";
import { getOpenReports } from "@/lib/services/safety/reportService";
import AdminShell from "@/components/layout/AdminShell";
import ModerationQueue from "@/components/admin/ModerationQueue";

export default async function AdminModerationPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin/moderation");
  if (user.role !== "ADMIN") redirect("/");

  const [pendingMedia, pendingQuestions, reports] = await Promise.all([
    getPendingMedia(),
    getPendingQuestions(),
    getOpenReports(),
  ]);

  return (
    <AdminShell adminName={user.fullName}>
      <div className="mx-auto max-w-3xl">
        <section className="mb-6">
          <h1 className="text-2xl font-bold text-wine-700">Moderation</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Jo recordings ya sawaal automatic screening clear nahi kar paye, wo yahan rukte hain — bhejne
            wale ka action ho chuka hai par doosri taraf ko abhi tak bataya nahi gaya. Approve karte hi
            unhe notice chala jayega. Neeche users ki bheji hui reports hain.
          </p>
        </section>

        <ModerationQueue
          pendingMedia={pendingMedia.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() }))}
          pendingQuestions={pendingQuestions.map((q) => ({ ...q, createdAt: q.createdAt.toISOString() }))}
          reports={reports.map((r) => ({
            id: r.id,
            reporterName: r.reporterName,
            reportedName: r.reportedName,
            reason: r.reason,
            details: r.details,
            targetType: r.targetType,
            reportedUserOpenCount: r.reportedUserOpenCount,
            createdAt: r.createdAt.toISOString(),
          }))}
        />
      </div>
    </AdminShell>
  );
}
