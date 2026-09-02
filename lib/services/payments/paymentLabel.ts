import "server-only";
import type { Payment } from "@prisma/client";
import { getPlanCatalog, planNameOf } from "@/lib/services/plans/planCatalog";
import { getItemCatalog, itemOf } from "@/lib/services/items/itemCatalog";
import { itemPromiseLine } from "@/lib/constants/serviceItems";

/**
 * "What is this payment for", in words, for the screen the buyer is looking at
 * when they pay.
 *
 * Exists because both checkout pages used to answer it themselves with
 * `planNameOf(catalog, payment.planCode)` — which stopped compiling the moment
 * `planCode` became nullable, and would have read "null Plan" on an item.
 * Answering it in one place also means the two gateways cannot describe the
 * same purchase differently, which is the kind of mismatch a user screenshots.
 *
 * Never throws and never returns an empty title: an unknown code falls back to
 * the code itself, because "REACH_50" on a checkout screen is recoverable and a
 * blank heading above a ₹99 charge is not.
 */
export interface PaymentLine {
  /** Complete heading, already including the word "Plan" where that applies. */
  title: string;
  /** What the buyer gets, when the product can say it in one line. */
  subtitle: string | null;
}

export async function describePayment(
  payment: Pick<Payment, "kind" | "planCode" | "itemCode">,
): Promise<PaymentLine> {
  if (payment.kind === "ITEM") {
    const item = payment.itemCode ? itemOf(await getItemCatalog(), payment.itemCode) : null;
    if (!item) return { title: payment.itemCode ?? "Purchase", subtitle: null };
    return { title: item.name, subtitle: itemPromiseLine(item.kind, item.config) };
  }

  // Two kinds that carry neither a plan code nor an item code, and so used to
  // fall through to the subscription line below: a booking checkout headed
  // "Subscription" is telling the buyer they are signing up for something
  // recurring, which is the one thing it is not.
  if (payment.kind === "SERVICE_BOOKING") {
    return { title: "Partner service booking", subtitle: "Partner accept nahi karenge to poora paisa wapas." };
  }

  if (payment.kind === "VERIFICATION") {
    return {
      title: "Verification check",
      // Said at the moment of payment, which is the moment it matters —
      // the same sentence `VERIFICATION_DISCLOSURE` carries on the ask form.
      subtitle: "Paisa check karwane ka hai, jawaab ka nahi. Nateeja jo hoga wahi dikhega.",
    };
  }

  if (!payment.planCode) return { title: "Subscription", subtitle: null };
  return { title: `${planNameOf(await getPlanCatalog(), payment.planCode)} Plan`, subtitle: null };
}
