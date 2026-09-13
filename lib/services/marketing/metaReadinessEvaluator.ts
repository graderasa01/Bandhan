import type { MetaReadinessCheck, MetaReadinessReport } from "@/lib/contracts/marketingAi";
import type { MetaAdsReadinessReader, MetaPageFacts } from "@/lib/marketing/providers/metaAdsProvider";
import { META_AD_ACCOUNT_ASSET_FIX, metaGraphErrorOf, normaliseMetaError } from "./execution/executionErrors";

/**
 * "Can this token create ads on this account, as this Page and this
 * Instagram account?" — the read-only answer (doc 14 §9), with no database
 * and no write in reach: the reader it is given is typed to the five reads a
 * readiness check needs.
 *
 * Two callers, one set of rules:
 *   • `connectionService.checkMetaAdReadiness` — the admin's "Check ad
 *     creation readiness" button; it persists the verdict as derived
 *     settings the no-network readiness reads later.
 *   • `scripts/meta-connection-check.ts` — the owner's terminal check against
 *     `.env.local`; it prints the verdict and stores nothing.
 *
 * Every prerequisite is its own line with its own state, so "the token
 * works" is never read as "ads can be created". `UNVERIFIED` is an honest
 * answer and does not block: the Marketing API access tier is app-level and
 * not readable, and a system user's Page role may not be listed even when
 * the Page is readable.
 */

export const META_ACCOUNT_STATUS_NAME: Record<number, string> = {
  1: "ACTIVE",
  2: "DISABLED",
  3: "UNSETTLED",
  7: "PENDING_RISK_REVIEW",
  8: "PENDING_SETTLEMENT",
  9: "IN_GRACE_PERIOD",
  100: "PENDING_CLOSURE",
  101: "CLOSED",
  201: "ANY_ACTIVE",
  202: "ANY_CLOSED",
};

export const META_WRITE_PERMISSION = "ads_management";
export const META_READ_PERMISSION = "ads_read";
export const META_PAGE_ADVERTISE_TASK = "ADVERTISE";
export const META_ACCOUNT_WRITE_TASKS = ["ADVERTISE", "MANAGE"];
/** Read scopes the Page/Instagram connections use — shown, not required for ad creation. */
export const META_IDENTITY_READ_PERMISSIONS = ["pages_show_list", "pages_read_engagement", "instagram_basic", "instagram_manage_insights"];

export interface MetaReadinessEvaluation {
  report: MetaReadinessReport;
  granted: string[];
  declined: string[];
  identityName: string | null;
  /** The token read itself failed — the raw error, so the caller can classify it as a connection fault. Null when the token answered. */
  tokenError: unknown | null;
  /** The Page is readable, but its ADVERTISE task could not be seen (not in the token's Page list). */
  pageRoleUnverified: boolean;
  /** Instagram accounts linked to the configured Page — a hint when the configured id is empty or wrong. */
  linkedInstagram: { id: string; username: string | null }[];
}

function line(key: MetaReadinessCheck["key"], label: string, state: MetaReadinessCheck["state"], detail: string | null = null, fix: string | null = null, reconnect = false): MetaReadinessCheck {
  return { key, label, state, detail, fix, reconnect };
}

