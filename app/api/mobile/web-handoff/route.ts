import { NextResponse } from "next/server";
import { z } from "zod";
import { isNativeClient } from "@/lib/auth/session";
import { mintWebHandoff } from "@/lib/services/auth/webHandoffService";
import { requireMember } from "../_shared/member";

export const runtime = "nodejs";

const Body = z.object({ path: z.string().min(1).max(512) }).strict();

/**
 * A single-use code that signs this member into the website for one checkout
 * page, so the app can open that page in the phone's browser without its
 * bearer token ever leaving the app (see `webHandoffService`). The app opens
 * the returned relative `url` against its own API origin.
 *
 * Native only, and therefore authenticated by the bearer alone: a browser
 * already holds its own cookie, and a page script must never be able to mint
 * a code with one (the native header decides which carrier `getCurrentUser`
 * reads, and the API grants no CORS for it).
 */
export async function POST(req: Request) {
  if (!(await isNativeClient())) {
    return NextResponse.json({ error: "NATIVE_ONLY", message: "Ye sirf BandhanTak app ke liye hai." }, { status: 403 });
  }

  const { user, response } = await requireMember();
  if (!user) return response;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Request JSON padha nahi ja saka." }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_FAILED", message: "Kaunsa page kholna hai, ye nahi mila." }, { status: 422 });
  }

  const minted = await mintWebHandoff(user.id, parsed.data.path);
  if (!minted.ok) {
    return NextResponse.json({ error: "HANDOFF_REFUSED", message: minted.message }, { status: minted.status });
  }
  return NextResponse.json({ ok: true, url: minted.url, expiresAt: minted.expiresAt.toISOString() });
}
