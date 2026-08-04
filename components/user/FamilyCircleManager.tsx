"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, MessageCircle, RefreshCw, Trash2, UserPlus } from "lucide-react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { Select } from "@/components/ui/Controls";
import { useToast } from "@/components/ui/Toast";
import { FAMILY_RELATION_LABELS } from "@/lib/services/family/familyConstants";
import type { FamilyRelation, FamilyMemberStatus } from "@prisma/client";

export interface FamilyMemberView {
  id: string;
  displayName: string;
  relation: FamilyRelation;
  status: FamilyMemberStatus;
  inviteToken: string;
  inviteExpiresAt: string;
  boundAt: string | null;
}

const STATUS_BADGE: Record<FamilyMemberStatus, { label: string; variant: "pending" | "complete" | "incomplete" }> = {
  INVITED: { label: "Invite bheji gayi", variant: "pending" },
  ACTIVE: { label: "Active", variant: "complete" },
  REVOKED: { label: "Band hai", variant: "incomplete" },
};

function inviteUrl(token: string) {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/f/${token}`;
}

function waHref(displayName: string, url: string) {
  const text = `Namaste ${displayName}, main aapko apne BandhanTak Family Circle me jodna chahta/chahti hoon — is link se ek tap me jud jaayein: ${url}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export default function FamilyCircleManager({
  initialMembers,
  seatLimit,
  planName,
}: {
  initialMembers: FamilyMemberView[];
  seatLimit: number;
  planName: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [members, setMembers] = useState(initialMembers);
  const [displayName, setDisplayName] = useState("");
  const [relation, setRelation] = useState<FamilyRelation>("PARENT");
  const [inviting, setInviting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const activeCount = members.filter((m) => m.status !== "REVOKED").length;
  const atLimit = activeCount >= seatLimit;

  async function invite() {
    if (!displayName.trim()) return;
    setInviting(true);
    try {
      const res = await fetch("/api/family", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: displayName.trim(), relation }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Invite nahi bheji ja saki", description: json.message, tone: "error" });
        return;
      }
      setMembers((prev) => [json.member, ...prev.filter((m) => m.id !== json.member.id)]);
      setDisplayName("");
      toast({ title: `${json.member.displayName} ke liye link ban gayi`, tone: "success" });
    } catch {
      toast({ title: "Network error — dobara try karein", tone: "error" });
    } finally {
      setInviting(false);
    }
  }

  async function reinvite(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/family/${id}/reinvite`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Nayi link nahi ban payi", description: json.message, tone: "error" });
        return;
      }
      setMembers((prev) => prev.map((m) => (m.id === id ? json.member : m)));
      toast({ title: "Nayi invite link ban gayi", tone: "success" });
    } catch {
      toast({ title: "Network error — dobara try karein", tone: "error" });
    } finally {
      setBusyId(null);
    }
  }

  async function revoke(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/family/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Band nahi ho paaya", description: json.message, tone: "error" });
        return;
      }
      setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, status: "REVOKED" } : m)));
      toast({ title: "Access band kar diya", tone: "success" });
      router.refresh();
    } catch {
      toast({ title: "Network error — dobara try karein", tone: "error" });
    } finally {
      setBusyId(null);
    }
  }

  function copy(m: FamilyMemberView) {
    navigator.clipboard.writeText(inviteUrl(m.inviteToken)).then(() => {
      setCopiedId(m.id);
      setTimeout(() => setCopiedId((id) => (id === m.id ? null : id)), 1800);
    });
  }

  return (
    <div className="space-y-4">
      <Card padding="md" className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink">
          <span className="font-semibold">{activeCount}</span> / {seatLimit} seats istemaal ho rahe hain
        </p>
        <Badge variant="free" size="sm">
          {planName} plan
        </Badge>
      </Card>

      {members.length > 0 && (
        <div className="space-y-3">
          {members.map((m) => {
            const status = STATUS_BADGE[m.status];
            const url = inviteUrl(m.inviteToken);
            return (
              <Card key={m.id} padding="md">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-ink">{m.displayName}</p>
                    <p className="text-[0.75rem] text-muted">{FAMILY_RELATION_LABELS[m.relation]}</p>
                  </div>
                  <Badge variant={status.variant} size="sm">
                    {status.label}
                  </Badge>
                </div>

                {m.status !== "REVOKED" && (
                  <>
                    <div className="mt-3 flex items-center gap-2 rounded-md border border-line p-2.5">
                      <p className="min-w-0 flex-1 truncate text-[0.75rem] text-muted">{url}</p>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <a href={waHref(m.displayName, url)} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" variant="accent" icon={<MessageCircle className="size-3.5" />}>
                          WhatsApp Bhejein
                        </Button>
                      </a>
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={copiedId === m.id ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                        onClick={() => copy(m)}
                      >
                        {copiedId === m.id ? "Copy ho gaya" : "Copy"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<RefreshCw className="size-3.5" />}
                        loading={busyId === m.id}
                        onClick={() => reinvite(m.id)}
                      >
                        Nayi Link
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Trash2 className="size-3.5" />}
                        loading={busyId === m.id}
                        onClick={() => revoke(m.id)}
                      >
                        Band Karein
                      </Button>
                    </div>
                    <p className="mt-2 text-[0.6875rem] text-subtle">
                      {m.status === "ACTIVE" && m.boundAt
                        ? `Jud gaye — ${new Date(m.boundAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`
                        : `Invite ${new Date(m.inviteExpiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} tak khuli hai`}
                    </p>
                  </>
                )}

                {m.status === "REVOKED" && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="mt-3"
                    icon={<RefreshCw className="size-3.5" />}
                    loading={busyId === m.id}
                    onClick={() => reinvite(m.id)}
                  >
                    Dobara Invite Karein
                  </Button>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Card padding="md" className="space-y-3">
        <div className="flex items-center gap-2">
          <UserPlus className="size-4 shrink-0 text-primary-text" />
          <h3 className="text-sm font-semibold text-ink">Naya Member Jodein</h3>
        </div>

        {atLimit ? (
          <p className="text-[0.8125rem] text-muted">
            Aapke {planName} plan me sirf {seatLimit} family seat{seatLimit > 1 ? "s" : ""} hain — sab istemaal ho
            chuke hain. Ek ko band karke naya jod sakte hain.
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Naam (jaise Papa)"
                maxLength={40}
                className="flex-1"
              />
              <Select
                value={relation}
                onChange={(e) => setRelation(e.target.value as FamilyRelation)}
                options={(Object.keys(FAMILY_RELATION_LABELS) as FamilyRelation[]).map((r) => ({
                  value: r,
                  label: FAMILY_RELATION_LABELS[r],
                }))}
                className="sm:w-56"
              />
            </div>
            <Button
              variant="primary"
              fullWidth
              loading={inviting}
              disabled={!displayName.trim()}
              icon={<UserPlus className="size-4" />}
              onClick={invite}
            >
              Invite Link Banayein
            </Button>
            <p className="text-[0.75rem] leading-snug text-muted">
              Unhe koi code ya password nahi chahiye — link kholke ek button dabate hi jud jaayenge. Chat unhe
              kabhi nahi dikhegi.
            </p>
          </>
        )}
      </Card>
    </div>
  );
}
