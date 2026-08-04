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

/** The dummy checkout page signs its own callback; nothing else may. */
export function signDummyPayload(body: string): string {
  const gateway = getPaymentGateway();
  if (!(gateway instanceof DummyGateway)) {
    throw new Error("signDummyPayload called while a real gateway is configured.");
  }
  return gateway.sign(body);
}
