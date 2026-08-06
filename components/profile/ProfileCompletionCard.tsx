import Link from "next/link";
import { ListChecks, Sparkles } from "lucide-react";
import Card from "@/components/ui/Card";
import Progress from "@/components/ui/Progress";

interface Props {
  percentage: number;
  missingFields: string[];
  onImproveWithAI?: () => void;
}

export default function ProfileCompletionCard({ percentage, missingFields, onImproveWithAI }: Props) {
  return (
    <Card variant="default" padding="lg">
      <h3 className="text-base font-semibold text-wine-700">Profile Completion</h3>
      <div className="mt-4">
        <Progress value={percentage} label={`Aapki profile ${percentage}% complete hai`} variant="trust" />
      </div>

      {missingFields.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-wider text-subtle">Missing</p>
          <ul className="flex flex-wrap gap-2">
            {missingFields.map((f) => (
              <li
                key={f}
                className="rounded-full border border-warn/30 bg-warn-bg px-3 py-1 text-[0.8125rem] text-warn"
              >
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        {onImproveWithAI && (
          <button
            type="button"
            onClick={onImproveWithAI}
            className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-gold-700 transition-colors hover:text-gold-800"
          >
            <Sparkles className="size-4" />
            Complete with AI
          </button>
        )}
        <Link
          href="/profile/build?mode=manual"
          className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary-text hover:text-primary-hover"
        >
          <ListChecks className="size-4" />
          Fill Full Profile Form
        </Link>
      </div>
    </Card>
  );
}
