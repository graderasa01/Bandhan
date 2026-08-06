import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import {
  countSubscriptions,
  removeSubscription,
  saveSubscription,
} from "@/lib/services/notice/pushService";
import { vapidConfig } from "@/lib/services/notice/webPush";

export const runtime = "nodejs";

/**
 * Registering and dropping a browser's push subscription.
 *
 * `GET` also serves the VAPID *public* key. That is safe by construction — it
 * is the key a browser must have in order to accept pushes from this server,
 * and it is useless without the private half — and serving it from an
 * authenticated endpoint rather than `NEXT_PUBLIC_…` keeps the whole push
 * config in one place in `.env` instead of split across two mechanisms.
 */

const SubscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const cfg = vapidConfig();
  return NextResponse.json({
    ok: true,
    configured: cfg !== null,
    publicKey: cfg?.publicKey ?? null,
    deviceCount: await countSubscriptions(user.id),
  });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Bad JSON" }, { status: 400 });
  }

  const parsed = SubscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "Subscription adhoori hai." }, { status: 422 });
  }

  await saveSubscription({
    userId: user.id,
    endpoint: parsed.data.endpoint,
    p256dh: parsed.data.keys.p256dh,
    auth: parsed.data.keys.auth,
    userAgent: req.headers.get("user-agent"),
  });

  return NextResponse.json({ ok: true, deviceCount: await countSubscriptions(user.id) });
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const endpoint = new URL(req.url).searchParams.get("endpoint");
  if (!endpoint) {
    return NextResponse.json({ ok: false, message: "endpoint chahiye." }, { status: 400 });
  }

  await removeSubscription(user.id, endpoint);
  return NextResponse.json({ ok: true, deviceCount: await countSubscriptions(user.id) });
}
