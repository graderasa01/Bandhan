import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import AdminShell from "@/components/layout/AdminShell";
import Card from "@/components/ui/Card";
import Pill from "@/components/ui/Pill";
import SpotlightRefundButton from "@/components/admin/SpotlightRefundButton";
import { listSpotlightRefundQueue } from "@/lib/services/spotlight/deliveryService";
import { paiseToRupeeDisplay } from "@/lib/utils/money";

export const dynamic = "force-dynamic";

/**
 * Spotlight campaigns that ended — or stopped — short of the reach they were
 * sold with (D-90 Phase 6).
 *
 * The app never moves money. This page only says who is owed what and why;
 * the refund itself is done by an admin in the Razorpay dashboard, and marking
 * it here is what takes the row off the list.
 */
export default async function AdminSpotlightPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login?next=/admin/spotlight");
  if (user.role !== "ADMIN") redirect("/");

  const rows = await listSpotlightRefundQueue();

  return (
    <AdminShell adminName={user.fullName}>
      <div className="mx-auto max-w-4xl">
        <section className="mb-6">
          <h1 className="text-2xl font-bold text-wine-700">Spotlight refunds</h1>
          <p className="mt-2 text-sm text-muted">
            Jin campaigns ki window khatam ho gayi, ya jo ruk gaye, aur wade jitne logon tak nahi pahunche. Refund
            Razorpay dashboard se haath se karein — app khud paisa nahi bhejta. Refund karke yahan uska id likh kar
            &ldquo;Mark Refunded&rdquo; dabayein.
          </p>
        </section>

        {rows.length === 0 ? (
          <Card variant="soft" padding="lg">
            <p className="text-sm text-muted">Koi refund baaki nahi.</p>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {rows.map((r) => (
              <Card key={r.campaignId} padding="md">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">
                      {r.ownerName}{" "}
                      <span className="font-normal text-muted">· {r.itemCode.replace(/_/g, " ")}</span>
                    </p>
                    <p className="mt-0.5 text-sm text-muted">
                      {r.deliveredReach} / {r.promisedReach} log pahunche · paid {paiseToRupeeDisplay(r.paidPaise)}
                    </p>
                    {r.status === "PAUSED" && (
                      <p className="mt-0.5 text-sm text-warn">Ruka hua: {r.pausedReason ?? "—"}</p>
                    )}
                    <p className="mt-1 text-xs text-subtle">
                      Razorpay payment: {r.paymentRef ?? "—"}
                      {r.paymentRefunded ? " · gateway par refunded" : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <Pill tone={r.status === "PAUSED" ? "neutral" : "gold"} size="sm">
                      {r.status === "PAUSED" ? "Paused" : "Window over"}
                    </Pill>
                    <p className="mt-2 text-lg font-bold text-wine-700">{paiseToRupeeDisplay(r.suggestedRefundPaise)}</p>
                    <p className="text-xs text-muted">kam reach ke hisaab se refund</p>
                  </div>
                </div>
                <div className="mt-3">
                  <SpotlightRefundButton campaignId={r.campaignId} />
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AdminShell>
  );
}
