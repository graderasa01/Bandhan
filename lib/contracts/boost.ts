/**
 * POST /api/profile/boost/activate — the client-safe response shape.
 *
 * `celebration` mirrors `CelebrationHost`'s own `Celebration` interface
 * (components/ui/CelebrationHost.tsx) rather than importing it — that file's
 * own comment explains why: "The client never builds one of these — it only
 * renders what an API handed back," and this contract, like every other file
 * in `lib/contracts/`, has to stay importable from both the server route and
 * a client component without pulling either side's module graph into the
 * other.
 */
export interface BoostCelebration {
  tier: "first" | "reward" | "micro";
  eventKey: string;
  title: string;
  subtitle?: string;
}

export type BoostActivateResponse =
  | { ok: true; activeUntil: string; celebration: BoostCelebration }
  | { ok: false; message: string };
