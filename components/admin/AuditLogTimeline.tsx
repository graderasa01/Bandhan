import Badge from "@/components/ui/Badge";

interface Log { timestamp: string; actor: string; role: string; action: string; target: string; previous: string; newValue: string; }

interface Props { logs: Log[]; }

export default function AuditLogTimeline({ logs }: Props) {
  return (
    <div className="space-y-0">
      {logs.map((log, i) => (
        <div key={i} className="flex gap-3 pb-4">
          <div className="flex flex-col items-center">
            <div className="w-3 h-3 rounded-full bg-amber-600 mt-1.5" />
            {i < logs.length - 1 && <div className="w-0.5 flex-1 bg-stone-300 mt-1" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-stone-500">{log.timestamp}</p>
            <p className="text-sm">
              <span className="font-medium text-gray-800">{log.actor}</span>{" "}
              <Badge variant="pending">{log.role}</Badge>
            </p>
            <p className="text-sm text-stone-700 mt-0.5">{log.action}</p>
            <p className="text-xs text-stone-500">{log.target}</p>
            <p className="text-xs text-stone-400 mt-0.5">
              <span className="bg-stone-100 px-1 rounded">{log.previous}</span> → <span className="bg-stone-100 px-1 rounded">{log.newValue}</span>
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}