/** "10:42 am" today, "Kal" yesterday, weekday this week, else "12 Sep". */
export function shortTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t = d.getTime();
  if (t >= startOfToday) return d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  if (t >= startOfToday - 86_400_000) return "Kal";
  if (t >= startOfToday - 6 * 86_400_000) return d.toLocaleDateString("en-IN", { weekday: "short" });
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/** "Aaj", "Kal", or "12 September" — chat day separators. */
export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t = d.getTime();
  if (t >= startOfToday) return "Aaj";
  if (t >= startOfToday - 86_400_000) return "Kal";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "long" });
}

export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}
