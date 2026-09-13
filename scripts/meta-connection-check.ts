import "./_env";
import { refusedWrites } from "./_stubs/metaReadOnlyNetwork";
import { createMetaAdsWriteProvider } from "../lib/marketing/connectors/metaAdsWrite";
import { normaliseAdAccountId } from "../lib/marketing/connectors/metaAds";
import { META_API_VERSION } from "../lib/marketing/connectors/metaGraph";
import type { MetaAdsReadinessReader } from "../lib/marketing/providers/metaAdsProvider";
import { evaluateMetaAdReadiness } from "../lib/services/marketing/metaReadinessEvaluator";

/**
 * Meta ad-creation readiness from the terminal (doc 14 §9, §28) — the same
 * rules as the admin's "Check ad creation readiness" button
 * (`evaluateMetaAdReadiness`), run against the credentials in `.env.local`
 * instead of the connection rows, with nothing stored anywhere.
 *
 * Run: `npx tsx scripts/meta-connection-check.ts`
 *
 * Read-only by construction, twice over:
 *   • the reader handed to the evaluator is the five readiness reads and
 *     nothing else — no write method is reachable from this file;
 *   • `_stubs/metaReadOnlyNetwork` refuses every non-GET request before it
 *     leaves the process.
 *
 * The access token is never printed: every output line passes through
 * `redact()`, which removes the token's exact value wherever it appears.
 *
 * Exit codes: 0 — every required check READY · 2 — reachable but blocked
 * (a readiness answer, not a crash) · 1 — not configured, or the check itself
 * crashed.
 */

const token = (process.env.META_MARKETING_ACCESS_TOKEN ?? "").trim();

function redact(text: string): string {
  return token.length >= 8 ? text.split(token).join("[redacted-token]") : text;
}

function say(text = ""): void {
  console.log(redact(text));
}

const STATE_MARK = { READY: "READY     ", MISSING: "MISSING   ", UNVERIFIED: "UNVERIFIED", NOT_NEEDED: "NOT_NEEDED" } as const;

/** Same rule as the app's env fallback (`connectionService.envAccountRef`): digits only, or it is not used. */
function digitsOrNull(name: string): { value: string | null; note: string } {
  const raw = (process.env[name] ?? "").trim();
  if (!raw) return { value: null, note: `not set — ${name}` };
  if (!/^\d+$/.test(raw)) return { value: null, note: `INVALID — ${name} sirf digits hona chahiye (ignored)` };
  return { value: raw, note: raw };
}

async function main(): Promise<number> {
  const accountRaw = (process.env.META_AD_ACCOUNT_ID ?? "").trim();
  const accountRef = accountRaw ? normaliseAdAccountId(accountRaw) : "";
  const page = digitsOrNull("META_FACEBOOK_PAGE_ID");
  const instagram = digitsOrNull("META_INSTAGRAM_USER_ID");
  const apiVersion = META_API_VERSION();

  say("\nMeta ad-creation readiness — read-only, nothing stored");
  say(`  Graph API        ${apiVersion}`);
  say(`  Access token     ${token ? "set (value never printed)" : "MISSING — META_MARKETING_ACCESS_TOKEN"}`);
  say(`  Ad account       ${/^act_\d+$/.test(accountRef) ? accountRef : "MISSING/INVALID — META_AD_ACCOUNT_ID"}`);
  say(`  Facebook Page    ${page.note}`);
  say(`  Instagram actor  ${instagram.value ? instagram.value : `${instagram.note} (sirf Facebook Feed chalega)`}`);
  if (!token || !/^act_\d+$/.test(accountRef)) {
    say("\n  Token aur valid ad account ID dono chahiye — check nahi chala.");
    return 1;
  }

  const full = createMetaAdsWriteProvider({ accessToken: token }, accountRef);
  // Only the five reads leave this block — the evaluator cannot reach a write through this object.
  const reader: MetaAdsReadinessReader = {
    describeAccount: () => full.describeAccount(),
    inspectTokenCapabilities: () => full.inspectTokenCapabilities(),
    listPromotablePages: () => full.listPromotablePages(),
    describePage: (pageId) => full.describePage(pageId),
    listInstagramActors: (pageId) => full.listInstagramActors(pageId),
  };

  const ev = await evaluateMetaAdReadiness({ reader, accountRef, pageId: page.value, instagramId: instagram.value, apiVersion, now: new Date() });
  const report = ev.report;

  say("");
  for (const c of report.checks) {
    say(`  ${STATE_MARK[c.state]}  ${c.label}${c.detail ? ` — ${c.detail}` : ""}`);
    if (c.state !== "READY" && c.fix) say(`              fix: ${c.fix}${c.reconnect ? " [token dobara banana/paste karna hoga]" : ""}`);
  }
  say("");
  if (ev.granted.length) say(`  Granted scopes   ${ev.granted.join(", ")}`);
  if (ev.declined.length) say(`  Declined/expired ${ev.declined.join(", ")}`);
  if (page.value) say(`  Page-linked IG   ${ev.linkedInstagram.length ? ev.linkedInstagram.map((a) => `${a.id}${a.username ? ` (@${a.username})` : ""}`).join(", ") : "none returned"}`);
  if (report.account) say(`  Account facts    ${report.account.name ?? report.account.id} · ${report.account.currency ?? "?"} · ${report.account.timeZone ?? "?"} · account_status ${report.account.accountStatus ?? "?"}`);
  say(`\n  Verdict          ${report.ok ? "READY" : `BLOCKED (${report.errorCode ?? "?"})`} — ${report.message}`);
  say(`  Writes refused   ${refusedWrites.length} (read-only guard)`);
  return report.ok ? 0 : 2;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(redact(`\nmeta-connection-check crashed: ${err instanceof Error ? err.message : String(err)}`));
    process.exit(1);
  });
