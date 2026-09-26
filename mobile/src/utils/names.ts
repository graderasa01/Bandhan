/**
 * How a person's name is shortened on screen. "Dr. Riya Kapoor" is Riya, not
 * "Dr." — a title is part of how someone is introduced, never what a card or
 * a toast calls them.
 */
const TITLE = /^(dr|mr|mrs|ms|miss|er|ca|adv|prof|capt|lt|col|smt|shri|sri)\.?$/i;

function words(name: string | null | undefined): string[] {
  const all = (name ?? "").trim().split(/\s+/).filter(Boolean);
  const rest = all.length > 1 ? all.filter((w, i) => !(i === 0 && TITLE.test(w))) : all;
  return rest;
}

/** "Dr. Riya Kapoor" → "Riya"; "" → "". */
export function firstNameOf(name: string | null | undefined): string {
  return words(name)[0] ?? "";
}

/** "Dr. Riya Kapoor" → "RK"; "" → "B" (the brand's letter, never an empty seal). */
export function initialsOf(name: string | null | undefined): string {
  const parts = words(name);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase() || "B";
}
