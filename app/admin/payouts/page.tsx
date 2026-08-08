import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { payoutProvider } from "@/lib/services/payouts/payoutService";
import { paiseToRupeeDisplay } from "@/lib/utils/money";
import AdminShell from "@/components/layout/AdminShell";
import PayoutQueue, { type AdminAccountRow, type AdminWithdrawalRow } from "@/components/admin/PayoutQueue";

function fmt(d: Date): string {
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default async function AdminPayoutsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login?next=/admin/payouts");
  if (user.role !== "ADMIN") redirect("/");

  const [accounts, withdrawals] = await Promise.all([
    prisma.partnerPayoutAccount.findMany({
      where: { verifiedAt: null },
      orderBy: { updatedAt: "asc" },
      include: { partner: { select: { fullName: true } } },
    }),
    prisma.partnerWithdrawal.findMany({
      // Open requests first, then a short tail of settled ones for context.
      orderBy: [{ status: "asc" }, { requestedAt: "asc" }],
      take: 50,
      include: {
        partner: { select: { id: true, fullName: true, payoutAccount: true } },
      },
    }),
  ]);

  const accountRows: AdminAccountRow[] = accounts.map((a) => ({
    partnerId: a.partnerId,
    partnerName: a.partner.fullName,
    method: a.method,
    accountHolderName: a.accountHolderName,
    // Only the last four ever reaches the client — the full number comes from
    // the audited reveal endpoint, at the moment a transfer is being made.
    maskedTarget: `••••${(a.method === "UPI" ? a.upiLast4 : a.accountLast4) ?? ""}`,
    ifsc: a.ifsc,
    bankName: a.bankName,
    submittedAt: fmt(a.updatedAt),
  }));

  const withdrawalRows: AdminWithdrawalRow[] = withdrawals.map((w) => {
    const acct = w.partner.payoutAccount;
    return {
      id: w.id,
      partnerId: w.partner.id,
      partnerName: w.partner.fullName,
      amount: paiseToRupeeDisplay(w.amountPaise),
      status: w.status,
      requestedAt: fmt(w.requestedAt),
      accountMethod: acct?.method ?? null,
      accountHolderName: acct?.accountHolderName ?? null,
      maskedTarget: acct ? `••••${(acct.method === "UPI" ? acct.upiLast4 : acct.accountLast4) ?? ""}` : null,
      ifsc: acct?.ifsc ?? null,
      bankName: acct?.bankName ?? null,
      accountVerified: Boolean(acct?.verifiedAt),
    };
  });

  const provider = payoutProvider();

  return (
    <AdminShell adminName={user.fullName}>
      <div className="mx-auto max-w-4xl">
        <section className="mb-6">
          <h1 className="text-2xl font-bold text-wine-700">Payouts</h1>
          <p className="mt-2 text-sm text-muted">
            Partner ke account details verify kariye, phir withdrawal approve karke paisa bhejiye aur UTR daaliye.
          </p>
          {!provider.isAutomatic && (
            <p className="mt-2 inline-block rounded-full border border-warn/30 bg-warn-bg px-3 py-1 text-[0.75rem] font-medium text-warn">
              Automatic transfer abhi off hai — transfer aap apne bank se karenge, yahan sirf record hoga
            </p>
          )}
        </section>

        <PayoutQueue
          pendingAccounts={accountRows}
          withdrawals={withdrawalRows}
          automatic={provider.isAutomatic}
        />
      </div>
    </AdminShell>
  );
}
