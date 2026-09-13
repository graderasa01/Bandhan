import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth/session";
import {
  GOOGLE_CALLBACK_PATH,
  MARKETING_OAUTH_STATE_COOKIE,
  exchangeConnectCode,
  marketingOAuthOrigin,
  verifyConnectState,
} from "@/lib/marketing/connectors/googleOAuth";
import { storeGoogleGrant, testConnection } from "@/lib/services/marketing/connectionService";
import { describeConnectorError } from "@/lib/marketing/connectors/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Where Google sends the admin back. Every outcome is a redirect to the
 * Growth Saathi screen with `?connect=<result>` — this is a top-level
 * navigation, so a JSON error body would strand the admin on raw text.
 *
 * The state cookie is verified in constant time before the code is
 * exchanged; the provider the grant belongs to comes from that verified
 * state, never from a query parameter an attacker could set.
 */
export async function GET(req: Request) {
  const origin = marketingOAuthOrigin(req);
  const back = (result: string, provider?: string) =>
    `${origin}/admin/marketing-ai?connect=${result}${provider ? `&provider=${provider}` : ""}`;

  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") return NextResponse.redirect(`${origin}/admin/login?next=/admin/marketing-ai`);

  const url = new URL(req.url);
  const jar = await cookies();
  const clear = (res: NextResponse) => {
    res.cookies.delete(MARKETING_OAUTH_STATE_COOKIE);
    return res;
  };

  if (url.searchParams.get("error")) return clear(NextResponse.redirect(back("cancelled")));

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return clear(NextResponse.redirect(back("failed")));

  const { ok, provider } = verifyConnectState(state, jar.get(MARKETING_OAUTH_STATE_COOKIE)?.value ?? "");
  if (!ok || !provider) return clear(NextResponse.redirect(back("state")));

  let grant;
  try {
    grant = await exchangeConnectCode({ code, redirectUri: `${origin}${GOOGLE_CALLBACK_PATH}` });
  } catch (err) {
    console.error("[marketing:google-oauth] exchange failed:", describeConnectorError(err).message);
    return clear(NextResponse.redirect(back("failed", provider)));
  }

  const stored = await storeGoogleGrant({ provider, grant, actorId: user.id, actorRole: user.role });
  if (!stored.ok) return clear(NextResponse.redirect(back("store_failed", provider)));

  // A test right away turns "granted" into "connected" (or says what is
  // still missing — usually the account id) before the admin looks.
  await testConnection(provider).catch(() => null);

  return clear(NextResponse.redirect(back("ok", provider)));
}
