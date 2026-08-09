"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Loader2, Mail, MessageCircle, Send } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/components/i18n/LanguageProvider";

type Channel = "SELF" | "WHATSAPP" | "EMAIL";

type Sent = { inviteUrl: string; shareText: string; channel: Channel; sendError: string | null };

/**
 * The partner types in someone they have personally spoken to, and either
 * shares the link themselves or has BandhanTak send it.
 *
 * Two deliberate choices in this UI:
 *
 * - **Self-send is the default option**, listed first. It is the lowest-risk
 *   path (nothing leaves our servers to a stranger) and it produces the better
 *   message, because it arrives from someone the family actually knows.
 * - **The consent checkbox gates the submit button**, rather than failing on
 *   the server after the partner has filled everything in. It is the one field
 *   here that is about somebody else's rights, so it should read as a
 *   condition of sending, not as fine print.
 */
export default function InviteForm() {
  const t = useT();
  const router = useRouter();
  const { toast } = useToast();

  const [fullName, setFullName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [channel, setChannel] = useState<Channel>("SELF");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<Sent | null>(null);
  const [copied, setCopied] = useState(false);

  const hasContact = mobile.trim() !== "" || email.trim() !== "";
  const canSubmit =
    fullName.trim().length >= 2 &&
    hasContact &&
    consent &&
    !busy &&
    !(channel === "WHATSAPP" && mobile.trim() === "") &&
    !(channel === "EMAIL" && email.trim() === "");

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    try {
      const res = await fetch("/api/partner/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName.trim(),
          mobile: mobile.trim(),
          email: email.trim(),
          channel,
          consent,
        }),
      });
      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok) {
        toast({
          title: t("partner.inviteForm.createErrorTitle", "Invite nahi bana"),
          description: json?.message ?? t("partner.inviteForm.tryAgain", "Dobara try karein."),
          tone: "error",
        });
        return;
      }

      setSent({ inviteUrl: json.inviteUrl, shareText: json.shareText, channel, sendError: json.sendError });

      if (json.sendError) {
        // The invite exists and its link works — this is a warning, not a
        // failure, and the partner can still share it by hand.
        toast({
          title: t("partner.inviteForm.sendFailedTitle", "Invite ban gaya, par bheja nahi ja saka"),
          description: `${json.sendError} ${t("partner.inviteForm.sendFailedDesc", "Link neeche hai — khud bhej sakte hain.")}`,
          tone: "error",
        });
      } else {
        toast({
          title:
            channel === "SELF"
              ? t("partner.inviteForm.linkReadyTitle", "Invite link taiyaar hai")
              : t("partner.inviteForm.sentTitle", "Invite bhej diya"),
          description:
            channel === "SELF"
              ? t("partner.inviteForm.linkReadyDesc", "Neeche se copy karke bhejein.")
              : t("partner.inviteForm.sentDesc", "Aapke naam se bheja gaya hai."),
          tone: "success",
        });
      }

      setFullName("");
      setMobile("");
      setEmail("");
      setConsent(false);
      router.refresh();
    } catch {
      toast({ title: t("partner.inviteForm.networkError", "Network error — dobara try karein"), tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function copyText() {
    if (!sent) return;
    try {
      await navigator.clipboard.writeText(sent.shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: t("partner.inviteForm.copyError", "Copy nahi hua — text select karke copy karein"),
        tone: "error",
      });
    }
  }

  const CHANNELS: { value: Channel; label: string; hint: string; icon: typeof Send }[] = [
    {
      value: "SELF",
      label: t("partner.inviteForm.channelSelfLabel", "Main khud bhejunga"),
      hint: t("partner.inviteForm.channelSelfHint", "Link copy karke apne WhatsApp se"),
      icon: MessageCircle,
    },
    {
      value: "WHATSAPP",
      label: t("partner.inviteForm.channelWhatsappLabel", "BandhanTak se WhatsApp"),
      hint: t("partner.inviteForm.channelWhatsappHint", "Mobile number chahiye"),
      icon: Send,
    },
    {
      value: "EMAIL",
      label: t("partner.inviteForm.channelEmailLabel", "BandhanTak se Email"),
      hint: t("partner.inviteForm.channelEmailHint", "Email address chahiye"),
      icon: Mail,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Card variant="elevated" padding="lg">
        <div className="flex flex-col gap-4">
          <Input
            label={t("partner.inviteForm.nameLabel", "Naam")}
            placeholder={t("partner.inviteForm.namePlaceholder", "Jaise: Priya Sharma")}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
          />
          <Input
            label={t("partner.inviteForm.mobileLabel", "Mobile number")}
            placeholder={t("partner.inviteForm.mobilePlaceholder", "10 digit")}
            inputMode="numeric"
            maxLength={10}
            value={mobile}
            onChange={(e) => setMobile(e.target.value.replace(/\D/g, ""))}
            helperText={t("partner.inviteForm.mobileHelper", "Mobile ya email me se ek zaroori hai.")}
          />
          <Input
            label={t("partner.inviteForm.emailLabel", "Email")}
            type="email"
            placeholder={t("partner.inviteForm.emailPlaceholder", "naam@example.com")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-ink">
              {t("partner.inviteForm.legend", "Kaise bhejein?")}
            </legend>
            <div className="flex flex-col gap-2">
              {CHANNELS.map((c) => {
                const disabled =
                  (c.value === "WHATSAPP" && mobile.trim() === "") ||
                  (c.value === "EMAIL" && email.trim() === "");
                return (
                  <label
                    key={c.value}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                      channel === c.value ? "border-primary bg-primary-soft" : "border-line bg-surface"
                    } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
                  >
                    <input
                      type="radio"
                      name="channel"
                      value={c.value}
                      checked={channel === c.value}
                      disabled={disabled}
                      onChange={() => setChannel(c.value)}
                      className="size-4 accent-[var(--bt-accent)]"
                    />
                    <c.icon className="size-4 shrink-0 text-muted" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-ink">{c.label}</span>
                      <span className="block text-xs text-muted">{c.hint}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg bg-warn-bg p-3">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-[var(--bt-accent)]"
            />
            <span className="text-[0.8125rem] leading-relaxed text-ink">
              {t(
                "partner.inviteForm.consent",
                "Maine inse khud baat kar li hai aur inhone BandhanTak par profile banane ke liye haan kaha hai.",
              )}
            </span>
          </label>

          <Button variant="primary" size="lg" disabled={!canSubmit} onClick={submit}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {channel === "SELF"
              ? t("partner.inviteForm.createLinkButton", "Create Invite Link")
              : t("partner.inviteForm.sendInviteButton", "Send Invite")}
          </Button>
        </div>
      </Card>

      {sent && (
        <Card variant="trust" padding="lg">
          <p className="font-semibold text-ink">
            {sent.channel === "SELF" || sent.sendError
              ? t("partner.inviteForm.sentCardTitleShare", "Ye link bhejein")
              : t("partner.inviteForm.sentCardTitleSent", "Invite chala gaya")}
          </p>
          <p className="mt-1 text-sm text-muted">
            {t(
              "partner.inviteForm.sentCardDesc",
              "Ye link sirf inke liye hai — isse join karne par ye seedha aapki leads list me aa jayenge.",
            )}
          </p>

          <p className="mt-3 break-all rounded-lg border border-line bg-surface px-3 py-2 font-mono text-xs text-ink">
            {sent.inviteUrl}
          </p>

          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={copyText}
              className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-primary-text underline underline-offset-2"
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied
                ? t("partner.inviteForm.copyDone", "Copy ho gaya")
                : t("partner.inviteForm.copyMessage", "Copy Message")}
            </button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(sent.shareText)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-trust underline underline-offset-2"
            >
              <MessageCircle className="size-4" />
              {t("partner.inviteForm.openWhatsapp", "Open in WhatsApp")}
            </a>
          </div>
        </Card>
      )}
    </div>
  );
}
