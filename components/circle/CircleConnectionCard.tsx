"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clock, Crown, Loader2, MessageCircle, ShieldCheck, UserRound } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import PhotoUnlockCta from "@/components/subscription/PhotoUnlockCta";
import { MARRIAGE_TIMELINE_LABEL } from "@/lib/circle/eligibility";
import type { CircleView } from "@/lib/services/circle/circleService";
import { useT } from "@/components/i18n/LanguageProvider";

type Connection = CircleView["connections"][number];

/**
 * One pairing, from this user's side only.
 *
 * The other person's answer is never rendered — `status` arrives already
 * collapsed by `getMyConnections`, so a decline and a timeout look identical
 * here. That is not laziness in the UI: there is no version of "unhone mana
 * kar diya" worth showing a human being, and the surest way to never
 * accidentally show it is for the component to have no access to it.
 */
export default function CircleConnectionCard({ conn }: { conn: Connection }) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useT();
  const [busy, setBusy] = useState(false);

  const person = conn.person;
  if (!person) return null;

  async function answer(accept: boolean) {
    setBusy(true);
    try {
      const res = await fetch(`/api/circle/connections/${conn.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accept }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: t("circle.connectionCard.actionFailed", "Nahi ho paya"), description: json.message ?? t("circle.connectionCard.tryAgain", "Please try again."), tone: "error" });
        return;
      }
      if (json.connected) {
        toast({ title: t("circle.connectionCard.connectedTitle", "Connection ho gaya"), description: t("circle.connectionCard.connectedDesc", "Ab aap dono baat kar sakte hain."), tone: "success" });
      }
      router.refresh();
    } catch {
      toast({ title: t("circle.connectionCard.networkErrorTitle", "Network error"), description: t("circle.connectionCard.tryAgain", "Please try again."), tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  const detail = [person.age ? `${person.age}${t("circle.connectionCard.ageSuffix", " saal")}` : null, person.city, person.profession]
    .filter(Boolean)
    .join(" · ");

  return (
    <Card variant={conn.status === "connected" ? "default" : "soft"} padding="md">
      <div className="flex items-start gap-3">
        <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-bg-subtle">
          {person.photoUnlocked && person.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={person.photoUrl} alt="" className="size-full object-cover" />
          ) : (
            <UserRound className="size-6 text-subtle" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-ink">{person.displayName}</p>
            {conn.rank === 1 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-gold-100 px-2 py-0.5 text-[0.6875rem] font-semibold text-gold-800 dark:bg-gold-900/40 dark:text-gold-200">
                <Crown className="size-3" />
                {t("circle.connectionCard.topPair", "Circle ki top jodi")}
              </span>
            )}
          </div>
          {detail && <p className="mt-0.5 text-[0.8125rem] text-muted">{detail}</p>}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.75rem] text-subtle">
            <span className="inline-flex items-center gap-1">
              <ShieldCheck className="size-3.5 text-trust" />
              {conn.score}
              {t("circle.connectionCard.sochMilatiHai", "% soch milti hai")}
            </span>
            {person.timeline && (
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3.5" />
                {MARRIAGE_TIMELINE_LABEL[person.timeline]}
              </span>
            )}
          </div>

          {/* The number alone is a claim; this is the receipt. Only rendered
              when the score had a source the user could actually recount —
              `describeSochFit` returns null for an AI-only match. */}
          {conn.sochReason && (
            <p className="mt-1.5 text-[0.75rem] text-muted">
              <span className="font-medium text-primary-text">{t("circle.connectionCard.whyLabel", "Kyun:")}</span> {conn.sochReason}
            </p>
          )}
        </div>
      </div>

      {!person.photoUnlocked && conn.status !== "connected" && (
        <div className="mt-3">
          <p className="text-[0.75rem] text-subtle">
            {t(
              "circle.connectionCard.photoUnlockHint",
              "Photo dono ke haan karne ke baad khulti hai — ya subscription lene par. Yahan soch pehle, shakal baad me.",
            )}
          </p>
          <PhotoUnlockCta className="min-h-9 text-[0.75rem]" />
        </div>
      )}

      <div className="mt-4">
        {conn.status === "waiting_for_me" && (
          <div className="flex gap-2">
            <Button variant="primary" size="sm" disabled={busy} onClick={() => answer(true)} className="flex-1">
              {busy && <Loader2 className="size-4 animate-spin" />}
              {t("circle.connectionCard.connect", "Connect")}
            </Button>
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => answer(false)} className="flex-1">
              {t("circle.connectionCard.pass", "Pass")}
            </Button>
          </div>
        )}

        {conn.status === "waiting_for_them" && (
          <p className="text-[0.8125rem] text-muted">
            {t(
              "circle.connectionCard.waitingForThem",
              "Aapne haan kar di. Unka jawab aana baaki hai — connection banne par aapko bata denge.",
            )}
          </p>
        )}

        {conn.status === "connected" && conn.matchId && (
          <div>
            <Link href={`/user/messages/${conn.matchId}`}>
              <Button variant="accent" size="sm" className="w-full">
                <MessageCircle className="size-4" />
                {t("circle.connectionCard.openChat", "Open chat")}
              </Button>
            </Link>
            {conn.windowEndsAt && (
              <p className="mt-2 text-center text-[0.75rem] text-subtle">
                {new Date(conn.windowEndsAt) > new Date()
                  ? `${t("circle.connectionCard.freeWindowPre", "Free window ")}${formatWindow(conn.windowEndsAt)}${t("circle.connectionCard.freeWindowPost", " tak — plan chahe jo bhi ho.")}`
                  : t("circle.connectionCard.freeWindowEnded", "Free window khatam. Aage baat karne ke liye plan chahiye.")}
              </p>
            )}
          </div>
        )}

        {conn.status === "closed" && (
          <p className="text-[0.8125rem] text-subtle">{t("circle.connectionCard.pairingClosed", "Ye pairing band ho gayi.")}</p>
        )}
      </div>
    </Card>
  );
}

function formatWindow(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}
