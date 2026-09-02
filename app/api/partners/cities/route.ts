import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

/**
 * The cities BandhanTak is open in.
 *
 * Public, and deliberately only the open ones. A `WAITLIST` row is a plan —
 * "we mean to be in Indore by November" — and a plan published on an
 * unauthenticated endpoint is a plan a competitor reads and a partner in Indore
 * treats as a promise. An applicant needs one fact: whether we are there today.
 *
 * Cached briefly rather than per-request: the registry changes when a founder
 * flips a switch, not when somebody loads a form, and this is called on every
 * keystroke-settled city field on the public apply page.
 */
export const revalidate = 300;

export async function GET() {
  const cities = await prisma.pilotCity.findMany({
    where: { status: "OPEN" },
    orderBy: [{ state: "asc" }, { city: "asc" }],
    select: { city: true, state: true },
  });

  return NextResponse.json({ cities });
}
