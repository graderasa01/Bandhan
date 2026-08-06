"use client";

import Card from "@/components/ui/Card";

/** The "queue is empty" card repeated across every admin review list. */
export default function EmptyReviewState({ message }: { message: string }) {
  return (
    <Card variant="soft" padding="lg">
      <p className="text-center text-sm text-muted">{message}</p>
    </Card>
  );
}
