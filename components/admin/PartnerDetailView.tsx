"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, Mail, MessageCircle, Percent, Phone, Send } from "lucide-react";
import Card from "@/components/ui/Card";
import Pill from "@/components/ui/Pill";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import AdminActionConfirmModal from "@/components/admin/AdminActionConfirmModal";
import { paiseToRupeeDisplay } from "@/lib/utils/money";
import { TIER_LABEL, bpsToPercentDisplay } from "@/lib/partner/tier";
import { MAX_COMMISSION_BPS, MIN_COMMISSION_BPS } from "@/lib/services/plans/constants";
import type { PartnerTier } from "@prisma/client";

export type PartnerDetailProps = {
  id: string;
  /** The partner's User row — a note is addressed to the account, not the partner record. */
  userId: string;
  fullName: string;
  maskedMobile: string;
  maskedEmail: string | null;
  city: string;
  state: string;
  partnerType: string;
  organizationName: string | null;
  experienceYears: number | null;
  expectedMonthlyReferrals: number | null;
  knownCommunityOrArea: string | null;
  notesFromPartner: string | null;
  status: string;
  rejectionReason: string | null;
  suspensionReason: string | null;
  autoOutreachEnabled: boolean;
  appliedAt: string;
  timeline: { label: string; at: string; by: string | null }[];

  activeCode: string | null;
  clickCount: number;
  leadCount: number;
  subscribedCount: number;
  leads: { userId: string; maskedName: string; joinedAt: string; codeUsed: string; status: string }[];

  paidConversions: number;
  tier: PartnerTier;
  tierRemaining: number;
  nextTier: string | null;
  effectiveBps: number;
  tierBps: number;
  commissionBpsOverride: number | null;

  earnings: { pendingPaise: number; approvedPaise: number; paidPaise: number; reversedPaise: number };
  recentCommissions: {
    id: string;
    amountPaise: number;
    basePaise: number;
    percentBpsApplied: number;
    status: string;
    createdAt: string;
  }[];
  outreach: { channel: string; templateKey: string; status: string; createdAt: string }[];
  invites: { fullName: string; status: string; createdAt: string }[];

  /** SUPPORT reads this page but changes nothing — the APIs enforce it too. */
  canManage: boolean;
};

const LEAD_STATUS_LABEL: Record<string, string> = {
  REGISTERED: "Register hua",
  PROFILE_LIVE: "Profile live",
  SUBSCRIBED: "Plan liya",
};

const STATUS_TONE: Record<string, "gold" | "trust" | "danger" | "neutral"> = {
  PENDING_APPROVAL: "gold",
  APPROVED: "trust",
  ACTIVE: "trust",
  REJECTED: "danger",
  SUSPENDED: "danger",
  INACTIVE: "neutral",
};

