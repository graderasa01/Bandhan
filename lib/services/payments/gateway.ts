import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "crypto";

/**
 * The payment provider, behind one interface.
 *
 * ## Why a dummy gateway exists at all
 *
 * Razorpay keys are not available yet (Devesh, 2026-08-01) and waiting for
 * them would mean either building the whole subscription flow blind, or
 * building nothing. Neither is acceptable — the checkout path touches plan
 * resolution, entitlement changes, commission writes and the webhook's replay
 * safety, and every one of those is easier to get wrong than to test.
 *
 * So `DummyGateway` is not a stub that returns `true`. It creates a real order
 * row, redirects to a real page, and calls **the same webhook endpoint with
 * the same payload shape and the same signature scheme** as Razorpay will.
 * That means the code under test today is the code that runs in production —
 * only the class that signs the payload changes.
 *
 * ## Switching
 *
 * `RAZORPAY_KEY_ID` empty → dummy. Set → real. No code change, no redeploy
 * beyond the env var, and `isTestGateway()` lets the UI say plainly which one
 * is live rather than letting anyone confuse test money for real money.
 */

export interface GatewayOrder {
  /** The provider's order id — goes on `Payment.externalOrderId`. */
  orderId: string;
  amountPaise: number;
  currency: "INR";
  /** Where to send the user to pay. */
  checkoutUrl: string;
}

export interface GatewayWebhookEvent {
  orderId: string;
  paymentId: string;
  status: "CAPTURED" | "FAILED";
  amountPaise: number;
  failureReason?: string;
}

export interface PaymentGateway {
  readonly id: "dummy" | "razorpay";
  createOrder(params: {
    amountPaise: number;
    /** Our own Payment row id, echoed back by the provider. */
    receipt: string;
    notes?: Record<string, string>;
  }): Promise<GatewayOrder>;
  /** Verifies the webhook body actually came from the provider. */
  verifyWebhook(rawBody: string, signature: string | null): boolean;
  parseWebhook(rawBody: string): GatewayWebhookEvent | null;
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // timingSafeEqual throws on length mismatch, which would itself leak length.
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Shared by both gateways so the signature scheme under test is the real one. */
function hmacHex(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

class DummyGateway implements PaymentGateway {
  readonly id = "dummy" as const;

  /**
   * Fixed, non-secret, and only ever used when no real key is configured. It
   * still has to *exist* so the signature path is exercised rather than
   * skipped — a webhook verifier that is bypassed in testing is a webhook
   * verifier nobody has tested.
   */
  private readonly secret = "dummy-gateway-secret";

  async createOrder({ amountPaise, receipt }: { amountPaise: number; receipt: string }): Promise<GatewayOrder> {
    const orderId = `dummy_order_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    return {
      orderId,
      amountPaise,
      currency: "INR",
      checkoutUrl: `/checkout/dummy?order=${orderId}&amount=${amountPaise}&receipt=${receipt}`,
    };
  }

  verifyWebhook(rawBody: string, signature: string | null): boolean {
    if (!signature) return false;
    return safeEqual(hmacHex(this.secret, rawBody), signature);
  }

  parseWebhook(rawBody: string): GatewayWebhookEvent | null {
    try {
      const json = JSON.parse(rawBody) as Partial<GatewayWebhookEvent>;
      if (!json.orderId || !json.paymentId || !json.status) return null;
      return {
        orderId: json.orderId,
        paymentId: json.paymentId,
        status: json.status === "CAPTURED" ? "CAPTURED" : "FAILED",
        amountPaise: Number(json.amountPaise ?? 0),
        failureReason: json.failureReason,
      };
    } catch {
      return null;
    }
  }

  /** Only the dummy checkout page needs this — it signs its own callback. */
  sign(body: string): string {
    return hmacHex(this.secret, body);
  }
}

/** The subset of Razorpay's payment entity this app reads. */
interface RazorpayPaymentRecord {
  id: string;
  order_id: string | null;
  /** created → authorized → captured, or failed/refunded. Only `captured` is money we keep. */
  status: "created" | "authorized" | "captured" | "refunded" | "failed";
  amount: number;
  error_description?: string | null;
}

class RazorpayGateway implements PaymentGateway {
  readonly id = "razorpay" as const;

  constructor(
    private readonly keyId: string,
    private readonly keySecret: string,
    private readonly webhookSecret: string,
  ) {}

  async createOrder({
    amountPaise,
    receipt,
    notes,
  }: {
    amountPaise: number;
    receipt: string;
    notes?: Record<string, string>;
  }): Promise<GatewayOrder> {
    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString("base64")}`,
      },
      body: JSON.stringify({ amount: amountPaise, currency: "INR", receipt, notes }),
    });

