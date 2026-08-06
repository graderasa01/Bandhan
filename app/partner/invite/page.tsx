import { redirect } from "next/navigation";
import { Check, Clock, Mail, Send, ShieldCheck, UserCheck } from "lucide-react";
import { requirePartner } from "@/lib/auth/requirePartner";
import { listPartnerInvites, MAX_INVITES_PER_DAY } from "@/lib/services/outreach/inviteService";
import PartnerShell from "@/components/layout/PartnerShell";
import InviteForm from "@/components/partner/InviteForm";
import { getActivePartnerCode } from "@/components/partner/_shared/getActivePartnerCode";
import Card from "@/components/ui/Card";
import Pill from "@/components/ui/Pill";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Link bana",
  SENT: "Bhej diya",
  FAILED: "Nahi gaya",
  OPENED: "Link khola",
  JOINED: "Join kar liya",
};

const STATUS_TONE: Record<string, "neutral" | "gold" | "trust"> = {
  PENDING: "neutral",
  SENT: "gold",
  FAILED: "neutral",
  OPENED: "gold",
  JOINED: "trust",
};

/**
 * Inviting someone who isn't on BandhanTak yet.
 *
 * The privacy note at the bottom is about the *invited person*, not the
 * partner — every other partner screen explains what the partner can't see,
 * and this is the one screen where the partner is the one handing us somebody
 * else's details. It has to say what happens to them.
 */
export default async function PartnerInvitePage() {
  const { partner, redirectTo } = await requirePartner(["APPROVED", "ACTIVE"]);
  if (!partner) redirect(redirectTo);

  const [invites, partnerCode] = await Promise.all([
    listPartnerInvites(partner.id),
    getActivePartnerCode(partner.id),
  ]);

  const joined = invites.filter((i) => i.status === "JOINED").length;
  const today = new Date().toISOString().slice(0, 10);
  const usedToday = invites.filter((i) => i.createdAt === today).length;

  return (
    <PartnerShell partnerName={partner.fullName} partnerCode={partnerCode}>
      <div className="mx-auto max-w-xl">
        <section className="mb-6">
          <h1 className="text-2xl font-bold text-wine-700">Invite Someone</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Jinse aapne rishte ki baat ki hai, unka naam aur contact yahan daaliye. Unhe aapke naam se ek personal
            link jayega — us link se join karne par wo seedha aapki leads list me aa jayenge.
          </p>
        </section>

        <div className="mb-4 grid grid-cols-3 gap-3">
          {[
            { label: "Invite bheje", value: invites.length },
            { label: "Join kiya", value: joined },
            { label: "Aaj bache", value: MAX_INVITES_PER_DAY - usedToday },
          ].map((m) => (
            <Card key={m.label} variant="soft" padding="md" className="text-center">
              <p className="text-2xl font-bold leading-none text-wine-700">{m.value}</p>
              <p className="mt-1.5 text-[0.75rem] text-muted">{m.label}</p>
            </Card>
          ))}
        </div>

        <InviteForm />

        <section className="mt-6">
          <h2 className="mb-3 text-lg font-semibold text-ink">Bheje gaye invites</h2>
          {invites.length === 0 ? (
            <Card variant="soft" padding="lg" className="text-center">
              <p className="font-semibold text-ink">Abhi tak koi invite nahi bheja.</p>
              <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted">
                Upar wale form se pehla invite bhejiye.
              </p>
            </Card>
          ) : (
            <div className="flex flex-col gap-2">
              {invites.map((invite) => (
                <Card key={invite.id} variant="default" padding="sm" className="flex items-center gap-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-2">
                    {invite.status === "JOINED" ? (
                      <UserCheck className="size-4 text-trust" />
                    ) : invite.channel === "EMAIL" ? (
                      <Mail className="size-4 text-muted" />
                    ) : invite.channel === "WHATSAPP" ? (
                      <Send className="size-4 text-muted" />
                    ) : (
                      <Clock className="size-4 text-muted" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-ink">{invite.fullName}</p>
                    <p className="mt-0.5 text-[0.6875rem] text-subtle">
                      {invite.contactHint} · {invite.createdAt}
                      {invite.failureReason ? ` · ${invite.failureReason}` : ""}
                    </p>
                  </div>
                  <Pill tone={STATUS_TONE[invite.status] ?? "neutral"} size="sm">
                    {invite.status === "JOINED" && <Check className="size-3" />}
                    {STATUS_LABEL[invite.status] ?? invite.status}
                  </Pill>
                </Card>
              ))}
            </div>
          )}
        </section>

        <Card variant="soft" padding="md" className="mt-6">
          <p className="flex items-start gap-2 text-xs leading-relaxed text-muted">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Jinhe aap invite kar rahe hain unka account abhi nahi banta — sirf ek link jaata hai. Account tabhi
              banega jab wo khud link kholkar apni details bharenge. Isliye zaroori hai ki aapne unse pehle baat kar
              li ho. Ek din me {MAX_INVITES_PER_DAY} invite ki limit hai.
            </span>
          </p>
        </Card>
      </div>
    </PartnerShell>
  );
}
