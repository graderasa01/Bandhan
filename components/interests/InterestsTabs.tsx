"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Avatar from "@/components/ui/Avatar";
import EmptyState from "@/components/states/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n/LanguageProvider";
import type { InterestViewModel } from "@/lib/contracts/discovery";

type Tab = "received" | "sent";

export default function InterestsTabs({
  received,
  sent,
  emptyReceived,
  emptySent,
}: {
  received: InterestViewModel[];
  sent: InterestViewModel[];
  emptyReceived: { title: string; description?: string };
  emptySent: { title: string; description?: string };
}) {
  const t = useT();
  const [tab, setTab] = useState<Tab>("received");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const router = useRouter();
  const { toast } = useToast();

  async function respond(id: string, status: "ACCEPTED" | "DECLINED") {
    setPendingId(id);
    try {
      const res = await fetch(`/api/interests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: t("interests.errorGeneric", "Kuch galat ho gaya — dobara try karein"), tone: "error" });
        return;
      }
      toast({
        title:
          status === "ACCEPTED"
            ? t("interests.accepted", "Interest accept ho gaya")
            : t("interests.declined", "Interest decline kar diya"),
        tone: status === "ACCEPTED" ? "success" : "info",
      });
      router.refresh();
    } catch {
      toast({ title: t("interests.networkError", "Network error — dobara try karein"), tone: "error" });
    } finally {
      setPendingId(null);
    }
  }

  async function withdraw(id: string) {
    setPendingId(id);
    try {
      const res = await fetch(`/api/interests/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        // The endpoint's own window check is the authority — a card left open
        // past the deadline in a stale tab has to lose here, not win.
        toast({ title: t("interests.withdrawFailed", "Wapas nahi liya ja saka"), description: json.message, tone: "error" });
        return;
      }
      toast({ title: t("interests.withdrawn", "Interest wapas le liya"), tone: "info" });
      router.refresh();
    } catch {
      toast({ title: t("interests.networkError", "Network error — dobara try karein"), tone: "error" });
    } finally {
      setPendingId(null);
    }
  }

  const list = tab === "received" ? received : sent;
  const emptyState = tab === "received" ? emptyReceived : emptySent;

  return (
    <div>
      <div className="mb-4 flex gap-2">
        {(["received", "sent"] as const).map((tabKey) => (
          <button
            key={tabKey}
            type="button"
            onClick={() => setTab(tabKey)}
            className={cn(
              "min-h-11 rounded-full px-5 text-sm font-medium transition-colors",
              tab === tabKey ? "bg-primary text-primary-fg shadow-md" : "bg-bg-subtle text-muted hover:text-ink",
            )}
          >
            {tabKey === "received"
              ? `${t("interests.tabReceived", "Received")} (${received.length})`
              : `${t("interests.tabSent", "Sent")} (${sent.length})`}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="mb-6">
          <EmptyState title={emptyState.title} description={emptyState.description} />
        </div>
      ) : (
        <div className="mb-6 flex flex-col gap-3">
          {list.map((item) => {
            const person = tab === "received" ? item.fromUser : item.toUser;
            return (
              <Card key={item.id} variant="default" padding="md">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <Avatar name={person.displayName} size="sm" />
                    <div>
                      {item.profileId ? (
                        <Link
                          href={`/user/profile/${item.profileId}`}
                          className="text-base font-semibold text-ink transition-colors hover:text-primary-text"
                        >
                          {person.displayName}
                        </Link>
                      ) : (
                        <p className="text-base font-semibold text-ink">{person.displayName}</p>
                      )}
                      <p className="text-sm text-muted">
                        {item.status === "WITHDRAWN"
                          ? t("interests.withdrawnNote", "Aapne ye interest wapas le liya tha")
                          : item.message ||
                            (tab === "received"
                              ? t("interests.sentToYou", "Interest bheja hai")
                              : t("interests.sentByYou", "Interest bheja gaya"))}
                      </p>
                    </div>
                  </div>
                  <Badge variant={item.status === "ACCEPTED" ? "complete" : item.status === "DECLINED" ? "incomplete" : "pending"}>
                    {item.status}
                  </Badge>
                </div>

                {tab === "received" && item.status === "RECEIVED" && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {/* Accepting blind was the only option before this existed.
                        A received interest already opens L2, so the profile is
                        there to be read first. */}
                    {item.profileId && (
                      <Link href={`/user/profile/${item.profileId}`}>
                        <Button size="sm" variant="secondary">
                          {t("interests.viewProfile", "View Profile")}
                        </Button>
                      </Link>
                    )}
                    <Button
                      size="sm"
                      variant="success"
                      loading={pendingId === item.id}
                      onClick={() => respond(item.id, "ACCEPTED")}
                    >
                      {t("interests.accept", "Accept")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pendingId === item.id}
                      onClick={() => respond(item.id, "DECLINED")}
                    >
                      {t("interests.decline", "Decline")}
                    </Button>
                  </div>
                )}

                {/* `canWithdraw` is computed on the server from the same two
                    conditions the endpoint enforces (PENDING, inside 24h), so
                    the button is never offered where the API would refuse. */}
                {tab === "sent" && item.canWithdraw && (
                  <div className="mt-3">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pendingId === item.id}
                      onClick={() => withdraw(item.id)}
                    >
                      {t("interests.withdrawInterest", "Withdraw interest")}
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
