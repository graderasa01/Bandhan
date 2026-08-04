import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";

interface Props { eligibleAmount: string; paidAmount: string; status: string; lastPayoutDate?: string; }

export default function PayoutStatusCard({ eligibleAmount, paidAmount, status, lastPayoutDate }: Props) {
  const st = status === "Paid" ? "paid" as const : status === "Ready" ? "complete" as const : "pending" as const;
  return (
    <Card title="Payout Status">
      <div className="flex items-center gap-2 mb-3"><Badge variant={st}>{status}</Badge></div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div><span className="text-stone-500">Eligible</span><p className="font-semibold text-gray-800">{eligibleAmount}</p></div>
        <div><span className="text-stone-500">Paid</span><p className="font-semibold text-gray-800">{paidAmount}</p></div>
        {lastPayoutDate && <div className="col-span-2"><span className="text-stone-500">Last Payout</span><p className="text-stone-600">{lastPayoutDate}</p></div>}
      </div>
      <p className="text-xs text-stone-400 mt-3">MVP me payout admin verification ke baad manually update hoga.</p>
    </Card>
  );
}