"use client";

import { useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";

export default function ReferralLinkCard({
  partnerCode,
  referralLink,
}: {
  partnerCode: string;
  referralLink: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the link is on screen to copy by hand */
    }
  }

  async function share() {
    const text = `BandhanTak par apna rishta dhoondhiye. Mera referral link: ${referralLink}`;
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch {
        /* user dismissed the sheet */
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  }

  return (
    <Card variant="elevated" padding="lg">
      <p className="text-sm text-muted">Aapka partner code</p>
      <p className="mt-1 font-mono text-3xl font-bold tracking-wider text-wine-700">{partnerCode}</p>

      <p className="mt-5 text-sm text-muted">Referral link</p>
      <div className="mt-1.5 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md border border-line bg-bg-subtle px-3 py-2.5 text-[0.8125rem] text-ink">
          {referralLink}
        </code>
        <Button
          size="icon-sm"
          variant="secondary"
          onClick={copy}
          ariaLabel={copied ? "Copy ho gaya" : "Link copy karein"}
        >
          {copied ? <Check className="size-4 text-trust" /> : <Copy className="size-4" />}
        </Button>
      </div>

      <div className="mt-4">
        <Button variant="primary" size="md" fullWidth icon={<Share2 className="size-4" />} onClick={share}>
          Share on WhatsApp
        </Button>
      </div>
    </Card>
  );
}
