import Card from "@/components/ui/Card";

interface Props { title: string; value: string | number; trend?: number; }

export default function AdminMetricCard({ title, value, trend }: Props) {
  return (
    <Card>
      <p className="text-xs text-stone-500 font-medium mb-1">{title}</p>
      <p className="text-2xl font-bold text-amber-600">{value}</p>
      {trend !== undefined && (
        <p className={`text-xs mt-1 ${trend >= 0 ? "text-emerald-600" : "text-red-600"}`}>
          {trend >= 0 ? "↑" : "↓"} {Math.abs(trend)}%
        </p>
      )}
    </Card>
  );
}