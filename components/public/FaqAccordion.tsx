import { ChevronDown } from "lucide-react";

/**
 * Native <details>/<summary> — keyboard, screen-reader and no-JS support come
 * free, which a div-with-onClick accordion has to reimplement badly.
 */
export default function FaqAccordion({ items }: { items: { q: string; a: string }[] }) {
  if (items.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => (
        <details
          key={item.q}
          className="group rounded-lg border border-line bg-surface transition-colors open:border-gold-300 hover:border-line-strong"
        >
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-[0.9375rem] font-semibold text-ink [&::-webkit-details-marker]:hidden">
            {item.q}
            <ChevronDown className="size-4 shrink-0 text-muted transition-transform duration-200 group-open:rotate-180" />
          </summary>
          <p className="px-5 pb-5 text-[0.875rem] leading-relaxed text-muted">{item.a}</p>
        </details>
      ))}
    </div>
  );
}