export async function evaluateMetaAdReadiness(params: {
  reader: MetaAdsReadinessReader;
  accountRef: string;
  pageId: string | null;
  instagramId: string | null;
  apiVersion: string;
  now: Date;
}): Promise<MetaReadinessEvaluation> {
  const { reader, pageId, instagramId } = params;
  const checks: MetaReadinessCheck[] = [];
  let firstBlock: { code: string; message: string } | null = null;
  const block = (code: string, message: string) => {
    if (!firstBlock) firstBlock = { code, message };
  };
  const report = (ok: boolean, errorCode: string | null, message: string, extra: Partial<MetaReadinessReport> = {}): MetaReadinessReport => ({
    checkedAt: params.now.toISOString(),
    apiVersion: params.apiVersion,
    ok,
    checks,
    account: null,
    page: null,
    instagram: null,
    errorCode,
    message,
    ...extra,
  });
  const evaluation: MetaReadinessEvaluation = { report: report(false, null, ""), granted: [], declined: [], identityName: null, tokenError: null, pageRoleUnverified: false, linkedInstagram: [] };

  // ---- 1. token + permissions ---------------------------------------------
  let granted = new Set<string>();
  try {
    const caps = await reader.inspectTokenCapabilities();
    granted = new Set(caps.granted);
    evaluation.granted = [...granted].sort();
    evaluation.declined = caps.declined;
    evaluation.identityName = caps.identity.name;
    checks.push(line("TOKEN", "Access token", "READY", `Token valid — ${caps.identity.name ?? caps.identity.id}`));
    const hasRead = granted.has(META_READ_PERMISSION);
    checks.push(line("READ_PERMISSION", `Read permission (${META_READ_PERMISSION})`, hasRead ? "READY" : "MISSING", hasRead ? null : `Granted: ${evaluation.granted.join(", ") || "none"}`, hasRead ? null : "System user token ko ads_read ke saath dobara generate karein.", !hasRead));
    if (!hasRead) block("PERMISSION_MISSING", "Token par ads_read nahi hai.");
    const hasWrite = granted.has(META_WRITE_PERMISSION);
    checks.push(
      line(
        "WRITE_PERMISSION",
        `Write permission (${META_WRITE_PERMISSION})`,
        hasWrite ? "READY" : "MISSING",
        hasWrite ? "Campaign/ad set/creative/ad create allowed (approval ke baad hi)." : `Granted: ${evaluation.granted.join(", ") || "none"}${caps.declined.length ? ` · declined/expired: ${caps.declined.join(", ")}` : ""}`,
        hasWrite ? null : "Business Manager → System users → token dobara generate karein, ads_management tick karke; phir yahan paste karein.",
        !hasWrite,
      ),
    );
    if (!hasWrite) block("META_ADS_MANAGEMENT_MISSING", "Token par ads_management permission nahi hai — paused create bhi nahi ho sakta.");
  } catch (err) {
    const e = normaliseMetaError(err, "read");
    checks.push(line("TOKEN", "Access token", "MISSING", e.message, e.fix, e.reconnect));
    evaluation.tokenError = err;
    evaluation.report = report(false, e.code, e.message);
    return evaluation;
  }

  // ---- 2. access tier — app-level, not readable --------------------------
  checks.push(
    line(
      "ACCESS_TIER",
      "Marketing API access tier",
      "UNVERIFIED",
      "App-level (Limited/Full); Graph API se nahi padha jaata. Token permission se alag cheez hai.",
      "App Dashboard → Marketing API → Access tier dekhein. Tier block hua to pehli write META_ACCESS_TIER_BLOCKED dikhayegi — koi spend nahi hota.",
    ),
  );

  // ---- 3. ad account -------------------------------------------------------
  let account: MetaReadinessReport["account"] = null;
  try {
    const acc = await reader.describeAccount();
    account = { id: acc.id, name: acc.name, currency: acc.currency, timeZone: acc.timeZone, accountStatus: acc.accountStatus, disableReason: acc.disableReason };
    if (acc.tasks === null) {
      checks.push(line("AD_ACCOUNT", "Ad account role", "UNVERIFIED", `${acc.name ?? acc.id} read ho raha hai; token ka role (user_tasks) API ne nahi diya.`, "Business Manager me system user ko is ad account par 'Manage campaigns' access confirm karein."));
    } else if (acc.tasks.some((t) => META_ACCOUNT_WRITE_TASKS.includes(t))) {
      checks.push(line("AD_ACCOUNT", "Ad account role", "READY", `${acc.name ?? acc.id} · tasks ${acc.tasks.join(", ")}`));
    } else {
      checks.push(line("AD_ACCOUNT", "Ad account role", "MISSING", `${acc.name ?? acc.id} dikhta hai par tasks ${acc.tasks.join(", ") || "none"} — ADVERTISE/MANAGE nahi.`, "Business Manager → Ad accounts → is system user ko 'Manage campaigns' access dein."));
      block("META_AD_ACCOUNT_FORBIDDEN", "Token ke paas is ad account par advertise/manage access nahi hai.");
    }
    const statusName = acc.accountStatus === null ? null : (META_ACCOUNT_STATUS_NAME[acc.accountStatus] ?? String(acc.accountStatus));
    if (acc.accountStatus === 1) checks.push(line("ACCOUNT_STATUS", "Account status", "READY", "ACTIVE"));
    else if (acc.accountStatus === null) checks.push(line("ACCOUNT_STATUS", "Account status", "UNVERIFIED", "account_status nahi mila.", "Ads Manager me account status dekhein."));
    else {
      checks.push(line("ACCOUNT_STATUS", "Account status", "MISSING", `${statusName}${acc.disableReason !== null ? ` (disable reason ${acc.disableReason})` : ""}`, "Ads Manager → account settings/billing me account ko ACTIVE karein; phir 'Check ad creation readiness'."));
      block("META_AD_ACCOUNT_DISABLED", `Ad account ${statusName} hai — creation block.`);
    }
    const currency = (acc.currency ?? "").toUpperCase();
    if (currency === "INR") checks.push(line("CURRENCY", "Currency", "READY", "INR"));
    else {
      checks.push(line("CURRENCY", "Currency", "MISSING", `${currency || "unknown"} — package INR me hai, silent conversion nahi hoti.`, "INR wala ad account connect karein."));
      block("META_ACCOUNT_CURRENCY_MISMATCH", `Ad account currency ${currency || "?"} hai, INR nahi.`);
    }
    if (acc.timeZone) checks.push(line("TIMEZONE", "Timezone", "READY", acc.timeZone));
    else {
      checks.push(line("TIMEZONE", "Timezone", "MISSING", "timezone_name nahi mila.", "Ads Manager me account timezone set karein."));
      block("ACCOUNT_NOT_READY", "Ad account timezone nahi mila.");
    }
  } catch (err) {
    const e = normaliseMetaError(err, "read");
    const g = metaGraphErrorOf(err);
    const metaSaid = g ? ` Meta (#${g.code ?? "?"}${g.subcode !== null ? `/${g.subcode}` : ""}): ${g.message}${g.fbtraceId ? ` · fbtrace ${g.fbtraceId}` : ""}` : "";
    // Step 1 already answered the token-scope question from `/me/permissions`.
    // A permission-shaped refusal on the account read while that scope is
    // granted is the ad account's asset assignment — the report must never
    // say "token par ads_management nahi hai" beside a READY write-permission
    // line (doc 14 §28).
    const scopes = [META_READ_PERMISSION, META_WRITE_PERMISSION].filter((p) => granted.has(p));
    const permissionShaped = e.code === "META_ADS_MANAGEMENT_MISSING" || e.code === "META_AD_ACCOUNT_FORBIDDEN";
    if (scopes.length && permissionShaped) {
      const message = `Token ke scopes (${scopes.join(" + ")}) granted hain, par ad account ${params.accountRef} par is token ke system user/app ko account-level access nahi mila — ye asset assignment hai, token scope nahi.`;
      checks.push(line("AD_ACCOUNT", "Ad account access (asset assignment)", "MISSING", `${message}${metaSaid}`.slice(0, 480), META_AD_ACCOUNT_ASSET_FIX, false));
      block("META_AD_ACCOUNT_FORBIDDEN", message);
    } else {
      checks.push(line("AD_ACCOUNT", "Ad account", "MISSING", `${e.message}${metaSaid && !e.message.includes("fbtrace") ? metaSaid : ""}`.slice(0, 480), e.fix, e.reconnect));
      block(e.code, e.message);
    }
    // Nothing about the account was read — name each fact as unverified instead of leaving its line out.
    for (const [key, label] of [
      ["ACCOUNT_STATUS", "Account status"],
      ["CURRENCY", "Currency"],
      ["TIMEZONE", "Timezone"],
    ] as const) {
      checks.push(line(key, label, "UNVERIFIED", "Ad account read nahi hua — ye fact verify nahi hua. Account access theek hone ke baad dobara check karein; tab tak koi campaign create nahi hoga."));
    }
  }

  // ---- 4. Page ------------------------------------------------------------
  let page: MetaPageFacts | null = null;
  if (!pageId) {
    checks.push(line("PAGE", "Facebook Page", "MISSING", "Page ID set nahi hai — promoted post ke liye chahiye.", "Connections → Facebook Page → Page ID daalein (ya META_FACEBOOK_PAGE_ID)."));
    block("META_PAGE_NOT_ASSIGNED", "Facebook Page assign nahi hai.");
  } else {
    let listed: Awaited<ReturnType<MetaAdsReadinessReader["listPromotablePages"]>> | null = null;
    let listError: string | null = null;
    try {
      listed = await reader.listPromotablePages();
    } catch (err) {
      listError = normaliseMetaError(err, "read").message;
    }
    const hit = listed?.find((p) => p.id === pageId) ?? null;
    if (hit && hit.tasks && !hit.tasks.includes(META_PAGE_ADVERTISE_TASK)) {
      checks.push(line("PAGE", "Facebook Page", "MISSING", `Page "${hit.name ?? hit.id}" par tasks ${hit.tasks.join(", ") || "none"} — ADVERTISE nahi.`, "Business Manager → Pages → system user ko 'Create ads' task dein."));
      block("META_PAGE_NOT_ASSIGNED", `Page ${hit.id} par advertise task nahi hai.`);
    } else if (hit) {
      page = { id: hit.id, name: hit.name };
      checks.push(line("PAGE", "Facebook Page", hit.tasks ? "READY" : "UNVERIFIED", `"${hit.name ?? hit.id}"${hit.tasks ? ` · tasks ${hit.tasks.join(", ")}` : " · task list nahi mili"}`));
      evaluation.pageRoleUnverified = !hit.tasks;
    } else {
      // Not in the token's Page list (system users often are not) — is it readable at all?
      let direct: MetaPageFacts | null = null;
      let directError: string | null = null;
      try {
        direct = await reader.describePage(pageId);
      } catch (err) {
        directError = normaliseMetaError(err, "read").message;
      }
      if (direct) {
        page = direct;
        evaluation.pageRoleUnverified = true;
        checks.push(
          line(
            "PAGE",
            "Facebook Page",
            "UNVERIFIED",
            `"${direct.name ?? direct.id}" token ko dikhta hai, par token ki Page list (me/accounts) me nahi — ADVERTISE task verify nahi hua${listError ? ` (${listError})` : ""}.`,
            "Business Manager → Pages → system user ko Page par 'Create ads' dein. Pehli creative write bhi bataayegi — usse koi spend nahi hota.",
          ),
        );
      } else {
        checks.push(line("PAGE", "Facebook Page", "MISSING", `Page ${pageId} token ko nahi dikhta${directError ? ` (${directError})` : listError ? ` (${listError})` : ""}.`, "Business Manager → Pages → is system user ko Page par 'Create ads' (ADVERTISE) access dein; Page ID dobara check karein."));
        block("META_PAGE_NOT_ASSIGNED", `Page ${pageId} is token ko assigned/visible nahi hai.`);
      }
    }
  }

  // ---- 5. Instagram (needed only for Instagram placements) ------------------
  let instagram: MetaReadinessReport["instagram"] = null;
  if (page) {
    try {
      const actors = await reader.listInstagramActors(page.id);
      evaluation.linkedInstagram = actors.map((a) => ({ id: a.id, username: a.username }));
      if (!instagramId) {
        checks.push(
          line(
            "INSTAGRAM",
            "Instagram professional account",
            "NOT_NEEDED",
            `Set nahi hai — Instagram Feed placement wala package BLOCKED_CONFIG rahega; sirf Facebook Feed chalega.${actors.length ? ` Page se linked: ${actors.map((a) => `${a.id}${a.username ? ` (@${a.username})` : ""}`).join(", ")}.` : ""}`,
            "Connections → Instagram Professional → user ID (Page se linked account), ya META_INSTAGRAM_USER_ID.",
          ),
        );
      } else {
        const hit = actors.find((a) => a.id === instagramId);
        if (hit) {
          instagram = { id: hit.id, username: hit.username };
          checks.push(line("INSTAGRAM", "Instagram professional account", "READY", `@${hit.username ?? hit.id} · Page ${page.id} se linked`));
        } else {
          checks.push(line("INSTAGRAM", "Instagram professional account", "MISSING", `IG ${instagramId} Page ${page.id} se linked nahi hai (linked: ${actors.map((a) => a.id).join(", ") || "none"}).`, "Page settings → Linked accounts → Instagram connect karein, ya sahi IG user ID daalein."));
          block("META_INSTAGRAM_NOT_ASSIGNED", `Instagram account ${instagramId} Page se linked nahi hai.`);
        }
      }
    } catch (err) {
      const e = normaliseMetaError(err, "read");
      if (instagramId) {
        checks.push(line("INSTAGRAM", "Instagram professional account", "MISSING", e.message, e.fix, e.reconnect));
        block("META_INSTAGRAM_NOT_ASSIGNED", e.message);
      } else {
        checks.push(line("INSTAGRAM", "Instagram professional account", "NOT_NEEDED", `Set nahi hai; linked accounts padhe nahi gaye (${e.message}).`, "Connections → Instagram Professional → user ID, ya META_INSTAGRAM_USER_ID."));
      }
    }
  } else if (instagramId) {
    checks.push(line("INSTAGRAM", "Instagram professional account", "UNVERIFIED", "Page ready nahi — IG link check nahi ho saka."));
  } else {
    checks.push(line("INSTAGRAM", "Instagram professional account", "NOT_NEEDED", "Set nahi hai — sirf Facebook Feed chalega.", "Connections → Instagram Professional → user ID, ya META_INSTAGRAM_USER_ID."));
  }

  const first = firstBlock as { code: string; message: string } | null;
  const ok = first === null;
  evaluation.report = report(ok, first?.code ?? null, ok ? "Meta ad creation readiness: sab required checks READY (access tier app-level — unverified)." : (first?.message ?? "Readiness block."), { account, page, instagram });
  return evaluation;
}
