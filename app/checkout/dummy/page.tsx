import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { isTestGateway } from "@/lib/services/payments/gateway";
import { PLAN_NAMES } from "@/lib/constants/plans";
import DummyCheckoutPanel from "@/components/payments/DummyCheckoutPanel";

/**
 * Stands in for the Razorpay Checkout modal while no real key is configured.
 *
 * Reachable only from `createCheckout`'s own `checkoutUrl` (§gateway.ts) and
 * only while `isTestGateway()` — the moment real keys are set, this route
 * still exists but nothing in the app links to it, and `/api/checkout/dummy/complete`
 * refuses to run.
 */
export default async function DummyCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string; amount?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/user/subscription");
  if (!isTestGateway()) redirect("/user/subscription");

  const { order } = await searchParams;
  if (!order) redirect("/user/subscription");

  const payment = await prisma.payment.findFirst({
    where: { externalOrderId: order, userId: user.id, status: { in: ["CREATED", "AUTHORIZED"] } },
  });
  if (!payment) redirect("/user/subscription");

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4 py-10">
      <div className="rounded-lg border border-line bg-surface p-6 shadow-lg">
        <p className="text-center text-[0.6875rem] font-semibold uppercase tracking-wider text-warn">
          Test Mode — abhi asli payment gateway connect nahi hai
        </p>
        <h1 className="mt-3 text-center text-xl font-bold text-wine-700">
          {PLAN_NAMES[payment.planCode]} Plan
        </h1>
        <p className="mt-1 text-center text-3xl font-bold text-ink">
          ₹{(payment.amountPaise / 100).toLocaleString("en-IN")}
        </p>
        {payment.discountPaise > 0 && (
          <p className="mt-1 text-center text-[0.8125rem] text-trust">
            ₹{(payment.discountPaise / 100).toLocaleString("en-IN")} partner discount shaamil hai
          </p>
        )}

        <DummyCheckoutPanel orderId={order} />

        <p className="mt-4 text-center text-[0.75rem] leading-snug text-subtle">
          Ye page Razorpay Checkout ki jagah dikh raha hai. Asli keys aane par ye screen khud replace ho
          jayegi — koi code change nahi karna padega.
        </p>
      </div>
    </div>
  );
}
