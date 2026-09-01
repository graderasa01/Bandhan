import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, Lightbulb, Zap } from "lucide-react";
import type { AIInsightViewModel } from "@/lib/contracts/ai";
import { LeafSpray } from "@/components/public/_shared/Ornaments";
import { cn } from "@/lib/utils";

interface Props {
  data: AIInsightViewModel;
}

/**
 * The one "do this next" line on the dashboard, as a banner rather than
 * another card in the stack.
 *
 * It is the only block here that is an instruction, so it gets the shape
 * nothing else has: full width, cream, botanicals in both margins, and the
 * call to action parked on the right where the eye lands last. Sitting in the
 * same white card as everything else, it read as one more panel to skim past.
 */
const TONE_RING: Record<AIInsightViewModel["tone"], { ring: string; icon: typeof Lightbulb }> = {
  danger: { ring: "border-danger/35 bg-danger-bg text-danger", icon: AlertTriangle },
  warning: { ring: "border-warn/35 bg-warn-bg text-warn", icon: Zap },
  success: { ring: "bt-ring--trust", icon: CheckCircle2 },
  trust: { ring: "bt-ring--trust", icon: CheckCircle2 },
  info: { ring: "", icon: Lightbulb },
};

export default function AINextStepCard({ data }: Props) {
  const { ring, icon: Icon } = TONE_RING[data.tone] ?? TONE_RING.info;

  return (
    <section className="bt-shell bt-shell--cream bt-shell--foil px-5 py-6 sm:px-8 sm:py-7">
      <LeafSpray className="bt-vine -left-10 -top-8 h-[196px] w-[118px]" />
      <LeafSpray
        flip
        className="bt-vine bt-vine--soft -bottom-10 -right-8 hidden h-[176px] w-[106px] sm:block"
      />

      <div
        className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-6"
        role="status"
      >
        <span className={cn("bt-ring [--paper-ring-size:3.25rem]", ring)}>
          <Icon className="size-6" />
        </span>

        <div className="min-w-0 flex-1">
          <h3 className="bt-display text-[1.35rem] leading-snug sm:text-[1.55rem]">{data.title}</h3>
          <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-muted">{data.message}</p>
        </div>

        {data.ctaLabel && (
          <Link
            href={data.ctaActionId ?? "/profile/build"}
            className="bt-cta inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-full px-6 text-[0.9375rem] font-semibold transition-transform duration-200 hover:-translate-y-0.5"
          >
            {data.ctaLabel}
            <ArrowRight className="size-4" />
          </Link>
        )}
      </div>
    </section>
  );
}
