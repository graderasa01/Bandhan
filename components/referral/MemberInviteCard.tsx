"use client";

import { useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * The share surface. A near-twin of the partner's `ReferralLinkCard`, kept
 * separate rather than generalised: the two carry different copy, point at
 * different paths (`/i/` vs `/r/`) and will diverge again the moment either
 * side gets its own campaign wording. One shared component with four props
 * describing which mechanism it is would be harder to read than two.
 *
 * `shareText` is composed on the server so the sentence around the link is the
 * admin-editable one, not a string frozen in the bundle.
 */
export default function MemberInviteCard({
  code,
  link,
  shareText,
}: {
  code: string;
  link: string;
  shareText: string;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the link is on screen to copy by hand */
    }
  }

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ text: shareText });
        return;
      } catch {
        /* user dismissed the sheet */
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, "_blank", "noopener");
  }

  return (
    <Card variant="elevated" padding="lg">
      <p className="text-sm text-muted">{t("refer.card.codeLabel", "Aapka invite code")}</p>
      <p className="mt-1 font-mono text-3xl font-bold tracking-wider text-accent-text">{code}</p>

      <p className="mt-5 text-sm text-muted">{t("refer.card.linkLabel", "Aapka invite link")}</p>
      <div className="mt-1.5 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md border border-line bg-bg-subtle px-3 py-2.5 text-[0.8125rem] text-ink">
          {link}
        </code>
        <Button
          size="icon-sm"
          variant="secondary"
          onClick={copy}
          ariaLabel={
            copied ? t("refer.card.copyDone", "Copy ho gaya") : t("refer.card.copyAriaLabel", "Link copy karein")
          }
        >
          {copied ? <Check className="size-4 text-trust" /> : <Copy className="size-4" />}
        </Button>
      </div>

      <div className="mt-4">
        <Button variant="primary" size="md" fullWidth icon={<Share2 className="size-4" />} onClick={share}>
          {t("refer.card.shareButton", "WhatsApp par bhejein")}
        </Button>
      </div>
    </Card>
  );
}
