import "server-only";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import type { User } from "@prisma/client";

/**
 * ADMIN only — SUPPORT is deliberately excluded. Partner approval is an
 * admin-only action per M10 ("Ye action sirf admin kar sakta hai."), and no
 * automatic or AI-driven approval path may exist (D-32).
 */
export async function requireAdmin(): Promise<
  { user: User; response: null } | { user: null; response: NextResponse }
> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      user: null,
      response: NextResponse.json({ error: "UNAUTHENTICATED", message: "Pehle login karein." }, { status: 401 }),
    };
  }
  if (user.role !== "ADMIN") {
    return {
      user: null,
      response: NextResponse.json(
        { error: "FORBIDDEN", message: "Ye action sirf admin kar sakta hai." },
        { status: 403 },
      ),
    };
  }
  return { user, response: null };
}
