/**
 * `parseContact` from lib/services/auth/contactOtpService.ts — the server's
 * own rule, so the app never sends a number the server will refuse:
 * "98765 43210", "+91 9876543210", "09876543210" → a 10-digit Indian mobile;
 * anything with @ → an email.
 */
export type Contact = { kind: "mobile"; value: string } | { kind: "email"; value: string };

export function parseContact(raw: string): Contact | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if (s.includes("@")) {
    const email = s.toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? { kind: "email", value: email } : null;
  }
  let digits = s.replace(/[०-९]/g, (d) => String("०१२३४५६७८९".indexOf(d))).replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? { kind: "mobile", value: digits } : null;
}

export function describeContact(c: Contact): string {
  return c.kind === "mobile" ? `+91 ${c.value.slice(0, 5)} ${c.value.slice(5)}` : c.value;
}
