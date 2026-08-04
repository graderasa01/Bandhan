import Card from "@/components/ui/Card";
import type { ProfileViewSection } from "@/lib/contracts/profileView";

/**
 * The label column is narrow on phones for the same reason the biodata's is:
 * a 160px label inside a 335px screen leaves the value nothing to live in.
 */
export default function ProfileSectionList({ sections }: { sections: ProfileViewSection[] }) {
  return (
    <div className="space-y-4">
      {sections.map((s) => (
        <Card key={s.title} padding="md">
          <h2 className="mb-3 text-[0.6875rem] font-semibold uppercase tracking-wider text-subtle">
            {s.title}
          </h2>
          <dl className="space-y-2.5">
            {s.rows.map((r) => (
              <div key={r.label} className="flex gap-3 text-[0.875rem]">
                <dt className="w-28 shrink-0 text-muted sm:w-40">{r.label}</dt>
                <dd className="min-w-0 flex-1 font-medium text-ink">{r.value}</dd>
              </div>
            ))}
          </dl>
        </Card>
      ))}
    </div>
  );
}
