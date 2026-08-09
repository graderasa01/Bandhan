/**
 * Gotra & Manglik notes — the two traditional checks Indian families actually
 * run, computed from fields the profile builder already collects and until now
 * used for nothing.
 *
 * Three promises from `lib/profile/fields.ts` are load-bearing here. They are
 * shown to the user at the moment they type these answers, so breaking one is
 * breaking the app's word:
 *
 *  1. gotra — "Optional, aur match model me kabhi nahi jaata."
 *     Nothing in this file returns a score, weight, or filter. These are notes
 *     rendered on a profile the user already chose to look at. Gotra must never
 *     reach `pipeline.ts`.
 *  2. birthTime / birthPlace — "Sirf kundli ke liye — kisi aur ko kabhi nahi
 *     dikhta." This module therefore never reads, returns, or renders them.
 *  3. manglikStatus — "Hum nahi maante" chunne par ye profile par dikhta hi
 *     nahi. Either side opting out silences the manglik note entirely.
 *
 * Guna milan used to be refused here, on the grounds that "real guna milan
 * needs an ephemeris and an exact verified birth time; anything less is a
 * number pulled from the air." That was an argument against a *decorative*
 * score, and it still is. It has since been answered rather than dropped:
 * `ephemeris.ts` computes the Moon to under an arcminute, `gunaMilan.ts` runs
 * the eight kootas off it, and `kundliMatch.ts` marks every result with
 * whether the birth time behind it was stated or assumed. Those live next
 * door and never touch this file's two notes — which still need no birth data
 * at all, and so still work for the many users who skipped it.
 */

import type { KundliNote, KundliTone } from "@/lib/contracts/kundli";
import { noopT, type Translate } from "@/lib/i18n/translate";

export type { KundliNote, KundliTone };

/** Only the two fields these checks are allowed to see. Birth time/place are absent by design. */
export interface KundliInput {
  gotra?: string | null;
  manglikStatus?: string | null;
}

const OPTED_OUT = "Hum nahi maante";

function normaliseGotra(value?: string | null): string | null {
  const trimmed = value?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

function gotraNote(viewer: KundliInput, candidate: KundliInput, t: Translate): KundliNote | null {
  const mine = normaliseGotra(viewer.gotra);
  const theirs = normaliseGotra(candidate.gotra);
  // Silent when either side skipped it — an absent gotra is a non-answer, not a clash.
  if (!mine || !theirs || mine !== theirs) return null;

  return {
    id: "gotra",
    tone: "caution",
    title: t("kundli.notes.gotra.title", "Gotra ek hi hai"),
    detail: t(
      "kundli.notes.gotra.detail",
      "Kai parivaar same gotra me rishta nahi karte, kai karte hain. Ye sirf jaankari hai — faisla aapka aur aapke ghar walon ka hai.",
    ),
  };
}

/**
 * The pairings families actually ask about. Kept as an explicit table rather
 * than clever logic so anyone can read it and check it against what a pandit
 * would say — and so nothing here can drift into sounding like a verdict.
 */
function manglikNote(viewer: KundliInput, candidate: KundliInput, t: Translate): KundliNote | null {
  const mine = viewer.manglikStatus?.trim();
  const theirs = candidate.manglikStatus?.trim();

  // Promise 3: either side opting out removes the topic from the screen.
  if (mine === OPTED_OUT || theirs === OPTED_OUT) return null;
  if (!mine || !theirs) return null;

  const isManglik = (v: string) => v === "Haan";
  const isPartial = (v: string) => v === "Aanshik manglik";
  const isUnknown = (v: string) => v === "Pata nahi";

  if (isUnknown(mine) || isUnknown(theirs)) {
    return {
      id: "manglik",
      tone: "info",
      title: t("kundli.notes.manglik.unknown.title", "Manglik status pata nahi"),
      detail: t(
        "kundli.notes.manglik.unknown.detail",
        "Dono me se ek ka manglik status pata nahi hai. Agar ye aapke ghar me maayne rakhta hai to pandit ji se puchh lijiye.",
      ),
    };
  }

  if (isManglik(mine) && isManglik(theirs)) {
    return {
      id: "manglik",
      tone: "ok",
      title: t("kundli.notes.manglik.bothYes.title", "Dono manglik"),
      detail: t(
        "kundli.notes.manglik.bothYes.detail",
        "Dono ka manglik status same hai — parampara me ise aam taur par theek maana jaata hai.",
      ),
    };
  }

  if (!isManglik(mine) && !isManglik(theirs) && !isPartial(mine) && !isPartial(theirs)) {
    return {
      id: "manglik",
      tone: "ok",
      title: t("kundli.notes.manglik.bothNo.title", "Dono manglik nahi"),
      detail: t("kundli.notes.manglik.bothNo.detail", "Manglik status dono taraf se ek jaisa hai."),
    };
  }

  if (isPartial(mine) || isPartial(theirs)) {
    return {
      id: "manglik",
      tone: "info",
      title: t("kundli.notes.manglik.partial.title", "Aanshik manglik"),
      detail: t(
        "kundli.notes.manglik.partial.detail",
        "Ek taraf aanshik manglik status hai. Kai parivaar ise aasaani se accept kar lete hain — poochh lena behtar rehta hai.",
      ),
    };
  }

  return {
    id: "manglik",
    tone: "caution",
    title: t("kundli.notes.manglik.differs.title", "Manglik status alag hai"),
    detail: t(
      "kundli.notes.manglik.differs.detail",
      "Ek manglik hai aur doosra nahi. Kai parivaar is par pandit ji se milan karwate hain, kai koi farak nahi maante.",
    ),
  };
}

/**
 * Notes for a candidate the viewer is already looking at. Returns an empty
 * array when there is nothing honest to say — silence is a valid answer here,
 * and padding it with "sab theek hai" filler would make the real warnings
 * invisible.
 */
export function getKundliNotes(viewer: KundliInput, candidate: KundliInput, t: Translate = noopT): KundliNote[] {
  return [gotraNote(viewer, candidate, t), manglikNote(viewer, candidate, t)].filter(
    (n): n is KundliNote => n !== null,
  );
}
