"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Eye, Loader2, MessageCircle, Trash2, Users } from "lucide-react";
import Sheet from "@/components/ui/Sheet";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

interface ShareLinkView {
  id: string;
  url: string;
  isActive: boolean;
  viewCount: number;
  lastViewedAt: string | null;
}

function waHref(name: string, url: string) {
  const text = `${name} ka profile dekhein — BandhanTak par match hua hai: ${url}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/**
 * "Family ko bhejein" — the thing people already do by screenshotting a
 * profile and forwarding it, done properly instead: a real link, watermarked
 * to whoever generated it, that stops working the moment it's revoked or
 * after 30 days. Only reachable at L3 (`ProfileActionBar` gates the button),
 * and the API re-checks that gate itself rather than trusting the click.
 */
export default function ShareRishtaCardSheet({
  open,
  onClose,
  profileId,
  displayName,
}: {
  open: boolean;
  onClose: () => void;
  profileId: string;
  displayName: string;
}) {
  const { toast } = useToast();
  const [link, setLink] = useState<ShareLinkView | null | undefined>(undefined); // undefined = loading
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLink(undefined);
    fetch(`/api/share?kind=RISHTA_CARD&profileId=${profileId}`)
      .then((r) => (r.ok ? r.json() : { links: [] }))
      .then((data: { links?: ShareLinkView[] }) => {
        setLink(data.links?.find((l) => l.isActive) ?? null);
      })
      .catch(() => setLink(null));
  }, [open, profileId]);

  async function createLink() {
    setCreating(true);
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "RISHTA_CARD", profileId }),
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

  async function revoke() {
    if (!link) return;
    setCreating(true);
    try {
      const res = await fetch(`/api/share/${link.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Revoke nahi ho paaya", description: json.message, tone: "error" });
        return;
      }
      setLink(null);
      toast({ title: "Link band kar diya", tone: "success" });
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

  return (
    <Sheet open={open} onClose={onClose} variant="bottom" title={`${displayName} ki profile family ko bhejein`}>
      <div className="space-y-4">
        <p className="text-[0.8125rem] leading-relaxed text-muted">
          Ek link banega jise koi bhi khol sake, BandhanTak account ke bina bhi. Mobile number aur income kabhi
          shaamil nahi hote. Link 30 din me apne aap band ho jaata hai, ya aap kabhi bhi revoke kar sakte hain.
        </p>

        {link === undefined ? (
          <div className="flex h-16 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted" />
          </div>
        ) : link === null ? (
          <Button variant="primary" fullWidth loading={creating} icon={<Users className="size-4" />} onClick={createLink}>
            Link Banayein
          </Button>
        ) : (
          <div className="space-y-3">
            <div className="rounded-md border border-line p-3">
              <p className="truncate text-[0.8125rem] text-muted">{link.url}</p>
              <p className="mt-1.5 flex items-center gap-1.5 text-[0.75rem] text-subtle">
                <Eye className="size-3.5" />
                {link.viewCount === 0 ? "Abhi tak kisi ne nahi dekha" : `${link.viewCount} baar dekha gaya`}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <a href={waHref(displayName, link.url)} target="_blank" rel="noopener noreferrer" className="flex-1">
                <Button variant="accent" fullWidth icon={<MessageCircle className="size-4" />}>
                  WhatsApp Par Bhejein
                </Button>
              </a>
              <Button variant="secondary" icon={copied ? <Check className="size-4" /> : <Copy className="size-4" />} onClick={copy}>
                {copied ? "Ho gaya" : "Copy"}
              </Button>
              <Button variant="ghost" icon={<Trash2 className="size-4" />} loading={creating} onClick={revoke}>
                Band karein
              </Button>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}
