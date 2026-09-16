"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Gift, LockOpen } from "lucide-react";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/components/i18n/LanguageProvider";
import {
  NO_REPLY_GUARANTEE_HOURS,
  type ChatUnlockActionResponse,
  type ChatUnlockQuoteView,
} from "@/lib/contracts/chatUnlock";

function rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

/**
 * Where the composer sits in a thread whose chat is not open yet (D-90).
 *
 * Three things are said on the card itself, because each is the question the
 * member is about to ask: what it costs, that it opens the chat for both of
 * them (so the other side is never asked to pay again), and what happens if
 * nobody writes back. The Pass is a quiet link, not a second button — the card
 * is about this one rishta.
 */
export default function ChatUnlockCard({
  matchId,
  otherName,
  quote,
}: {
  matchId: string;
  otherName: string;
  quote: ChatUnlockQuoteView;
}) {
  const t = useT();
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  if (quote.state === "open") return null;

  async function unlock() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/chat-unlock/${matchId}`, { method: "POST" });
      const json = (await res.json()) as ChatUnlockActionResponse;
      if (!json.ok) {
        toast({ title: t("chatUnlock.failed", "Chat nahi khul payi"), description: json.message, tone: "error" });
        setBusy(false);
        return;
      }
      if ("checkoutUrl" in json) {
        window.location.href = json.checkoutUrl;
        return;
      }
      toast({ title: t("chatUnlock.opened", "Chat khul gayi — ab aap dono baat kar sakte hain"), tone: "success" });
      router.refresh();
      setBusy(false);
    } catch {
      toast({ title: t("chatUnlock.networkError", "Network error — dobara try karein"), tone: "error" });
      setBusy(false);
    }
  }

  const shell =
    "shrink-0 border-t border-line bg-surface px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] sm:px-6";

  if (quote.state === "unavailable") {
    return (
      <div className={shell}>
        <p className="text-[0.8125rem] text-muted">{quote.message}</p>
      </div>
    );
  }

  const pass = quote.pass;

  return (
    <div className={shell}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-gold-100 text-gold-700 dark:bg-gold-900/30 dark:text-gold-300">
          {quote.state === "credit" ? <Gift className="size-4" aria-hidden /> : <LockOpen className="size-4" aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.9375rem] font-semibold text-ink">
            {otherName} {t("chatUnlock.titleSuffix", "ke saath baat shuru karein")}
          </p>
          <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-muted">
            {quote.state === "credit"
              ? quote.welcome
                ? t(
                    "chatUnlock.welcomeBody",
                    "Aapke partner ki taraf se pehli baatcheet free hai. Chat aap dono ke liye khulegi.",
                  )
                : `${t("chatUnlock.creditBodyPrefix", "Aapke paas")} ${quote.credits} ${t(
                    "chatUnlock.creditBodySuffix",
                    "free unlock hain. Chat aap dono ke liye khulegi.",
                  )}`
              : `${rupees(quote.pricePaise)} ${t(
                  "chatUnlock.payBody",
                  "ek baar — sirf is rishte ke liye, aur chat aap dono ke liye khulegi.",
                )}`}
          </p>
          <p className="mt-1 text-[0.75rem] leading-snug text-subtle">
            {t("chatUnlock.guaranteePrefix", "Aapne message bheja aur")} {NO_REPLY_GUARANTEE_HOURS}{" "}
            {t("chatUnlock.guaranteeSuffix", "ghante me jawab nahi aaya, to 1 unlock credit wapas milega.")}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <Button
              variant="primary"
              size="sm"
              loading={busy}
              onClick={unlock}
              icon={quote.state === "credit" ? <Gift className="size-4" /> : <LockOpen className="size-4" />}
            >
              {quote.state === "credit"
                ? t("chatUnlock.useFree", "Use Free Unlock")
                : `${t("chatUnlock.unlockChat", "Unlock Chat")} ${rupees(quote.pricePaise)}`}
            </Button>
            {pass && (
              <Link
                href="/user/subscription"
                className="text-[0.75rem] font-medium text-primary-text underline underline-offset-2"
              >
                {t("chatUnlock.passLinkPrefix", "Bahut rishton se baat karni hai?")} {pass.name} —{" "}
                {rupees(pass.pricePaise)}
                {t("chatUnlock.passLinkSuffix", "/mahina, sab chats khuli")}
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
