"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Download, FileText, Lock, Share2 } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * "Le jaaiye" — the kundli as a file, and the share sheet that sends it on.
 *
 * The gate is decided on the server (`/api/kundli/pdf` re-checks
 * `kundliPdfExport` on every request); `entitled` only picks which UI to draw,
 * exactly as `ManualKundliCard` does. Hand-crafting the GET is always possible,
 * so the route is the real lock and this card is just honest about it up front
 * instead of offering a button that would 403.
 *
 * Sharing degrades in three steps rather than assuming a phone:
 *   1. `navigator.share` with the actual PDF attached, when the browser says it
 *      can take files — the case that matters, because the whole point is
 *      sending the kundli to a pandit or a rishta's family on WhatsApp.
 *   2. `navigator.share` with the download link, on desktop Safari/Android
 *      browsers that have a share sheet but refuse files.
 *   3. Clipboard. A link that only works for the signed-in owner is still the
 *      right thing to copy — the route is self-only, so a shared URL hands over
 *      nothing.
 */
export default function KundliExportCard({ entitled }: { entitled: boolean }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function onShare() {
    setNote(null);
    setBusy(true);
    try {
      const url = `${window.location.origin}/api/kundli/pdf`;

      // Try the file first — a link is a poor substitute when the recipient is
      // not signed in as this user, which is every recipient.
      if (typeof navigator.canShare === "function") {
        try {
          const res = await fetch("/api/kundli/pdf");
          if (res.ok) {
            const blob = await res.blob();
            const file = new File([blob], "kundli.pdf", { type: "application/pdf" });
            if (navigator.canShare({ files: [file] })) {
              await navigator.share({ files: [file], title: t("kundli.exportCard.shareTitle", "Janm Kundli") });
              return;
            }
          }
        } catch {
          // Fall through to the link paths below.
        }
      }

      if (typeof navigator.share === "function") {
        await navigator.share({ title: t("kundli.exportCard.shareTitle", "Janm Kundli"), url });
        return;
      }

      await navigator.clipboard.writeText(url);
      setNote(t("kundli.exportCard.linkCopied", "Download link copy ho gaya."));
    } catch (err) {
      // A user dismissing the share sheet throws AbortError — not an error.
      if (err instanceof DOMException && err.name === "AbortError") return;
      setNote(t("kundli.exportCard.shareFailed", "Share nahi ho paaya — Download PDF try karein."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card variant="default" padding="md">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gold-100 text-gold-700 dark:bg-gold-900/40 dark:text-gold-200">
          <FileText className="size-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-[0.9375rem] font-semibold text-ink">{t("kundli.exportCard.title", "Kundli le jaaiye")}</h2>
          <p className="mt-0.5 text-[0.8125rem] leading-snug text-muted">
            {t(
              "kundli.exportCard.subtitle",
              "Wahi kundli jo upar dikh rahi hai, ek PDF me — pandit ji ko dikhane ya ghar walon ko bhejne ke liye.",
            )}
          </p>
        </div>
      </div>

      {entitled ? (
        <>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <a
              href="/api/kundli/pdf"
              className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-gold-400 to-gold-600 px-5 text-sm font-semibold text-primary-fg shadow-gold"
            >
              <Download className="size-4" />
              {t("kundli.exportCard.downloadPdf", "Download PDF")}
            </a>
            <Button type="button" variant="secondary" onClick={onShare} loading={busy} className="flex-1">
              <Share2 className="size-4" />
              {t("kundli.exportCard.shareKundli", "Share Kundli")}
            </Button>
          </div>
          {note && (
            <p role="status" className="mt-2 text-[0.75rem] text-subtle">
              {note}
            </p>
          )}
        </>
      ) : (
        <div className="mt-4 flex items-start gap-3 rounded-md border border-line bg-bg-subtle px-3 py-3">
          <Lock className="mt-0.5 size-4 shrink-0 text-muted" />
          <div className="min-w-0">
            <p className="text-[0.8125rem] font-medium text-ink">
              {t("kundli.exportCard.gatedTitle", "PDF download aur share paid plans ke saath khulta hai")}
            </p>
            <p className="mt-1 text-[0.8125rem] leading-snug text-muted">
              {t(
                "kundli.exportCard.gatedDesc",
                "Aapki kundli is screen par hamesha free hai — plan sirf use file bana kar kisi aur ko bhejne ke liye chahiye.",
              )}
            </p>
            <Link
              href="/user/subscription"
              className="mt-3 inline-flex min-h-12 items-center gap-2 rounded-full bg-gradient-to-r from-gold-400 to-gold-600 px-5 text-sm font-semibold text-primary-fg shadow-gold"
            >
              {t("kundli.exportCard.viewPlans", "View Plans")}
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      )}
    </Card>
  );
}
