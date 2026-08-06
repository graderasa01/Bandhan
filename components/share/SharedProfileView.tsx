import Link from "next/link";
import { BadgeCheck, Phone, Send, ShieldCheck } from "lucide-react";
import BrandMark from "@/components/layout/BrandMark";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import type { BiodataDocument } from "@/lib/services/biodata/biodataExport";

export interface SharedProfileViewProps {
  doc: BiodataDocument;
  age: number | null;
  city: string | null;
  photoVerified: boolean;
  mobileVerified: boolean;
  trustScore: number | null;
  trustScoreLabel: string | null;
  /** Present only for RISHTA_CARD — who sent this link onward, and when. */
  watermark: { sharerName: string; sharedOn: string } | null;
}

/**
 * The web page a WhatsApp forward actually opens into — deliberately not the
 * print biodata's formal double-border sheet. That layout is tuned for A4 and
 * hardcodes print-safe hex so ink renders reliably; this one is read on a
 * phone screen inside a chat app, so it gets the real design system back —
 * `Card`, `Badge`, dark mode, brand gradients — and a "visiting card" hero
 * instead of a data sheet.
 */
export default function SharedProfileView({
  doc,
  age,
  city,
  photoVerified,
  mobileVerified,
  trustScore,
  trustScoreLabel,
  watermark,
}: SharedProfileViewProps) {
  return (
    <div className="mx-auto max-w-lg px-4 py-6 sm:py-10">
      <div className="mb-5 flex justify-center">
        <BrandMark />
      </div>

      {watermark && (
        <p className="mb-4 flex items-center justify-center gap-1.5 rounded-full border border-gold-300/50 bg-gold-50 px-3.5 py-2 text-center text-[0.75rem] font-medium text-gold-800 dark:border-gold-700/40 dark:bg-gold-900/30 dark:text-gold-200">
          <Send className="size-3.5 shrink-0" />
          {watermark.sharerName} ne share kiya · {watermark.sharedOn}
        </p>
      )}

      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-lg">
        <div className="h-24 bg-gradient-to-br from-wine-600 via-wine-700 to-wine-900 sm:h-28" />

        <div className="-mt-14 flex flex-col items-center px-6 pb-7 text-center sm:-mt-16">
          <div className="size-28 shrink-0 overflow-hidden rounded-full border-4 border-surface bg-gradient-to-br from-wine-100 via-gold-100 to-sand-200 shadow-md sm:size-32 dark:from-wine-900 dark:via-gold-900 dark:to-sand-800">
            {doc.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- user-uploaded URL, not build-known
              <img src={doc.photoUrl} alt={doc.name} className="size-full object-cover" />
            ) : (
              <span className="grid size-full place-items-center text-3xl font-bold text-gold-700 dark:text-gold-200">
                {doc.name[0]?.toUpperCase() ?? "?"}
              </span>
            )}
          </div>

          <h1 className="mt-3 font-[family-name:var(--font-display)] text-2xl font-bold text-ink">
            {doc.name}
            {age != null && `, ${age}`}
          </h1>
          {city && <p className="mt-0.5 text-[0.9375rem] text-muted">{city}</p>}

          <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
            {photoVerified && (
              <Badge variant="verified" icon={<BadgeCheck />}>
                Photo verified
              </Badge>
            )}
            {mobileVerified && (
              <Badge variant="complete" icon={<Phone />}>
                Mobile verified
              </Badge>
            )}
            {trustScore != null && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-trust/10 px-2.5 py-1 text-xs font-medium text-trust">
                <ShieldCheck className="size-3.5" />
                Trust score {trustScore}
                {trustScoreLabel && ` · ${trustScoreLabel}`}
              </span>
            )}
          </div>

          {doc.tagline && (
            <p className="mt-4 max-w-sm text-[0.9375rem] italic leading-relaxed text-ink">
              &ldquo;{doc.tagline}&rdquo;
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {doc.sections.map((s) => (
          <Card key={s.title} padding="md">
            <h2 className="mb-3 text-[0.6875rem] font-semibold uppercase tracking-wider text-subtle">{s.title}</h2>
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

      <div className="mt-6 text-center">
        {doc.verifiedLabel && (
          <p className="inline-flex items-center gap-1.5 text-[0.8125rem] font-medium text-trust">
            <ShieldCheck className="size-4" />
            {doc.verifiedLabel}
          </p>
        )}

        <div className="mt-4 rounded-xl border border-gold-300/50 bg-gold-50 p-5 dark:border-gold-700/40 dark:bg-gold-900/20">
          <p className="text-[0.875rem] font-medium text-ink">BandhanTak — AI-powered verified matrimony</p>
          <p className="mt-1 text-[0.8125rem] text-muted">Verified profiles, trust score aur privacy-first rishta journey.</p>
          <Link
            href="/"
            className="mt-3 inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-fg shadow-md transition-colors hover:bg-primary-hover"
          >
            Explore BandhanTak
          </Link>
        </div>
      </div>
    </div>
  );
}
