import "server-only";
import { NextResponse } from "next/server";
import { getCurrentFamilyMember } from "@/lib/auth/familySession";
import type { FamilyMember } from "@prisma/client";

/** The `requireUser`/`requireAdmin` pattern, for the family cookie world instead of the user one. */
export async function requireFamilyMember(): Promise<
  { member: FamilyMember; response: null } | { member: null; response: NextResponse }
> {
  const member = await getCurrentFamilyMember();
  if (!member) {
    return {
      member: null,
      response: NextResponse.json({ error: "UNAUTHENTICATED", message: "Ye invite link se dobara join karein." }, { status: 401 }),
    };
  }
  return { member, response: null };
}
