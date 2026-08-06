"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Eye, Link2, Loader2, MessageCircle } from "lucide-react";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

interface ShareLinkView {
  id: string;
  url: string;
  isActive: boolean;
  viewCount: number;
}

function waHref(url: string) {
  const text = `Dekho meri Soch Board — iski soch kaisi hai: ${url}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** Same pattern as `ShareBiodataCard.tsx`, one kind, no extra options — a Soch Board link is always the whole board, on the owner's own terms. */
export default function ShareSochBoardCard() {
  const { toast } = useToast();
  const [link, setLink] = useState<ShareLinkView | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/share?kind=SOCH_BOARD")
      .then((r) => (r.ok ? r.json() : { links: [] }))
      .then((data: { links?: ShareLinkView[] }) => {
        if (active) setLink((data.links ?? []).find((l) => l.isActive) ?? null);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function createLink() {
    setCreating(true);
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "SOCH_BOARD" }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Link nahi ban paaya", description: json.message, tone: "error" });
        return;
      }
      setLink(json.link);
    } catch {
      toast({ title: "Network error — dobara try karein", tone: "error" });
    } finally {
      setCreating(false);
    }
  }

  function copy() {
    if (!link) return;
    navigator.clipboard.writeText(link.url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  if (loading) {
    return (
      <div className="flex h-12 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted" />
      </div>
    );
  }

  if (!link) {
    return (
      <Button variant="secondary" fullWidth icon={<Link2 className="size-4" />} loading={creating} onClick={createLink}>
        Share Link Banayein
      </Button>
    );
  }

  return (
    <div className="rounded-md border border-line p-3">
      <div className="flex items-center gap-2">
        <Link2 className="size-3.5 shrink-0 text-muted" />
        <p className="min-w-0 flex-1 truncate text-[0.8125rem] text-muted">{link.url}</p>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[0.75rem] text-subtle">
          <Eye className="size-3.5" />
          {link.viewCount === 0 ? "Abhi tak kisi ne nahi dekha" : `${link.viewCount} baar dekha gaya`}
        </p>
        <div className="flex gap-1.5">
          <a href={waHref(link.url)} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="accent" icon={<MessageCircle className="size-3.5" />}>
              Send
            </Button>
          </a>
          <Button
            size="sm"
            variant="secondary"
            icon={copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            onClick={copy}
          >
            {copied ? "Copy ho gaya" : "Copy"}
          </Button>
        </div>
      </div>
    </div>
  );
}
