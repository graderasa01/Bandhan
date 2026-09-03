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
 * ## Why this is not cached, despite being a near-static list
 *
 * The obvious optimisation is `export const revalidate = 300` — the registry
 * changes when a founder flips a switch, not when somebody loads a form. It
 * cannot be used here, and the reason is worth writing down because it will
 * look like an oversight to whoever reads this next.
 *
 * A route segment with `revalidate` is *prerendered at build time* to produce
 * its first cached response, so `next build` runs this query. The production
 * image builds with a deliberately fake connection string
 * (`postgresql://build:build@localhost:5432/build_placeholder`), on the stated
 * invariant that "nothing at build time ever queries it" — the real URL is
 * only ever handed to the container at runtime, so it never lands in the
 * image's layer history. Prerendering this route breaks that invariant and the
 * build dies at "Collecting page data", with the deploy failing rather than
 * shipping a stale list.
 *
 * The cache was buying very little anyway: the public apply form fetches this
 * once on mount, not per keystroke, so this is one small indexed read per page
 * load of one public page.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const cities = await prisma.pilotCity.findMany({
    where: { status: "OPEN" },
    orderBy: [{ state: "asc" }, { city: "asc" }],
    select: { city: true, state: true },
  });

  return NextResponse.json({ cities });
}
