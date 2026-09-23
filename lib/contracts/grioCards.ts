import type { PhotoLock } from "@/lib/contracts/photoLock";

/**
 * A person as Grio's chat shows them — see `/api/grio/cards`.
 *
 * Exactly what the profile page's first screen already shows this viewer, and
 * no more: the photo only when the photo gate opens it, and nothing a reel card
 * would keep back. Built by code for the *client*; none of it is ever put in a
 * prompt, which is what keeps "Grio can show people" from becoming "Grio can
 * read people".
 */
export interface GrioProfileCard {
  profileId: string;
  name: string;
  age: number | null;
  city: string | null;
  profession: string | null;
  verified: boolean;
  /** Null unless `photoLock === "open"`. A locked photo is never sent at all. */
  photoUrl: string | null;
  photoLock: PhotoLock;
  shortlisted: boolean;
  /** This viewer already has a live interest out to them (pending or accepted). */
  interestSent: boolean;
  /** Their match, when there is one — Message replaces Interest on the card. */
  matchId: string | null;
  /** Whether that match's chat is open right now (unlock, a Pass, or a Circle window). */
  chatOpen: boolean;
}

export interface GrioCardsResponse {
  ok: boolean;
  cards?: GrioProfileCard[];
  message?: string;
}

/** One request's ceiling — a search page plus a little. */
export const GRIO_CARDS_MAX = 12;