    if (!res.ok) {
      throw new Error(`Razorpay order failed: ${res.status} ${await res.text()}`);
    }
    const order = (await res.json()) as { id: string; amount: number };

    return {
      orderId: order.id,
      amountPaise: order.amount,
      currency: "INR",
      // Razorpay Checkout is a JS modal keyed off the order id — the page at
      // this route mounts it. Same shape as the dummy so the caller is unaware.
      checkoutUrl: `/checkout/razorpay?order=${order.id}&key=${this.keyId}`,
    };
  }

  /**
   * The signature Razorpay Checkout hands the browser on success. It is an
   * HMAC of `order_id|payment_id` under the **key secret** (not the webhook
   * secret — different secret, different payload shape, easy to confuse).
   *
   * What it proves: this callback really came out of Razorpay's modal and was
   * not typed by someone poking at our API. What it does **not** prove: that
   * any money moved. A signature is issued the moment a payment id exists,
   * including for one that later fails. That is why `fetchPayment` below is
   * asked separately, and why this method alone never grants anything.
   */
  verifyCheckoutSignature(orderId: string, paymentId: string, signature: string): boolean {
    return safeEqual(hmacHex(this.keySecret, `${orderId}|${paymentId}`), signature);
  }

  /**
   * Razorpay's own record of a payment, read with our secret key.
   *
   * This is the authority on whether money actually moved — the same authority
   * the webhook carries, just pulled instead of pushed. Nothing the browser
   * says is trusted here beyond the payment id.
   */
  async fetchPayment(paymentId: string): Promise<RazorpayPaymentRecord | null> {
    const res = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString("base64")}`,
      },
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(`[payments] payment fetch failed: ${res.status} ${await res.text()}`);
      return null;
    }
    return (await res.json()) as RazorpayPaymentRecord;
  }

  verifyWebhook(rawBody: string, signature: string | null): boolean {
    if (!signature) return false;
    return safeEqual(hmacHex(this.webhookSecret, rawBody), signature);
  }

  parseWebhook(rawBody: string): GatewayWebhookEvent | null {
    try {
      const evt = JSON.parse(rawBody) as {
        event?: string;
        payload?: { payment?: { entity?: { id?: string; order_id?: string; amount?: number; error_description?: string } } };
      };
      const entity = evt.payload?.payment?.entity;
      if (!entity?.id || !entity.order_id) return null;

      return {
        orderId: entity.order_id,
        paymentId: entity.id,
        status: evt.event === "payment.captured" ? "CAPTURED" : "FAILED",
        amountPaise: Number(entity.amount ?? 0),
        failureReason: entity.error_description,
      };
    } catch {
      return null;
    }
  }
}

let cached: PaymentGateway | null = null;

export function getPaymentGateway(): PaymentGateway {
  if (cached) return cached;

  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim();

  cached =
    keyId && keySecret && webhookSecret
      ? new RazorpayGateway(keyId, keySecret, webhookSecret)
      : new DummyGateway();

  return cached;
}

/** True while no real keys are configured — surfaced in the UI, never hidden. */
export function isTestGateway(): boolean {
  return getPaymentGateway().id === "dummy";
}

/**
 * The publishable half of the Razorpay key pair.
 *
 * Safe to hand to the browser — Razorpay Checkout needs it there, and it can
 * only *start* a payment, never read or capture one. The secret stays in this
 * file. Read from the environment rather than from the checkout URL's `key`
 * query param, because a query param is whatever the user last typed.
 */
export function getRazorpayKeyId(): string | null {
  const gateway = getPaymentGateway();
  return gateway instanceof RazorpayGateway ? process.env.RAZORPAY_KEY_ID?.trim() || null : null;
}

export type CheckoutConfirmation =
  /** Razorpay confirms money moved (or definitively did not) — safe to act on. */
  | { kind: "settled"; event: GatewayWebhookEvent }
  /** Authorised but not captured yet. Nothing is granted; the webhook will finish it. */
  | { kind: "pending" }
  | { kind: "rejected"; reason: string };

/**
 * The success callback from Razorpay Checkout, verified into something as
 * trustworthy as a webhook.
 *
 * ## Why this exists next to the webhook rather than instead of it
 *
 * The webhook remains the guarantee: it arrives even if the user closes the
 * tab mid-payment, and it is what makes the flow correct rather than lucky.
 * But it is push-only, which leaves two gaps this closes:
 *
 *   1. On localhost Razorpay cannot reach us at all, so without this the
 *      developer paying real money sees nothing happen, forever.
 *   2. In production the redirect regularly beats the webhook by a few
 *      seconds, so the user lands on a page still saying "no plan".
 *
 * ## Why trusting this is not trusting the client
 *
 * Two independent checks, and the browser fails both if it lies. The
 * signature proves Razorpay's modal produced this payment id; the API call
 * then asks *Razorpay itself*, over our own authenticated connection, what
 * became of it. The browser supplies an id and nothing more — every fact used
 * to grant access comes back from Razorpay. That is the same standard as a
 * signed webhook body, so the result is handed to the very same
 * `handleGatewayEvent`, which is idempotent and will simply see "duplicate"
 * when the real webhook lands moments later.
 */
export async function confirmRazorpayCheckout(params: {
  orderId: string;
  paymentId: string;
  signature: string;
}): Promise<CheckoutConfirmation> {
  const gateway = getPaymentGateway();
  if (!(gateway instanceof RazorpayGateway)) {
    return { kind: "rejected", reason: "Razorpay gateway configured nahi hai." };
  }

  if (!gateway.verifyCheckoutSignature(params.orderId, params.paymentId, params.signature)) {
    return { kind: "rejected", reason: "Signature verify nahi hui." };
  }

  const record = await gateway.fetchPayment(params.paymentId);
  if (!record) return { kind: "rejected", reason: "Razorpay se payment details nahi mili." };

  // A valid signature for payment X says nothing about *which order* X belongs
  // to. Without this, someone could sign a genuine ₹1 payment of their own and
  // present it against a ₹2,999 order.
  if (record.order_id !== params.orderId) {
    return { kind: "rejected", reason: "Payment kisi aur order ka hai." };
  }

  if (record.status === "captured") {
    return {
      kind: "settled",
      event: {
        orderId: params.orderId,
        paymentId: record.id,
        status: "CAPTURED",
        amountPaise: record.amount,
      },
    };
  }

  if (record.status === "failed") {
    return {
      kind: "settled",
      event: {
        orderId: params.orderId,
        paymentId: record.id,
        status: "FAILED",
        amountPaise: record.amount,
        failureReason: record.error_description ?? undefined,
      },
    };
  }

  // `authorized` (auto-capture off) and `created` both mean the money is not
  // ours yet. Granting here would hand out a plan for a hold that can lapse.
  return { kind: "pending" };
}

/** The dummy checkout page signs its own callback; nothing else may. */
export function signDummyPayload(body: string): string {
  const gateway = getPaymentGateway();
  if (!(gateway instanceof DummyGateway)) {
    throw new Error("signDummyPayload called while a real gateway is configured.");
  }
  return gateway.sign(body);
}
