import type { ComponentType } from "react";
import InfoTip from "@/components/ui/InfoTip";
import { cn } from "@/lib/utils";

export interface FeatureChipItem {
  icon: ComponentType<{ className?: string }>;
  label: string;
  /** The sentence this chip used to be — tucked behind an (i) tap instead of printed under the icon. */
  detail?: string;
  tone?: "primary" | "trust" | "warn" | "danger" | "info";
}

const TONE_CLASSES: Record<NonNullable<FeatureChipItem["tone"]>, string> = {
  primary: "bg-primary/15 text-primary-text",
  trust: "bg-trust-bg text-trust",
  warn: "bg-warn-bg text-warn",
  danger: "bg-danger-bg text-danger",
  info: "bg-info-bg text-info",
};

/**
 * Icon + short label, scannable at a glance instead of a full sentence per
 * row — the explanation moves into an InfoTip so nobody who doesn't need it
 * has to read past the label.
 */
export function FeatureChip({ icon: Icon, label, detail, tone = "primary" }: FeatureChipItem) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-line bg-surface-2 px-3 py-2.5">
      <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", TONE_CLASSES[tone])}>
        <Icon className="size-4" />
      </span>
      <p className="min-w-0 flex-1 text-[0.8125rem] font-medium leading-snug text-ink">{label}</p>
      {detail && <InfoTip text={detail} className="shrink-0" />}
    </div>
  );
}

export default function FeatureGrid({ items, className }: { items: FeatureChipItem[]; className?: string }) {
  return (
    <div className={cn("grid grid-cols-1 gap-2 sm:grid-cols-2", className)}>
      {items.map((item, i) => (
        <FeatureChip key={i} {...item} />
      ))}
    </div>
  );
}
