import fs from "node:fs";
import path from "node:path";
import { PARTNER_NAV_GROUPS, activePartnerGroup, groupItems } from "../components/layout/partnerNavItems";
import { ROUTE_ACCESS_MATRIX } from "../lib/contracts/auth";

/**
 * The partner app is four spaces, and no page is left without a way in
 * (D-90 Partner Journey).
 *
 * Run: `npx tsx scripts/partner-journey-check.ts`
 *
 * No database. It walks app/partner for the pages that really exist and checks
 * them against `partnerNavItems.ts` and `ROUTE_ACCESS_MATRIX`:
 *
 *  - the rail is exactly Today · Families · Work · Earnings, with More off it;
 *  - every static partner page is in the nav (register and pending are the
 *    pre-approval screens, outside the shell), and every nav href is a page;
 *  - every dynamic page resolves to a space, so its rail slot lights up;
 *  - every nav href has a partner row in the route matrix — a page missing
 *    from the matrix silently loses its role check;
 *  - /partner/families is gated like the pages it reads from.
 */

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) console.log(`  ok   ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.name === "page.tsx" ? [full] : [];
  });
}

const appDir = path.join(process.cwd(), "app");
const pages = walk(path.join(appDir, "partner")).map(
  (file) => "/" + path.relative(appDir, path.dirname(file)).split(path.sep).join("/"),
);
const PRE_APPROVAL = new Set(["/partner/register", "/partner/pending"]);
const staticPages = pages.filter((p) => !p.includes("[") && !PRE_APPROVAL.has(p));
const dynamicPages = pages.filter((p) => p.includes("["));
const navHrefs = PARTNER_NAV_GROUPS.flatMap((g) => groupItems(g).map((i) => i.href));

console.log(`\n${pages.length} partner pages found, ${navHrefs.length} nav rows\n`);

console.log("Spaces");
check(
  "rail is Today · Families · Work · Earnings",
  JSON.stringify(PARTNER_NAV_GROUPS.filter((g) => g.rail).map((g) => g.id)) ===
    JSON.stringify(["today", "families", "work", "earnings"]),
);
check("More exists and is off the rail", PARTNER_NAV_GROUPS.some((g) => g.id === "more" && !g.rail));
check("no href is listed twice", new Set(navHrefs).size === navHrefs.length);

console.log("\nEvery page has a way in");
for (const page of staticPages) check(`${page} is in the nav`, navHrefs.includes(page));
for (const href of navHrefs) check(`${href} is a real page`, pages.includes(href));
for (const page of dynamicPages) {
  const sample = page.replace(/\[[^\]]+\]/g, "x");
  const group = activePartnerGroup(sample);
  check(`${page} lights up a space`, group !== null && group.id !== "more", group?.id ?? "none");
}

console.log("\nRoute matrix");
function matrixRow(route: string) {
  return ROUTE_ACCESS_MATRIX.filter((r) => route === r.route || route.startsWith(`${r.route}/`)).sort(
    (a, b) => b.route.length - a.route.length,
  )[0];
}
for (const href of navHrefs) {
  const row = matrixRow(href);
  check(`${href} has a partner row`, row?.category === "partner", row?.route ?? "no row");
}
const families = ROUTE_ACCESS_MATRIX.find((r) => r.route === "/partner/families");
check(
  "/partner/families allows APPROVED and ACTIVE only",
  JSON.stringify([...(families?.allowedPartnerStatuses ?? [])].sort()) === JSON.stringify(["ACTIVE", "APPROVED"]),
  JSON.stringify(families?.allowedPartnerStatuses),
);

console.log(failures === 0 ? "\nPASS\n" : `\n${failures} check(s) failed.\n`);
process.exitCode = failures === 0 ? 0 : 1;
