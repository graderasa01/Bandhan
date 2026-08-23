import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getRazorpayKeyId, isTestGateway } from "@/lib/services/payments/gateway";
import { getPlanCatalog, planNameOf } from "@/lib/services/plans/planCatalog";
import RazorpayCheckoutPanel from "@/components/payments/RazorpayCheckoutPanel";

/**
 * Where `createCheckout` sends a user once a real Razorpay order exists.
 *
 * The mirror image of `/checkout/dummy`, with the same guards in the same
 * order and the same one job: identify the order, show the user what they are
 * about to be charged, and hand off. It grants nothing — see
 * `subscriptionService`'s "one rule above all others".
 *
 * The `key` query param that `checkoutUrl` carries is deliberately ignored.
 * Query params are whatever the user last typed; the key id is read from the
 * server's own environment instead.
 */
export default async function RazorpayCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/user/subscription");
  if (isTestGateway()) redirect("/user/subscription");

  const keyId = getRazorpayKeyId();
  if (!keyId) redirect("/user/subscription");

  const { order } = await searchParams;
  if (!order) redirect("/user/subscription");

  const payment = await prisma.payment.findFirst({
    where: { externalOrderId: order, userId: user.id, status: { in: ["CREATED", "AUTHORIZED"] } },
  });
  // Already captured, already failed, or somebody else's — all three land back
  // on the subscription page, which is where the truthful answer lives.
  if (!payment) redirect("/user/subscription");

  const catalog = await getPlanCatalog();
  const planName = planNameOf(catalog, payment.planCode);

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4 py-10">
      <div className="rounded-lg border border-line bg-surface p-6 shadow-lg">
        <h1 className="text-center text-xl font-bold text-wine-700">{planName} Plan</h1>
        <p className="mt-1 text-center text-3xl font-bold text-ink">
          ₹{(payment.amountPaise / 100).toLocaleString("en-IN")}
        </p>
        {payment.discountPaise > 0 && (
          <p className="mt-1 text-center text-[0.8125rem] text-trust">
            ₹{(payment.discountPaise / 100).toLocaleString("en-IN")} partner discount shaamil hai
          </p>
        )}

        <RazorpayCheckoutPanel
          keyId={keyId}
          orderId={order}
          amountPaise={payment.amountPaise}
          planName={planName}
          prefill={{
            name: user.fullName,
            email: user.email ?? "",
            contact: user.mobile ?? "",
          }}
        />
      </div>
    </div>
  );
}
