import { NextResponse } from "next/server";
import { otpChannelStatus } from "@/lib/services/auth/contactOtpService";

export const runtime = "nodejs";

/**
 * Which one-time-code channels this deployment can actually send on. The
 * login page uses it to decide whether to offer "OTP se login" at all, and
 * the bolo page to word its last step honestly — a promise of an SMS that no
 * provider is configured to send is worse than no promise.
 */
export async function GET() {
  return NextResponse.json(otpChannelStatus(), { headers: { "cache-control": "no-store" } });
}
