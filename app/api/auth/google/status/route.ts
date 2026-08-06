import { NextResponse } from "next/server";
import { isGoogleConfigured } from "@/lib/auth/google";

export const runtime = "nodejs";

/**
 * Whether this deployment can do Google Sign-In, so the login and register
 * pages can hide the button instead of showing one that always errors.
 *
 * Public and unauthenticated — it has to be, since it is read by people who
 * are not logged in yet — and it says nothing beyond a boolean. The client id
 * itself is public information, but there is no reason to hand it out here
 * when the `/start` route already puts it in the redirect.
 */
export async function GET() {
  return NextResponse.json({ configured: isGoogleConfigured() });
}
