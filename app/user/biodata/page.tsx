import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Check } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getOrCreateProfile } from "@/lib/services/profile/draftService";
import { buildBiodata } from "@/lib/services/biodata/biodataExport";
import BiodataPrintButton from "@/components/profile/BiodataPrintButton";
import ShareBiodataCard from "@/components/profile/ShareBiodataCard";
import { cn } from "@/lib/utils";

/**
 * The printable shaadi biodata.
 *
 * Deliberately outside `UserShell`: this page *is* a document, and a sidebar
 * plus bottom nav are two more things to hide at print time and get wrong. The
 * only chrome is the toolbar above the sheet, and it carries `print:hidden`.
 *
 * Options live in the URL rather than client state so the server can rebuild
 * the document with them — the mobile number and income never reach the
 * browser unless the user has actually asked for them to be on the page.
 */

const HEADERS = {
  ganesh: "॥ श्री गणेशाय नमः ॥",
  bismillah: "بِسْمِ ٱللَّٰهِ",
  ek: "॥ ੴ ॥",
  none: null,
} as const;

type HeaderKey = keyof typeof HEADERS;

const HEADER_LABELS: Record<HeaderKey, string> = {
  ganesh: "श्री गणेशाय नमः",
  bismillah: "بِسْمِ ٱللَّٰهِ",
  ek: "ੴ",
  none: "Koi nahi",
};

