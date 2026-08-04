import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";

interface Props {
  name: string; age: number; gender: string; city: string;
  profileStatus: string; completion: number; subscription: string;
  commission: string; date: string;
}

export default function PartnerLeadCard({ name, age, gender, city, profileStatus, completion, subscription, commission, date }: Props) {
  const statusVariant = profileStatus === "Complete" ? "complete" as const : "incomplete" as const;
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex justify-between items-start">
        <div>
          <h4 className="font-semibold text-gray-800">{name}</h4>
          <p className="text-xs text-stone-500">{age} {gender} • {city}</p>
        </div>
        <Badge variant={statusVariant}>{profileStatus}</Badge>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <span className="text-stone-500">Completion</span><span className="text-right">{completion}%</span>
        <span className="text-stone-500">Subscription</span><span className="text-right">{subscription}</span>
        <span className="text-stone-500">Commission</span><span className="text-right">{commission}</span>
        <span className="text-stone-500">Registered</span><span className="text-right">{date}</span>
      </div>
      <button className="text-xs font-medium text-amber-600 hover:text-amber-800 self-start">View →</button>
    </Card>
  );
}