import { MessageCircle } from "lucide-react";
import Card from "@/components/ui/Card";
import Pill from "@/components/ui/Pill";
import Avatar from "@/components/ui/Avatar";
import type { LeadStatus, PartnerLeadViewModel } from "@/lib/contracts/partner";

const STATUS_LABEL: Record<LeadStatus, string> = {
  JOINED: "Join kiya",
  PROFILE_STARTED: "Profile shuru ki",
  PROFILE_DONE: "Profile poori",
  PAID: "Plan liya",
  INACTIVE: "Active nahi",
};

const STATUS_TONE: Record<LeadStatus, "neutral" | "gold" | "trust"> = {
  JOINED: "neutral",
  PROFILE_STARTED: "gold",
  PROFILE_DONE: "trust",
  PAID: "trust",
  INACTIVE: "neutral",
};

/**
 * Deterministic templates (not AI — same "code decides, not the model"
 * philosophy as `buildInsight()` in lib/data/partnerData.ts). No phone number
 * ever appears here or in the resulting link: `wa.me/?text=` with no number
 * opens the partner's own contact picker, so the partner — who already knows
 * this person in real life, that's how a referral happens — chooses who to
 * send it to. The app never learns or stores the lead's number.
 */
const WHATSAPP_TEMPLATE: Partial<Record<LeadStatus, (firstName: string, partnerName: string) => string>> = {
  PROFILE_STARTED: (firstName, partnerName) =>
    `Namaste ${firstName} ji 🙏\nBandhanTak par aapki profile dekhi. Ek baar poori kar lijiye — profile jitni poori hogi, utne acche rishtey milenge.\n- ${partnerName}`,
  PROFILE_DONE: (firstName, partnerName) =>
    `Namaste ${firstName} ji 🙏\nAapki profile complete ho gayi hai, bahut achha! Ab plan lekar matches dekhna shuru kariye.\n- ${partnerName}`,
};

/**
 * First name and city only — no photo, no age, no exact completion number.
 * The shape comes straight from `toPartnerLead()`, which is the only place
 * allowed to decide what a partner can see.
 */
export default function LeadRow({ lead, partnerName }: { lead: PartnerLeadViewModel; partnerName: string }) {
  const buildTemplate = WHATSAPP_TEMPLATE[lead.status];

  return (
    <Card variant="default" padding="sm" className="flex items-center gap-3">
      <Avatar name={lead.firstName} size="sm" />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-ink">{lead.firstName}</p>
          <Pill tone={STATUS_TONE[lead.status]} size="sm">
            {STATUS_LABEL[lead.status]}
          </Pill>
        </div>
        <p className="mt-0.5 text-[0.8125rem] text-muted">
          {lead.city ?? "City nahi bataayi"} · Profile {lead.completionBucket}
        </p>
      </div>

      <div className="shrink-0 text-right">
        <p className="text-[0.6875rem] text-subtle">Active: {lead.activityBucket}</p>
        <p className="text-[0.6875rem] text-subtle">Joined {lead.joinedAt}</p>
        {buildTemplate && (
          <a
            href={`https://wa.me/?text=${encodeURIComponent(buildTemplate(lead.firstName, partnerName))}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1.5 inline-flex min-h-8 items-center gap-1 text-[0.6875rem] font-semibold text-trust underline underline-offset-2"
          >
            <MessageCircle className="size-3" />
            Reminder
          </a>
        )}
      </div>
    </Card>
  );
}
