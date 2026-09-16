import "server-only";
import type { Payment } from "@prisma/client";
import { getPlanCatalog, planNameOf } from "@/lib/services/plans/planCatalog";
import { getItemCatalog, itemOf } from "@/lib/services/items/itemCatalog";
import { itemPromiseLine } from "@/lib/constants/serviceItems";

/**
 * "What is this payment for", in words, for the screen the buyer is looking at
 * when they pay — and where they go back to afterwards.
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
  /**
   * Where the buyer lands after paying, failing, or closing the window. A Chat
   * Unlock returns to its own thread (D-90) — sending somebody who just opened
   * a conversation to the plans page would make them hunt for the chat they
   * paid for.
   */
  returnHref: string;
  /** The English button label for going back there. */
  returnLabel: string;
}

const TO_PLANS = { returnHref: "/user/subscription", returnLabel: "Back to Plans" } as const;

export async function describePayment(
  payment: Pick<Payment, "kind" | "planCode" | "itemCode" | "itemRefId">,
): Promise<PaymentLine> {
  if (payment.kind === "ITEM") {
    const item = payment.itemCode ? itemOf(await getItemCatalog(), payment.itemCode) : null;
    if (!item) return { title: payment.itemCode ?? "Purchase", subtitle: null, ...TO_PLANS };
    const subtitle = itemPromiseLine(item.kind, item.config);
    if (item.kind === "CHAT_UNLOCK" && payment.itemRefId) {
      return { title: item.name, subtitle, returnHref: `/user/messages/${payment.itemRefId}`, returnLabel: "Back to Chat" };
    }
    return { title: item.name, subtitle, ...TO_PLANS };
  }

  // Two kinds that carry neither a plan code nor an item code, and so used to
  // fall through to the subscription line below: a booking checkout headed
  // "Subscription" is telling the buyer they are signing up for something
  // recurring, which is the one thing it is not.
  if (payment.kind === "SERVICE_BOOKING") {
    return { title: "Partner service booking", subtitle: "Partner accept nahi karenge to poora paisa wapas.", ...TO_PLANS };
  }

  if (payment.kind === "VERIFICATION") {
    return {
      title: "Verification check",
      // Said at the moment of payment, which is the moment it matters —
      // the same sentence `VERIFICATION_DISCLOSURE` carries on the ask form.
      subtitle: "Paisa check karwane ka hai, jawaab ka nahi. Nateeja jo hoga wahi dikhega.",
      ...TO_PLANS,
    };
  }

  if (!payment.planCode) return { title: "Subscription", subtitle: null, ...TO_PLANS };
  return { title: `${planNameOf(await getPlanCatalog(), payment.planCode)} Plan`, subtitle: null, ...TO_PLANS };
}
