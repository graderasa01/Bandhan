import "server-only";
import { NextResponse } from "next/server";

/**
 * Standard "couldn't parse request JSON" 400 — was copy-pasted verbatim
 * across ~20 `app/api/**` routes. Message and shape kept byte-identical to
 * what every route already returned.
 */
export function badJsonResponse() {
  return NextResponse.json({ error: "BAD_REQUEST", message: "Request JSON padha nahi ja saka." }, { status: 400 });
}

/**
 * Parses `req.json()`, returning the shared `badJsonResponse()` on failure
 * instead of throwing. Drop-in replacement for the repeated
 * `let body; try { body = await req.json() } catch { return NextResponse.json(...) }`
 * block — callers still run their own zod `safeParse` on `body`.
 */
export async function parseJsonBody(req: Request): Promise<{ ok: true; body: unknown } | { ok: false; response: NextResponse }> {
  try {
    return { ok: true, body: await req.json() };
  } catch {
    return { ok: false, response: badJsonResponse() };
  }
}
