"use client";

import ReelCard from "@/components/reel/ReelCard";
import type { ReelCardViewModel } from "@/lib/contracts/reel";

/**
 * Thin client boundary — `ReelCard` is itself a client component, and a
 * Server Component (the preview page) can't pass it an inline `onDismiss`
 * function as a prop (functions aren't serialisable across that boundary).
 * The page only ever hands this the plain `card` data; the no-op dismiss
 * handler lives here, in client-land, where it belongs.
 */
export default function SelfReelCardPreview({ card }: { card: ReelCardViewModel }) {
  return <ReelCard card={card} draggable={false} depth={0} onDismiss={() => {}} selfPreview />;
}
