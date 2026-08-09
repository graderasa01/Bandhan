"use client";

import { Download } from "lucide-react";
import Button from "@/components/ui/Button";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * The browser's own print dialog is the PDF generator — "Save as PDF" is a
 * destination in it on desktop Chrome, Edge, Safari and Android Chrome alike.
 * That keeps a real, shareable file one tap away without shipping a PDF
 * rendering library or rendering the document a second time on a server.
 */
export default function BiodataPrintButton() {
  const t = useT();
  return (
    <Button variant="primary" size="md" icon={<Download className="size-4" />} onClick={() => window.print()}>
      {t("profile.biodataPrintButton.label", "PDF banayein")}
    </Button>
  );
}
