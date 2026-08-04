"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Eye, Link2, Loader2, MessageCircle, Trash2 } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";

interface ShareLinkView {
  id: string;
  url: string;
  isActive: boolean;
  viewCount: number;
  lastViewedAt: string | null;
  includeMobile: boolean;
  includeIncome: boolean;
}

function waHref(url: string) {
  const text = `Mera BandhanTak biodata dekhein: ${url}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/**
 * The bridge from "print → save PDF → attach on WhatsApp" (three steps, a
 * drop-off at every one) to a single link a family member can open with no
 * BandhanTak account of their own. Self-fetching, like `PhotoUploadCard` —
 * this sits inside a server-rendered page and owns its own client state.
 */
export default function ShareBiodataCard() {
  const { toast } = useToast();
  const [links, setLinks] = useState<ShareLinkView[] | null>(null);
  const [includeMobile, setIncludeMobile] = useState(false);
  const [includeIncome, setIncludeIncome] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/share?kind=OWN_BIODATA")
      .then((r) => (r.ok ? r.json() : { links: [] }))
      .then((data: { links?: ShareLinkView[] }) => {
        if (active) setLinks((data.links ?? []).filter((l) => l.isActive));
      })
      .catch(() => {
        if (active) setLinks([]);
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
        body: JSON.stringify({ kind: "OWN_BIODATA", includeMobile, includeIncome }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Link nahi ban paaya", description: json.message, tone: "error" });
        return;
      }
      setLinks((prev) => [json.link, ...(prev ?? []).filter((l) => l.id !== json.link.id)]);
    } catch {
      toast({ title: "Network error — dobara try karein", tone: "error" });
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/share/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Revoke nahi ho paaya", description: json.message, tone: "error" });
        return;
      }
      setLinks((prev) => prev?.filter((l) => l.id !== id) ?? prev);
      toast({ title: "Link band kar diya", tone: "success" });
    } catch {
      toast({ title: "Network error — dobara try karein", tone: "error" });
    } finally {
      setBusyId(null);
    }
  }

  function copy(link: ShareLinkView) {
    navigator.clipboard.writeText(link.url).then(() => {
      setCopiedId(link.id);
      setTimeout(() => setCopiedId((id) => (id === link.id ? null : id)), 1800);
    });
  }

  return (
    <Card padding="lg" className="space-y-4">
      <div className="flex items-center gap-2">
        <MessageCircle className="size-4 shrink-0 text-primary-text" />
        <h3 className="text-sm font-semibold text-ink">WhatsApp Par Share Karein</h3>
      </div>
      <p className="text-[0.8125rem] leading-relaxed text-muted">
        Ek link banayein jo koi bhi khol sake — family ko BandhanTak account banwane ki zaroorat nahi.
      </p>

      {links === null ? (
        <div className="flex h-12 items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted" />
        </div>
      ) : (
        <>
          {links.length > 0 && (
            <div className="space-y-2.5">
              {links.map((link) => (
                <div key={link.id} className="rounded-md border border-line p-3">
                  <div className="flex items-center gap-2">
                    <Link2 className="size-3.5 shrink-0 text-muted" />
                    <p className="min-w-0 flex-1 truncate text-[0.8125rem] text-muted">{link.url}</p>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="flex items-center gap-1.5 text-[0.75rem] text-subtle">
                      <Eye className="size-3.5" />
                      {link.viewCount === 0
                        ? "Abhi tak kisi ne nahi dekha"
                        : `${link.viewCount} baar dekha gaya${link.lastViewedAt ? ` · aakhri baar ${new Date(link.lastViewedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""}`}
                    </p>
                    <div className="flex gap-1.5">
                      <a href={waHref(link.url)} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" variant="accent" icon={<MessageCircle className="size-3.5" />}>
                          Bhejein
                        </Button>
                      </a>
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={copiedId === link.id ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                        onClick={() => copy(link)}
                      >
                        {copiedId === link.id ? "Copy ho gaya" : "Copy"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Trash2 className="size-3.5" />}
                        loading={busyId === link.id}
                        onClick={() => revoke(link.id)}
                      >
                        Band karein
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="border-t border-line pt-4">
            <p className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-wider text-subtle">Ye bhi shaamil karein</p>
            <div className="flex flex-wrap gap-2">
              <ToggleChip on={includeMobile} onClick={() => setIncludeMobile((v) => !v)}>
                Mobile number
              </ToggleChip>
              <ToggleChip on={includeIncome} onClick={() => setIncludeIncome((v) => !v)}>
                Aay (income)
              </ToggleChip>
            </div>
            <p className="mt-2 text-[0.75rem] leading-snug text-muted">
              Dono by default band hain. Ek baar link banne ke baad, ye toggle sirf agle naye link par lagenge.
            </p>

            <Button
              variant="primary"
              fullWidth
              className="mt-3"
              loading={creating}
              icon={<Link2 className="size-4" />}
              onClick={createLink}
            >
              Naya Link Banayein
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}

function ToggleChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 text-[0.8125rem] font-medium transition-colors",
        on
          ? "border-gold-500 bg-gold-100 text-gold-800 dark:bg-gold-900/40 dark:text-gold-200"
          : "border-line bg-surface text-muted hover:border-gold-400 hover:text-ink",
      )}
    >
      {on && <Check className="size-3.5" />}
      {children}
    </button>
  );
}
