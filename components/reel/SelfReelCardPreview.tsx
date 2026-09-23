"use client";

import ReelCard from "@/components/reel/ReelCard";
import type { ReelCardViewModel } from "@/lib/contracts/reel";

/**
 * Thin client boundary — `ReelCard` is itself a client component, and the
 * preview page is a Server Component. The owner's own card takes no actions
 * (there is nobody to send an interest to), so it renders with no `actions`
 * and therefore no rail, no reasons line and no details door.
 */
export default function SelfReelCardPreview({ card }: { card: ReelCardViewModel }) {
  return <ReelCard card={card} selfPreview />;
}
