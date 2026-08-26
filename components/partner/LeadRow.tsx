import Link from "next/link";
import { ChevronRight, MessageCircle } from "lucide-react";
import Card from "@/components/ui/Card";
import Pill from "@/components/ui/Pill";
import Avatar from "@/components/ui/Avatar";
import SendForMeButton from "@/components/partner/SendForMeButton";
import { templateForStatus } from "@/lib/partner/leadTemplates";
import type { LeadStatus, PartnerLeadViewModel } from "@/lib/contracts/partner";
import { getT } from "@/lib/i18n/server";
import { appOrigin } from "@/lib/utils/appOrigin";

const STATUS_TONE: Record<LeadStatus, "neutral" | "gold" | "trust"> = {
  JOINED: "neutral",
  PROFILE_STARTED: "gold",
  PROFILE_DONE: "trust",
  PAID: "trust",
  INACTIVE: "neutral",
};

/**
 * First name and city only — no photo, no age, no exact completion number.
 * The shape comes straight from `toPartnerLead()`, which is the only place
 * allowed to decide what a partner can see.
 *
 * Three ways to follow up, in deliberate order of preference:
 *
 * 1. **Reminder** — a `wa.me` link with the text pre-filled. No phone number
 *    appears here or in the link: `wa.me/?text=` with no number opens the
 *    partner's own contact picker, so the partner — who already knows this
 *    person in real life, that's how a referral happens — chooses who to send
 *    it to. The app never learns or stores the lead's number. Best message of
 *    the three, because it arrives from someone the family knows.
 * 2. **BandhanTak se** — we send the same copy, signed with the partner's
 *    name, for the partner who doesn't have the number saved or won't do it.
 * 3. **Email** — same, for a lead whose number we don't have.
 *
 * The copy itself lives in lib/partner/leadTemplates.ts so all three send the
 * identical message.
 */
export default async function LeadRow({ lead, partnerName }: { lead: PartnerLeadViewModel; partnerName: string }) {
  const t = await getT();
  const STATUS_LABEL: Record<LeadStatus, string> = {
    JOINED: t("partner.leadRow.status.joined", "Join kiya"),
    PROFILE_STARTED: t("partner.leadRow.status.profileStarted", "Profile shuru ki"),
    PROFILE_DONE: t("partner.leadRow.status.profileDone", "Profile poori"),
    PAID: t("partner.leadRow.status.paid", "Plan liya"),
    INACTIVE: t("partner.leadRow.status.inactive", "Active nahi"),
  };
  const template = templateForStatus(lead.status);
  const selfSendText = template.whatsapp({
    firstName: lead.firstName,
    partnerName,
    // Client-side, so this has to come from the bundle rather than a server
    // env read. The server-side senders resolve their own origin.
    appUrl: appOrigin(),
  });

  return (
    <Card variant="default" padding="sm" className="flex items-center gap-3">
      <Avatar name={lead.firstName} size="sm" />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/partner/leads/${lead.leadId}`}
            className="font-semibold text-ink underline-offset-2 hover:underline"
          >
            {lead.firstName}
          </Link>
          <Pill tone={STATUS_TONE[lead.status]} size="sm">
            {STATUS_LABEL[lead.status]}
          </Pill>
        </div>
        <p className="mt-0.5 text-[0.8125rem] text-muted">
          {lead.city ?? t("partner.leadRow.cityUnknown", "City nahi bataayi")} ·{" "}
          {t("partner.leadRow.profileLabel", "Profile")} {lead.completionBucket}
        </p>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <a
            href={`https://wa.me/?text=${encodeURIComponent(selfSendText)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-8 items-center gap-1 text-[0.6875rem] font-semibold text-trust underline underline-offset-2"
          >
            <MessageCircle className="size-3" />
            {t("partner.leadRow.sendMyself", "Send Myself")}
          </a>
          <SendForMeButton
            leadId={lead.leadId}
            channel="WHATSAPP"
            label={t("partner.leadRow.sendViaBandhanTak", "BandhanTak se")}
          />
          <SendForMeButton leadId={lead.leadId} channel="EMAIL" label={t("partner.leadRow.sendViaEmail", "Email")} />
        </div>
      </div>

      <div className="shrink-0 text-right">
        <p className="text-[0.6875rem] text-subtle">
          {t("partner.leadRow.active", "Active:")} {lead.activityBucket}
        </p>
        <p className="text-[0.6875rem] text-subtle">
          {t("partner.leadRow.joined", "Joined")} {lead.joinedAt}
        </p>
        <Link
          href={`/partner/leads/${lead.leadId}`}
          className="mt-1.5 inline-flex min-h-8 items-center gap-0.5 text-[0.6875rem] font-semibold text-primary-text underline underline-offset-2"
        >
          {t("partner.leadRow.details", "Details")}
          <ChevronRight className="size-3" />
        </Link>
      </div>
    </Card>
  );
}
