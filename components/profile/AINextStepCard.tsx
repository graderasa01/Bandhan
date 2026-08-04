import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, Lightbulb, Zap } from "lucide-react";
import type { AIInsightViewModel } from "@/lib/contracts/ai";
import Card from "@/components/ui/Card";

interface Props {
  data: AIInsightViewModel;
}

const TONE_CONFIG: Record<
  AIInsightViewModel["tone"],
  { bg: string; ring: string; text: string; icon: typeof Lightbulb }
> = {
  danger: { bg: "bg-danger-bg", ring: "ring-danger/40", text: "text-danger", icon: AlertTriangle },
  warning: { bg: "bg-warn-bg", ring: "ring-warn/40", text: "text-warn", icon: Zap },
  success: { bg: "bg-trust/10", ring: "ring-trust/40", text: "text-trust", icon: CheckCircle2 },
  trust: { bg: "bg-trust/10", ring: "ring-trust/40", text: "text-trust", icon: CheckCircle2 },
  info: { bg: "bg-gold-100 dark:bg-gold-900/40", ring: "ring-gold-400/40", text: "text-gold-700", icon: Lightbulb },
};

export default function AINextStepCard({ data }: Props) {
  const { bg, ring, text, icon: Icon } = TONE_CONFIG[data.tone] ?? TONE_CONFIG.info;

  return (
    <Card variant="default" padding="lg">
      <div className="flex items-start gap-4" role="status">
        <div className={`grid size-10 shrink-0 place-items-center rounded-full ring-2 ${bg} ${ring} ${text}`} aria-hidden>
          <Icon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-wine-700">{data.title}</h3>
          <p className="mt-1.5 text-sm text-muted">{data.message}</p>
          {data.ctaLabel && (
            <Link
              href={data.ctaActionId ?? "/profile/build"}
              className={`mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-gradient-to-b from-gold-400 to-gold-600 px-4 text-sm font-semibold text-primary-fg shadow-sm transition-transform hover:-translate-y-0.5`}
            >
              {data.ctaLabel}
              <ArrowRight className="size-4" />
            </Link>
          )}
        </div>
      </div>
    </Card>
  );
}
