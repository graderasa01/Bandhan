/**
 * "kal", "6 din pehle" — the one way this app says how long ago something was
 * inside a rishta.
 *
 * Pure and tiny, and shared rather than re-written per surface for a reason
 * that is not tidiness: the board, the Room and the text Grio reads aloud all
 * describe the *same* last message, and three copies of this rounding would
 * eventually have the board say "kal" while Grio said "2 din pehle" about one
 * event. A user cannot tell which one is lying, so neither is trusted again.
 */
export function daysAgoLabel(iso: string | null, now: Date = new Date()): string | null {
  if (!iso) return null;
  const days = Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "aaj";
  if (days === 1) return "kal";
  return `${days} din pehle`;
}
