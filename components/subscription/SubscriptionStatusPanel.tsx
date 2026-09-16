"use client";

import SubscriptionStatusCard from "./SubscriptionStatusCard";

type Status = "NONE" | "ACTIVE" | "CANCELLED" | "EXPIRED" | "GRANTED";

/**
 * The client boundary for the status card on the server-rendered
 * /user/subscription page — the card reads the locale through a client hook.
 *
 * It used to also own a "Cancel Plan" action. That went with D-90: nothing
 * renews, so every plan already stops on its end date, and a cancel button
 * implied a future charge that was never going to happen.
 * `/api/subscriptions/cancel` still exists for an old client and still only
 * marks the row.
 */
export default function SubscriptionStatusPanel({
  planName,
  status,
  endsOn,
}: {
  planName: string | null;
  status: Status;
  endsOn?: string;
}) {
  return <SubscriptionStatusCard planName={planName} status={status} endsOn={endsOn} />;
}