export default function PartnerDetailView(p: PartnerDetailProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [contact, setContact] = useState<{ mobileNumber: string; email: string | null } | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [percent, setPercent] = useState(
    p.commissionBpsOverride === null ? "" : String(p.commissionBpsOverride / 100),
  );
  const [reason, setReason] = useState("");
  const [pendingRate, setPendingRate] = useState<{ percent: number | null } | null>(null);
  const [busy, setBusy] = useState(false);

  async function reveal() {
    setRevealing(true);
    try {
      const res = await fetch(`/api/admin/partners/${p.id}/contact`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Contact nahi mila", description: json.message, tone: "error" });
        return;
      }
      setContact({ mobileNumber: json.mobileNumber, email: json.email });
    } finally {
      setRevealing(false);
    }
  }

  async function confirmRate() {
    if (!pendingRate) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/partners/${p.id}/commission`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ percent: pendingRate.percent, reason: reason.trim() }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Rate save nahi hua", description: json.message, tone: "error" });
        return;
      }
      toast({
        title:
          pendingRate.percent === null
            ? "Override hata diya — ab tier ka rate lagega"
            : `Rate ${pendingRate.percent}% set ho gaya`,
        tone: "success",
      });
      setPendingRate(null);
      setReason("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const parsedPercent = percent.trim() === "" ? null : Number(percent);
  const rateValid =
    parsedPercent === null ||
    (Number.isFinite(parsedPercent) &&
      parsedPercent >= MIN_COMMISSION_BPS / 100 &&
      parsedPercent <= MAX_COMMISSION_BPS / 100);
  const rateDirty = (parsedPercent === null ? null : Math.round(parsedPercent * 100)) !== p.commissionBpsOverride;

  return (
    <div className="flex flex-col gap-4">
      {/* Identity + contact */}
      <Card variant="default" padding="lg">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold text-ink">{p.fullName}</h2>
              <Pill tone={STATUS_TONE[p.status] ?? "neutral"} size="sm">
                {p.status}
              </Pill>
              {p.activeCode && (
                <Pill tone="gold" size="sm">
                  {p.activeCode}
                </Pill>
              )}
            </div>
            <p className="mt-1 text-sm text-muted">
              {p.partnerType} · {p.city}, {p.state}
              {p.organizationName ? ` · ${p.organizationName}` : ""}
            </p>
            <p className="mt-0.5 text-[0.8125rem] text-subtle">
              Applied {p.appliedAt}
              {p.experienceYears != null ? ` · ${p.experienceYears} saal experience` : ""}
              {p.expectedMonthlyReferrals != null ? ` · ~${p.expectedMonthlyReferrals}/month expected` : ""}
            </p>
          </div>
        </div>

        <div className="mt-4 border-t border-line pt-4">
          {contact ? (
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <a href={`tel:${contact.mobileNumber}`} className="inline-flex items-center gap-1.5 font-medium text-ink">
                <Phone className="size-4 text-trust" aria-hidden />
                {contact.mobileNumber}
              </a>
              <a
                href={`https://wa.me/91${contact.mobileNumber.replace(/\D/g, "").slice(-10)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 font-medium text-trust"
              >
                <MessageCircle className="size-4" aria-hidden />
                WhatsApp
              </a>
              {contact.email && (
                <a href={`mailto:${contact.email}`} className="inline-flex items-center gap-1.5 font-medium text-ink">
                  <Mail className="size-4 text-trust" aria-hidden />
                  {contact.email}
                </a>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-muted">
                {p.maskedMobile}
                {p.maskedEmail ? ` · ${p.maskedEmail}` : ""}
              </p>
              {p.canManage && (
                <Button size="sm" variant="secondary" loading={revealing} onClick={reveal}>
                  <Eye className="size-4" aria-hidden />
                  Reveal Contact
                </Button>
              )}
              {p.canManage && (
                <Link
                  href={`/admin/messages?userId=${p.userId}&name=${encodeURIComponent(p.fullName)}&audience=PARTNER`}
                >
                  <Button size="sm" variant="ghost">
                    <Send className="size-4" aria-hidden />
                    Send Note
                  </Button>
                </Link>
              )}
            </div>
          )}
          <p className="mt-2 text-xs text-subtle">
            Contact reveal karne par audit log me record ho jaata hai — kaun ne kab dekha.
          </p>
        </div>

        {p.notesFromPartner && (
          <div className="mt-4 rounded-md bg-bg-subtle px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Partner ka note</p>
            <p className="mt-1 text-sm text-ink">{p.notesFromPartner}</p>
          </div>
        )}
        {p.knownCommunityOrArea && (
          <p className="mt-2 text-[0.8125rem] text-muted">Community/area: {p.knownCommunityOrArea}</p>
        )}
        {p.rejectionReason && <p className="mt-2 text-[0.8125rem] text-danger">Reject reason: {p.rejectionReason}</p>}
        {p.suspensionReason && (
          <p className="mt-2 text-[0.8125rem] text-danger">Suspend reason: {p.suspensionReason}</p>
        )}
      </Card>

      {/* Funnel */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Link clicks" value={String(p.clickCount)} />
        <Stat label="Register hue" value={String(p.leadCount)} />
        <Stat label="Plan liya" value={String(p.subscribedCount)} />
        <Stat label="Paying members" value={String(p.paidConversions)} />
      </div>

      {/* Money */}
      <Card variant="default" padding="lg">
        <h3 className="text-base font-semibold text-wine-700">Commission</h3>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Pending" value={paiseToRupeeDisplay(p.earnings.pendingPaise)} />
          <Stat label="Approved" value={paiseToRupeeDisplay(p.earnings.approvedPaise)} />
          <Stat label="Paid" value={paiseToRupeeDisplay(p.earnings.paidPaise)} />
          <Stat label="Reversed" value={paiseToRupeeDisplay(p.earnings.reversedPaise)} />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4 text-sm">
          <Pill tone="gold" size="sm">
            {TIER_LABEL[p.tier]}
          </Pill>
          <span className="text-muted">
            Tier ka rate {bpsToPercentDisplay(p.tierBps)}
            {p.nextTier ? ` · ${p.nextTier} tak ${p.tierRemaining} aur paying member` : " · sabse upar"}
          </span>
          {p.commissionBpsOverride !== null && (
            <Pill tone="trust" size="sm">
              Override {bpsToPercentDisplay(p.commissionBpsOverride)}
            </Pill>
          )}
        </div>
        <p className="mt-2 text-[0.8125rem] text-muted">
          Agle payment par lagega: <strong className="text-ink">{bpsToPercentDisplay(p.effectiveBps)}</strong>
        </p>

        {p.canManage && (
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-[140px_1fr_auto]">
            <Input
              inputSize="sm"
              type="number"
              step="0.5"
              min={MIN_COMMISSION_BPS / 100}
              max={MAX_COMMISSION_BPS / 100}
              placeholder="Tier rate"
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
              aria-label="Commission percent"
            />
            <Input
              inputSize="sm"
              placeholder="Reason — kyun alag rate diya ja raha hai"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              aria-label="Reason"
            />
            <Button
              size="sm"
              variant="secondary"
              disabled={!rateValid || !rateDirty || !reason.trim() || busy}
              onClick={() => setPendingRate({ percent: parsedPercent })}
            >
              <Percent className="size-4" aria-hidden />
              Set Rate
            </Button>
          </div>
        )}
        {p.canManage && (
          <p className="mt-1.5 text-xs text-subtle">
            Khaali chhod kar save karein to override hat jaayega aur tier ka rate wapas lag jaayega. Purani commission
            rows nahi badalti — wo jo kamaya gaya tha wahi rehta hai.
          </p>
        )}

        {p.recentCommissions.length > 0 && (
          <div className="mt-4 overflow-x-auto border-t border-line pt-3">
            <table className="w-full min-w-[420px] text-left text-[0.8125rem]">
              <thead className="text-subtle">
                <tr>
                  <th className="py-1 font-medium">Date</th>
                  <th className="py-1 font-medium">Base</th>
                  <th className="py-1 font-medium">Rate</th>
                  <th className="py-1 font-medium">Amount</th>
                  <th className="py-1 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="text-ink">
                {p.recentCommissions.map((c) => (
                  <tr key={c.id} className="border-t border-line/60">
                    <td className="py-1.5">{c.createdAt}</td>
                    <td className="py-1.5">{paiseToRupeeDisplay(c.basePaise)}</td>
                    <td className="py-1.5">{bpsToPercentDisplay(c.percentBpsApplied)}</td>
                    <td className="py-1.5 font-medium">{paiseToRupeeDisplay(c.amountPaise)}</td>
                    <td className="py-1.5 text-muted">{c.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Leads */}
      <Card variant="default" padding="lg">
        <h3 className="text-base font-semibold text-wine-700">Leads ({p.leadCount})</h3>
        {p.leads.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Abhi koi lead nahi aayi.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-1.5">
            {p.leads.map((l) => (
              <li key={l.userId} className="flex flex-wrap items-center justify-between gap-2 border-t border-line/60 py-1.5 text-[0.8125rem] first:border-0">
                <span className="text-ink">{l.maskedName}</span>
                <span className="text-muted">
                  {LEAD_STATUS_LABEL[l.status] ?? l.status} · {l.joinedAt} · {l.codeUsed}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-subtle">
          Member ke naam sirf pehla naam + surname ka pehla akshar — partner ki performance dekhne ke liye itna kaafi hai.
        </p>
      </Card>

      {/* History */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card variant="soft" padding="md">
          <h3 className="text-sm font-semibold text-ink">Status timeline</h3>
          <ul className="mt-2 flex flex-col gap-1 text-[0.8125rem] text-muted">
            {p.timeline.map((t, i) => (
              <li key={i}>
                {t.label} — {t.at}
              </li>
            ))}
          </ul>
        </Card>

        <Card variant="soft" padding="md">
          <h3 className="text-sm font-semibold text-ink">
            Outreach {p.autoOutreachEnabled ? "(auto on)" : "(auto off)"}
          </h3>
          {p.outreach.length === 0 ? (
            <p className="mt-2 text-[0.8125rem] text-muted">Abhi koi message nahi gaya.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1 text-[0.8125rem] text-muted">
              {p.outreach.slice(0, 8).map((o, i) => (
                <li key={i}>
                  {o.channel} · {o.templateKey} · {o.status} · {o.createdAt}
                </li>
              ))}
            </ul>
          )}
          {p.invites.length > 0 && (
            <>
              <h4 className="mt-3 text-sm font-semibold text-ink">Invites</h4>
              <ul className="mt-1 flex flex-col gap-1 text-[0.8125rem] text-muted">
                {p.invites.slice(0, 6).map((inv, i) => (
                  <li key={i}>
                    {inv.fullName} · {inv.status} · {inv.createdAt}
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>

      <AdminActionConfirmModal
        isOpen={pendingRate !== null}
        onClose={() => setPendingRate(null)}
        onConfirm={confirmRate}
        title={pendingRate?.percent === null ? "Override hatayein?" : "Is partner ka rate badlein?"}
        description="Sirf aage aane wale payments par asar hoga. Purani commission rows waise hi rahengi."
        details={
          pendingRate
            ? [
                { label: "Partner", value: p.fullName },
                {
                  label: "Pehle",
                  value:
                    p.commissionBpsOverride === null
                      ? `Tier rate (${bpsToPercentDisplay(p.tierBps)})`
                      : bpsToPercentDisplay(p.commissionBpsOverride),
                },
                {
                  label: "Ab",
                  value:
                    pendingRate.percent === null
                      ? `Tier rate (${bpsToPercentDisplay(p.tierBps)})`
                      : `${pendingRate.percent}%`,
                },
                { label: "Reason", value: reason.trim() },
              ]
            : []
        }
        confirmLabel="Yes, Save"
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card variant="soft" padding="md" className="text-center">
      <p className="text-xl font-bold leading-none text-wine-700">{value}</p>
      <p className="mt-1.5 text-[0.75rem] text-muted">{label}</p>
    </Card>
  );
}