export default async function BiodataPage({
  searchParams,
}: {
  searchParams?: Promise<{ mobile?: string; income?: string; head?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/user/biodata");

  const params = searchParams ? await searchParams : {};
  const includeMobile = params.mobile === "1";
  const includeIncome = params.income === "1";
  const headerKey: HeaderKey = params.head && params.head in HEADERS ? (params.head as HeaderKey) : "none";

  const profile = await getOrCreateProfile(user.id);
  const doc = buildBiodata(profile, { includeMobile, includeIncome, mobile: user.mobile });

  /** Keeps the other toggles intact when flipping one. */
  const hrefWith = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const merged = {
      mobile: includeMobile ? "1" : undefined,
      income: includeIncome ? "1" : undefined,
      head: headerKey === "none" ? undefined : headerKey,
      ...patch,
    };
    for (const [k, v] of Object.entries(merged)) if (v) next.set(k, v);
    const qs = next.toString();
    return qs ? `/user/biodata?${qs}` : "/user/biodata";
  };

  const invocation = HEADERS[headerKey];

  return (
    <div className="min-h-dvh bg-bg-subtle py-6 print:bg-white print:py-0">
      {/* @page can't be expressed in a utility class, and print colour retention
          has to be forced or browsers drop every fill to save ink. */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              @page { size: A4; margin: 12mm; }
              html, body { background: #fff !important; }
              .biodata-sheet {
                box-shadow: none !important;
                border: none !important;
                margin: 0 !important;
                max-width: none !important;
                width: 100% !important;
              }
              .biodata-sheet, .biodata-sheet * {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              .biodata-section { break-inside: avoid; }
            }
          `,
        }}
      />

      <div className="mx-auto max-w-[820px] px-4 print:max-w-none print:px-0">
        {/* Toolbar */}
        <div className="mb-5 print:hidden">
          <Link
            href="/user/dashboard"
            className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink"
          >
            <ArrowLeft className="size-4" />
            Dashboard
          </Link>

          <div className="mt-3 rounded-lg border border-line bg-surface p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-lg font-semibold text-wine-700">Aapki Biodata</h1>
                <p className="mt-0.5 text-[0.8125rem] text-muted">
                  Print dialog me &ldquo;Save as PDF&rdquo; chunkar WhatsApp par bhej sakte hain.
                </p>
              </div>
              <BiodataPrintButton />
            </div>

            <div className="mt-4 border-t border-line pt-4">
              <p className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-wider text-subtle">Upar likha</p>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(HEADERS) as HeaderKey[]).map((key) => (
                  <Toggle key={key} href={hrefWith({ head: key === "none" ? undefined : key })} on={headerKey === key}>
                    {HEADER_LABELS[key]}
                  </Toggle>
                ))}
              </div>

              <p className="mb-2 mt-4 text-[0.6875rem] font-semibold uppercase tracking-wider text-subtle">
                Ye bhi shaamil karein
              </p>
              <div className="flex flex-wrap gap-2">
                <Toggle href={hrefWith({ mobile: includeMobile ? undefined : "1" })} on={includeMobile}>
                  Mobile number
                </Toggle>
                <Toggle href={hrefWith({ income: includeIncome ? undefined : "1" })} on={includeIncome}>
                  Aay (income)
                </Toggle>
              </div>
              <p className="mt-2.5 text-[0.75rem] leading-snug text-muted">
                Dono by default band hain. Biodata aage forward hoti hai — soch kar on karein.
              </p>
            </div>
          </div>

          <div className="mt-4">
            <ShareBiodataCard />
          </div>
        </div>

        {/* The sheet */}
        <article className="biodata-sheet mx-auto rounded-lg border border-gold-300/60 bg-white p-4 shadow-lg sm:p-12">
          <div className="border-[3px] border-double border-gold-600/70 p-5 sm:p-8">
            {invocation && (
              <p className="mb-1 text-center text-[0.9375rem] font-semibold text-[#7A1F2B]">{invocation}</p>
            )}
            <p className="text-center text-[0.6875rem] font-semibold uppercase tracking-[0.3em] text-[#B08C4F]">
              Biodata
            </p>

            <div className="mt-6 flex items-start justify-between gap-6">
              <div className="min-w-0 flex-1">
                <h2 className="font-[family-name:var(--font-display)] text-3xl font-bold leading-tight text-[#7A1F2B]">
                  {doc.name}
                </h2>
                {doc.tagline && (
                  <p className="mt-2 max-w-md text-[0.875rem] italic leading-relaxed text-[#4A4038]">
                    &ldquo;{doc.tagline}&rdquo;
                  </p>
                )}
              </div>

              {doc.photoUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- user-uploaded URL, not build-known
                <img
                  src={doc.photoUrl}
                  alt=""
                  className="size-32 shrink-0 rounded-md border-2 border-gold-600/50 object-cover sm:size-36"
                />
              )}
            </div>

            {doc.sections.map((s) => (
              <section key={s.title} className="biodata-section mt-7">
                <h3 className="mb-3 border-b border-gold-600/30 pb-1.5 text-[0.8125rem] font-bold uppercase tracking-[0.15em] text-[#B08C4F]">
                  {s.title}
                </h3>
                <dl className="space-y-1.5">
                  {s.rows.map((r) => (
                    <div key={r.label} className="flex gap-3 text-[0.875rem] leading-relaxed">
                      {/* Fixed label column keeps the values aligned like a printed
                          biodata — but 160px of it on a 375px phone leaves the value
                          nothing to sit in, so it narrows below `sm`. */}
                      <dt className="w-28 shrink-0 text-[#6B6259] sm:w-40">{r.label}</dt>
                      <dd className="min-w-0 flex-1 font-medium text-[#2B241E]">{r.value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}

            <footer className="mt-9 border-t border-gold-600/30 pt-3 text-center">
              {doc.verifiedLabel && (
                <p className="text-[0.75rem] font-semibold text-[#1F7A5A]">✓ {doc.verifiedLabel}</p>
              )}
              <p className="mt-0.5 text-[0.6875rem] tracking-wide text-[#9A8F84]">BandhanTak.com</p>
            </footer>
          </div>
        </article>
      </div>
    </div>
  );
}

function Toggle({ href, on, children }: { href: string; on: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-pressed={on}
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors",
        on
          ? "border-gold-500 bg-gold-100 text-gold-800 dark:bg-gold-900/40 dark:text-gold-200"
          : "border-line bg-surface text-muted hover:border-gold-400 hover:text-ink",
      )}
    >
      {on && <Check className="size-3.5" />}
      {children}
    </Link>
  );
}
