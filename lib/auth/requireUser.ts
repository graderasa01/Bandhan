import "server-only";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import type { User } from "@prisma/client";

/** Shared owner-only gate for `/api/profile/*` and `/api/reel/*` routes. */
export async function requireUser(): Promise<{ user: User; response: null } | { user: null; response: NextResponse }> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      user: null,
      response: NextResponse.json({ error: "UNAUTHENTICATED", message: "Pehle login karein." }, { status: 401 }),
    };
  }
  return { user, response: null };
}
