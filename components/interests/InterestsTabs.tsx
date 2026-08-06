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
        toast({ title: "Kuch galat ho gaya — dobara try karein", tone: "error" });
        return;
      }
      toast({
        title: status === "ACCEPTED" ? "Interest accept ho gaya" : "Interest decline kar diya",
        tone: status === "ACCEPTED" ? "success" : "info",
      });
      router.refresh();
    } catch {
      toast({ title: "Network error — dobara try karein", tone: "error" });
    } finally {
      setPendingId(null);
    }
  }

  const list = tab === "received" ? received : sent;
  const emptyState = tab === "received" ? emptyReceived : emptySent;

  return (
    <div>
      <div className="mb-4 flex gap-2">
        {(["received", "sent"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "min-h-11 rounded-full px-5 text-sm font-medium transition-colors",
              tab === t ? "bg-primary text-primary-fg shadow-md" : "bg-bg-subtle text-muted hover:text-ink",
            )}
          >
            {t === "received" ? `Received (${received.length})` : `Sent (${sent.length})`}
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
                        {item.message || (tab === "received" ? "Interest bheja hai" : "Interest bheja gaya")}
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
                          View Profile
                        </Button>
                      </Link>
                    )}
                    <Button
                      size="sm"
                      variant="success"
                      loading={pendingId === item.id}
                      onClick={() => respond(item.id, "ACCEPTED")}
                    >
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pendingId === item.id}
                      onClick={() => respond(item.id, "DECLINED")}
                    >
                      Decline
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
