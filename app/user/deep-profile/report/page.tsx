import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getOrCreateProfile } from "@/lib/services/profile/draftService";
import { getDeepProfileView } from "@/lib/services/deepProfile/deepProfileService";
import { isFeatureAvailable } from "@/lib/services/plans/entitlements";
import { DIMENSION_DESCRIPTIONS } from "@/lib/constants/deepDimensions";
import BiodataPrintButton from "@/components/profile/BiodataPrintButton";

/**
 * §7.3's resolution, made real: the honest paid unlock in place of the
 * red/green-flag paywall the doc explicitly rules out. Reuses `biodataExport`'s
 * whole approach rather than inventing a second one — a print-optimised page
 * plus the browser's own "Save as PDF", no PDF library anywhere in this repo.
 *
 * Gated on *all 13 computed*, not just entitled — `getDeepProfileView`
 * separates "entitled but not yet analyzed" from "actually scored", and a
 * report with blank rows is worse than no report. If either check fails this
 * redirects back to the panel, which already carries the right CTA (Analyze
 * or Upgrade) for whichever case it is.
 */
const LABEL_TONE: Record<string, string> = {
  STRONG: "#1F7A5A",
  GOOD: "#1F7A5A",
  MODERATE: "#B08C4F",
  LOW: "#7A1F2B",
  UNKNOWN: "#9A8F84",
};

export default async function DeepProfileReportPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/user/deep-profile/report");

  const [gate, data, profile] = await Promise.all([
    isFeatureAvailable(user.id, "deepReport"),
    getDeepProfileView(user.id),
    getOrCreateProfile(user.id),
  ]);

  if (!gate.allowed || data.unlocked.length < data.totalDimensions) {
    redirect("/user/deep-profile");
  }

  const primaryPhoto = profile.photos.find((p) => p.isPrimary) ?? profile.photos[0];
  const name = profile.displayName ?? "Profile";

  return (
    <div className="min-h-dvh bg-bg-subtle py-6 print:bg-white print:py-0">
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              @page { size: A4; margin: 12mm; }
              html, body { background: #fff !important; }
              .report-sheet {
                box-shadow: none !important;
                border: none !important;
                margin: 0 !important;
                max-width: none !important;
                width: 100% !important;
              }
              .report-sheet, .report-sheet * {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              .report-row { break-inside: avoid; }
            }
          `,
        }}
      />

      <div className="mx-auto max-w-[820px] px-4 print:max-w-none print:px-0">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4 print:hidden">
          <div>
            <h1 className="text-lg font-semibold text-wine-700">Deep Compatibility Report</h1>
            <p className="mt-0.5 text-[0.8125rem] text-muted">
              Print dialog me &ldquo;Save as PDF&rdquo; chunkar family ko bhej sakte hain.
            </p>
          </div>
          <BiodataPrintButton />
        </div>

        <article className="report-sheet mx-auto rounded-lg border border-gold-300/60 bg-white p-4 shadow-lg sm:p-12">
          <div className="border-[3px] border-double border-gold-600/70 p-5 sm:p-8">
            <p className="text-center text-[0.6875rem] font-semibold uppercase tracking-[0.3em] text-[#B08C4F]">
              Deep Compatibility Report
            </p>

            <div className="mt-6 flex items-start justify-between gap-6">
              <div className="min-w-0 flex-1">
                <h2 className="font-[family-name:var(--font-display)] text-3xl font-bold leading-tight text-[#7A1F2B]">
                  {name}
                </h2>
                <p className="mt-2 max-w-md text-[0.8125rem] leading-relaxed text-[#4A4038]">
                  Ye {data.totalDimensions} dimensions {name} ke apne profile fields se nikale gaye hain — AI ne
                  kabhi kuch invent nahi kiya, sirf jo bataya gaya hai wahi.
                </p>
              </div>

              {primaryPhoto && (
                // eslint-disable-next-line @next/next/no-img-element -- user-uploaded URL, not build-known
                <img
                  src={primaryPhoto.fileUrl}
                  alt=""
                  className="size-32 shrink-0 rounded-md border-2 border-gold-600/50 object-cover sm:size-36"
                />
              )}
            </div>

            <section className="mt-7">
              <h3 className="mb-3 border-b border-gold-600/30 pb-1.5 text-[0.8125rem] font-bold uppercase tracking-[0.15em] text-[#B08C4F]">
                Dimensions
              </h3>
              <div className="space-y-4">
                {data.unlocked.map((item) => (
                  <div key={item.key} className="report-row flex items-start justify-between gap-4 border-b border-gold-600/15 pb-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.9375rem] font-semibold text-[#2B241E]">{item.label}</p>
                      <p className="mt-0.5 text-[0.75rem] text-[#9A8F84]">{DIMENSION_DESCRIPTIONS[item.key]}</p>
                      {item.explanationText && (
                        <p className="mt-1 text-[0.8125rem] leading-relaxed text-[#4A4038]">{item.explanationText}</p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      {item.scoreValue !== null && (
                        <p className="text-lg font-bold tabular-nums text-[#2B241E]">{item.scoreValue}</p>
                      )}
                      <p className="text-[0.75rem] font-semibold" style={{ color: LABEL_TONE[item.scoreLabel] }}>
                        {item.scoreLabel === "UNKNOWN" ? "Abhi pata nahi" : item.scoreLabel}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <footer className="mt-9 border-t border-gold-600/30 pt-3 text-center">
              <p className="text-[0.6875rem] tracking-wide text-[#9A8F84]">BandhanTak.com — Deep Compatibility Report</p>
            </footer>
          </div>
        </article>
      </div>
    </div>
  );
}
