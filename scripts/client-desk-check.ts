import "./_env";
import { existsSync, readFileSync } from "node:fs";
import { prisma } from "../lib/db/prisma";
import { grantDelegation, revokeDelegation, updateDelegationScope } from "../lib/services/managedProfile/delegationService";
import { getConsentHistory } from "../lib/services/managedProfile/consentLog";
import { GRANTABLE_PERMISSIONS, CLAIM_TIME_PERMISSIONS } from "../lib/services/managedProfile/managedProfilePolicy";
import { listClientsForPartner, openClientDesk, addClientNote, listClientNotes } from "../lib/services/clientDesk/clientDeskService";
import { searchForClient } from "../lib/services/clientDesk/clientSearchService";
import {
  decideProposal,
  listProposalsForOwner,
  proposeCandidate,
  withdrawProposal,
} from "../lib/services/clientDesk/proposalService";
import { DESK_SEARCH_DAILY_LIMIT, MAX_PENDING_PROPOSALS } from "../lib/services/clientDesk/clientDeskPolicy";
import { saveDraft } from "../lib/services/profile/draftService";
import { submitProfile } from "../lib/services/profile/submitService";
import type { User } from "@prisma/client";

/**
 * Partner Client Desk + candidate proposals — Phase 3.
 *
 * The whole phase is about a boundary, so most of these checks are negative:
 * what a partner *cannot* reach, *cannot* send, and *cannot* keep doing after
 * a revocation.
 *
 * No gateway, no AI, no OTP provider. The one interesting fixture is a real
 * candidate pool — three complete, visible profiles — because the central
 * claim ("the partner's reach is exactly the client's reach") is only
 * meaningful if there is something for both to reach.
 *
 * Run: `npx tsx scripts/client-desk-check.ts`
 */

let failures = 0;
function check(name: string, condition: boolean, detail = "") {
  if (condition) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const stamp = Date.now();
const userIds: string[] = [];
const CITY = "DeskpurTest";

async function makeUser(name: string, role: "USER" | "PARTNER" = "USER"): Promise<User> {
  const user = await prisma.user.create({
    data: {
      fullName: `${name} Deskkumar`,
      email: `desk-${name}-${stamp}@local.test`,
      passwordHash: "x",
      role,
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
    },
  });
  userIds.push(user.id);
  return user;
}

async function makePartner(user: User) {
  return prisma.partner.create({
    data: {
      userId: user.id,
      fullName: `${user.fullName} Bureau`,
      mobileNumber: `9200${Math.floor(Math.random() * 900000 + 100000)}`,
      email: user.email,
      mobileVerifiedAt: new Date(),
      emailVerifiedAt: new Date(),
      city: CITY,
      state: "Rajasthan",
      partnerType: "MARRIAGE_BUREAU",
      status: "ACTIVE",
    },
  });
}

/** A complete, live profile — the only kind discovery will ever return. */
async function makeLiveMember(name: string, gender: "Ladka" | "Ladki", age: number) {
  const user = await makeUser(name);
  const dob = new Date();
  dob.setFullYear(dob.getFullYear() - age);
  await saveDraft(user.id, {
    fullName: `${name} Deskkumar`,
    gender,
    dateOfBirth: `${String(dob.getDate()).padStart(2, "0")}/${String(dob.getMonth() + 1).padStart(2, "0")}/${dob.getFullYear()}`,
    height: "5'6\"",
    currentCity: CITY,
    maritalStatus: "Never Married",
    education: "Post Graduate",
    profession: "Software Engineer",
    motherTongue: "Hindi",
    diet: "Veg",
    familyType: "Nuclear family",
    partnerAgeRange: "25–29",
  });
  await submitProfile(user.id);
  const profile = await prisma.profile.findUnique({ where: { userId: user.id }, select: { id: true, isVisible: true } });
  return { user, profileId: profile!.id, visible: profile!.isVisible };
}

async function cleanup() {
  await prisma.consentEvent.deleteMany({ where: { OR: [{ actorUserId: { in: userIds } }, { ownerUserId: { in: userIds } }] } });
  await prisma.partnerClientNote.deleteMany({ where: { ownerUserId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

async function main() {
  console.log("\nPartner Client Desk + candidate proposals — Phase 3\n");

  /* ---------------------------------------------------------------- */
  console.log("Assignment is a live delegation, nothing else");
  /* ---------------------------------------------------------------- */

  const partnerUser = await makeUser("Bureau", "PARTNER");
  const partner = await makePartner(partnerUser);
  const otherPartnerUser = await makeUser("Rival", "PARTNER");
  const otherPartner = await makePartner(otherPartnerUser);

  const client = await makeLiveMember("Riya", "Ladki", 27);
  const stranger = await makeLiveMember("Anita", "Ladki", 28);
  const candidateA = await makeLiveMember("Arjun", "Ladka", 29);
  const candidateB = await makeLiveMember("Vivek", "Ladka", 30);

  check("0. the fixture profiles are actually live", client.visible && candidateA.visible && candidateB.visible);

  const noneYet = await listClientsForPartner(partner.id);
  check("1. no delegation means no clients", noneYet.length === 0);

  const noDeskYet = await openClientDesk(partner.id, client.user.id);
  check("1b. and the desk 404s rather than 403s", !noDeskYet.ok && noDeskYet.error === "NOT_FOUND");

  const searchBefore = await searchForClient({
    partnerUserId: partnerUser.id,
    partnerId: partner.id,
    partnerLabel: "Bureau",
    ownerUserId: client.user.id,
    filters: emptyFilters(),
  });
  check("1c. and search is refused", !searchBefore.ok && searchBefore.error === "FORBIDDEN");

  /* ---------------------------------------------------------------- */
  console.log("\nGranting the desk permissions");
  /* ---------------------------------------------------------------- */

  check(
    "2. the desk permissions are NOT offered at claim time",
    !CLAIM_TIME_PERMISSIONS.includes("SEARCH_FOR_CLIENT") &&
      !CLAIM_TIME_PERMISSIONS.includes("PROPOSE_SHORTLIST"),
  );
  check(
    "2b. but they are grantable",
    GRANTABLE_PERMISSIONS.includes("SEARCH_FOR_CLIENT") &&
      GRANTABLE_PERMISSIONS.includes("PROPOSE_SHORTLIST") &&
      GRANTABLE_PERMISSIONS.includes("DRAFT_MESSAGE"),
  );
  check(
    // Whole words only. The loose `/FULL|ALL|ADMIN/` this started as began
    // failing the day Phase 4 added REQUEST_CALL, which contains "ALL" and
    // grants the narrowest thing in the enum — the check was reading letters
    // where it meant to read scope.
    "2c. and there is still no FULL_ACCESS-shaped value",
    !GRANTABLE_PERMISSIONS.some((p) => /(^|_)(FULL|ALL|ADMIN|EVERYTHING)(_|$)/i.test(p)),
  );

  const granted = await grantDelegation({
    ownerUserId: client.user.id,
    actorUserId: client.user.id,
    partnerId: partner.id,
    delegateUserId: partnerUser.id,
    permissions: ["VIEW_CONFIRMED_PROFILE"],
    days: 60,
    helperLabel: "Bureau",
  });
  check("2d. a delegation is granted", granted.ok);
  if (!granted.ok) throw new Error("no delegation");

  const clientsNow = await listClientsForPartner(partner.id);
  check("3. the client now appears on the desk", clientsNow.length === 1 && clientsNow[0].ownerUserId === client.user.id);
  check("3b. with readiness from the owner's real profile", clientsNow[0].completionPercent > 0 && clientsNow[0].profileLive);

  const searchNoPerm = await searchForClient({
    partnerUserId: partnerUser.id,
    partnerId: partner.id,
    partnerLabel: "Bureau",
    ownerUserId: client.user.id,
    filters: emptyFilters(),
  });
  check(
    "3c. an assigned client still does not imply search permission",
    !searchNoPerm.ok && searchNoPerm.error === "FORBIDDEN",
  );

  const widened = await updateDelegationScope({
    ownerUserId: client.user.id,
    delegationId: granted.delegation.id,
    permissions: ["VIEW_CONFIRMED_PROFILE", "SEARCH_FOR_CLIENT", "PROPOSE_SHORTLIST", "DRAFT_MESSAGE"],
  });
  check("2e. the owner can widen the scope from their Access screen", widened.ok);

  const junkScope = await updateDelegationScope({
    ownerUserId: client.user.id,
    delegationId: granted.delegation.id,
    permissions: ["VIEW_CONFIRMED_PROFILE", "FULL_ACCESS", "READ_MESSAGES"],
  });
  check(
    "2f. unknown permissions are dropped, not stored",
    junkScope.ok && junkScope.delegation.permissions.length === 1,
  );
  // Put the real scope back for the rest of the run.
  await updateDelegationScope({
    ownerUserId: client.user.id,
    delegationId: granted.delegation.id,
    permissions: ["VIEW_CONFIRMED_PROFILE", "SEARCH_FOR_CLIENT", "PROPOSE_SHORTLIST", "DRAFT_MESSAGE"],
  });

  const emptyScope = await updateDelegationScope({
    ownerUserId: client.user.id,
    delegationId: granted.delegation.id,
    permissions: [],
  });
  check("2g. an empty scope is refused — Revoke is its own button", !emptyScope.ok);

  const strangerScope = await updateDelegationScope({
    ownerUserId: stranger.user.id,
    delegationId: granted.delegation.id,
    permissions: ["VIEW_CONFIRMED_PROFILE"],
  });
  check("2h. somebody else cannot edit this delegation", !strangerScope.ok);

  /* ---------------------------------------------------------------- */
  console.log("\nSearch is the client's own search");
  /* ---------------------------------------------------------------- */

  const search = await searchForClient({
    partnerUserId: partnerUser.id,
    partnerId: partner.id,
    partnerLabel: "Bureau",
    ownerUserId: client.user.id,
    filters: emptyFilters(),
  });
  check("4. search now works", search.ok);
  if (!search.ok) throw new Error(search.message);

  const ids = search.rows.map((r) => r.profileId);
  check("4b. it returns eligible candidates", ids.includes(candidateA.profileId));
  check(
    "4c. and never the client themselves",
    !ids.includes(client.profileId),
  );
  check(
    "4d. gender narrowing comes from the client's own preferences",
    !ids.includes(stranger.profileId),
    "a same-gender profile leaked into a Ladki client's results",
  );

  const rowJson = JSON.stringify(search.rows);
  check(
    "5. no photo reaches the partner's result rows",
    !/photoUrl|photoUnlocked|fileUrl/.test(rowJson),
  );
  check(
    "5b. and no contact field could",
    !search.rows.some((r) => Object.keys(r).some((k) => /phone|mobile|email|contact/i.test(k))),
  );
  check("5c. the page is capped", search.rows.length <= 20);

  const otherDeskSearch = await searchForClient({
    partnerUserId: otherPartnerUser.id,
    partnerId: otherPartner.id,
    partnerLabel: "Rival",
    ownerUserId: client.user.id,
    filters: emptyFilters(),
  });
  check("6. another partner cannot search for this client", !otherDeskSearch.ok);

  const history = await getConsentHistory(client.user.id);
  check(
    "7. every search is written to the OWNER's own consent history",
    history.some((h) => h.kind === "PARTNER_SEARCH_RUN"),
  );
  const searchRow = history.find((h) => h.kind === "PARTNER_SEARCH_RUN");
  check(
    "7b. and the log records a count, never the filters",
    Boolean(searchRow?.detail?.includes("profile mile")) && !/city|age|education/i.test(searchRow?.detail ?? ""),
  );

  /* ---------------------------------------------------------------- */
  console.log("\nProposing — and never sending");
  /* ---------------------------------------------------------------- */

  const shortReason = await proposeCandidate({
    partnerUserId: partnerUser.id,
    partnerId: partner.id,
    partnerLabel: "Bureau",
    ownerUserId: client.user.id,
    candidateProfileId: candidateA.profileId,
    reason: "acha hai",
    source: "PARTNER_SEARCH",
  });
  check("8. a proposal with no real reason is refused", !shortReason.ok && shortReason.error === "REASON_TOO_SHORT");

  const proposed = await proposeCandidate({
    partnerUserId: partnerUser.id,
    partnerId: partner.id,
    partnerLabel: "Bureau",
    ownerUserId: client.user.id,
    candidateProfileId: candidateA.profileId,
    reason: "Dono ek hi sheher me hain, education aur family type dono match karte hain.",
    source: "PARTNER_SEARCH",
    draftMessage: "Namaste, aapki profile dekhi — baat karna chahenge?",
  });
  check("8b. a proper proposal is accepted", proposed.ok);
  if (!proposed.ok) throw new Error("no proposal");

  const stored = await prisma.candidateProposal.findUnique({ where: { id: proposed.proposalId } });
  check("9. the proposal records who made it", stored?.proposedByUserId === partnerUser.id && stored?.partnerId === partner.id);
  check("9b. with a code-computed fit score, not the partner's", stored?.fitScore !== null && stored?.fitScore !== undefined);
  check("9c. and the draft message stored but unsent", Boolean(stored?.draftMessage));

  const noInterest = await prisma.interest.findFirst({
    where: { fromUserId: client.user.id, toUserId: candidateA.user.id },
  });
  check("10. proposing sent no interest", noInterest === null);
  const noShortlistYet = await prisma.shortlist.findFirst({
    where: { userId: client.user.id, targetProfileId: candidateA.profileId },
  });
  check("10b. and wrote nothing to the owner's shortlist", noShortlistYet === null);
  const noMessage = await prisma.message.findFirst({ where: { senderId: partnerUser.id } });
  check("10c. and sent no message", noMessage === null);

  const dupe = await proposeCandidate({
    partnerUserId: partnerUser.id,
    partnerId: partner.id,
    partnerLabel: "Bureau",
    ownerUserId: client.user.id,
    candidateProfileId: candidateA.profileId,
    reason: "Dobara bhej raha hoon kyunki jawaab nahi aaya abhi tak.",
    source: "PARTNER_SEARCH",
  });
  check("11. the same candidate cannot be proposed twice", !dupe.ok && dupe.error === "ALREADY_PROPOSED");

  const searchAfter = await searchForClient({
    partnerUserId: partnerUser.id,
    partnerId: partner.id,
    partnerLabel: "Bureau",
    ownerUserId: client.user.id,
    filters: emptyFilters(),
  });
  check(
    "11b. and the search marks them as already proposed",
    searchAfter.ok && searchAfter.rows.find((r) => r.profileId === candidateA.profileId)?.alreadyProposed === true,
  );

  /* ---------------------------------------------------------------- */
  console.log("\nOwner decides");
  /* ---------------------------------------------------------------- */

  const strangerDecide = await decideProposal(stranger.user.id, proposed.proposalId, "accept");
  check("12. only the owner may decide", !strangerDecide.ok && strangerDecide.error === "NOT_FOUND");

  const accepted = await decideProposal(client.user.id, proposed.proposalId, "accept");
  check("12b. the owner accepts", accepted.ok);

  const shortlist = await prisma.shortlist.findUnique({
    where: { userId_targetProfileId: { userId: client.user.id, targetProfileId: candidateA.profileId } },
  });
  check("13. accepting adds to the OWNER's own shortlist", shortlist !== null);
  check("13b. stamped with who suggested it", shortlist?.addedByPartnerId === partner.id);

  const stillNoInterest = await prisma.interest.findFirst({
    where: { fromUserId: client.user.id, toUserId: candidateA.user.id },
  });
  check("13c. and still sends no interest — that stays the owner's own button", stillNoInterest === null);

  const decidedTwice = await decideProposal(client.user.id, proposed.proposalId, "reject");
  check("13d. a decided proposal cannot be re-decided", !decidedTwice.ok);

  const secondProposal = await proposeCandidate({
    partnerUserId: partnerUser.id,
    partnerId: partner.id,
    partnerLabel: "Bureau",
    ownerUserId: client.user.id,
    candidateProfileId: candidateB.profileId,
    reason: "Yeh bhi usi sheher se hain aur family background milta-julta hai.",
    source: "PARTNER_OFFLINE",
  });
  check("14. a second candidate can be proposed", secondProposal.ok);
  if (!secondProposal.ok) throw new Error("no second proposal");

  const rejected = await decideProposal(client.user.id, secondProposal.proposalId, "reject", "Abhi nahi.");
  check("14b. and rejected", rejected.ok);
  const rejectedRow = await prisma.candidateProposal.findUnique({ where: { id: secondProposal.proposalId } });
  check("14c. with the owner's note kept", rejectedRow?.status === "REJECTED" && rejectedRow.ownerNote === "Abhi nahi.");
  const noShortlistForRejected = await prisma.shortlist.findFirst({
    where: { userId: client.user.id, targetProfileId: candidateB.profileId },
  });
  check("14d. a rejected candidate never reaches the shortlist", noShortlistForRejected === null);

  const reProposeRejected = await proposeCandidate({
    partnerUserId: partnerUser.id,
    partnerId: partner.id,
    partnerLabel: "Bureau",
    ownerUserId: client.user.id,
    candidateProfileId: candidateB.profileId,
    reason: "Ek baar aur soch lijiye, mujhe lagta hai ye sahi rahenge aapke liye.",
    source: "PARTNER_SEARCH",
  });
  check("15. a 'no' cannot be re-asked next week", !reProposeRejected.ok && reProposeRejected.error === "ALREADY_PROPOSED");

  /* ---------------------------------------------------------------- */
  console.log("\nPrivate notes");
  /* ---------------------------------------------------------------- */

  const note = await addClientNote({
    partnerId: partner.id,
    authorUserId: partnerUser.id,
    ownerUserId: client.user.id,
    body: "Phone par bataya ki ghar wale Jaipur se bahar nahi bhejna chahte.",
  });
  check("16. a partner can keep private notes on an assigned client", note.ok);

  const otherPartnerNote = await addClientNote({
    partnerId: otherPartner.id,
    authorUserId: otherPartnerUser.id,
    ownerUserId: client.user.id,
    body: "Chori se note likhne ki koshish.",
  });
  check("16b. an unassigned partner cannot", !otherPartnerNote.ok);

  const ownerHistory = await getConsentHistory(client.user.id);
  check(
    "16c. notes never appear in the owner's own history — they are the partner's, not statements about the owner",
    !JSON.stringify(ownerHistory).includes("ghar wale Jaipur"),
  );
  const otherPartnerNotes = await listClientNotes(otherPartner.id, client.user.id);
  check("16d. and one partner cannot read another's notes", otherPartnerNotes.length === 0);

  /* ---------------------------------------------------------------- */
  console.log("\nRevocation");
  /* ---------------------------------------------------------------- */

  const pendingProposal = await proposeCandidate({
    partnerUserId: partnerUser.id,
    partnerId: partner.id,
    partnerLabel: "Bureau",
    ownerUserId: client.user.id,
    candidateProfileId: stranger.profileId,
    reason: "Ye ek pending suggestion hai jo revoke ke waqt khula rahega.",
    source: "PARTNER_OFFLINE",
  });
  check("17. a pending proposal exists before revocation", pendingProposal.ok);

  await revokeDelegation(client.user.id, granted.delegation.id, client.user.id);

  const afterRevokeClients = await listClientsForPartner(partner.id);
  check("18. revocation removes the client from the desk", afterRevokeClients.length === 0);

  const afterRevokeSearch = await searchForClient({
    partnerUserId: partnerUser.id,
    partnerId: partner.id,
    partnerLabel: "Bureau",
    ownerUserId: client.user.id,
    filters: emptyFilters(),
  });
  check("18b. and blocks search on the very next call", !afterRevokeSearch.ok && afterRevokeSearch.error === "FORBIDDEN");

  const afterRevokePropose = await proposeCandidate({
    partnerUserId: partnerUser.id,
    partnerId: partner.id,
    partnerLabel: "Bureau",
    ownerUserId: client.user.id,
    candidateProfileId: candidateA.profileId,
    reason: "Revoke ke baad bhejne ki koshish — ye chalna nahi chahiye.",
    source: "PARTNER_SEARCH",
  });
  check("18c. and blocks proposing", !afterRevokePropose.ok);

  const queue = await listProposalsForOwner(client.user.id);
  const orphan = queue.find((p) => p.candidateProfileId === stranger.profileId);
  check(
    "19. a revoked partner's pending suggestion is closed, not left asking",
    orphan?.status === "EXPIRED",
    orphan?.status,
  );

  const survivingShortlist = await prisma.shortlist.findUnique({
    where: { userId_targetProfileId: { userId: client.user.id, targetProfileId: candidateA.profileId } },
  });
  check("20. what the owner already accepted survives revocation", survivingShortlist !== null);
  const survivingProfile = await prisma.profile.findUnique({ where: { userId: client.user.id } });
  check("20b. and so does their profile", survivingProfile?.isVisible === true);
  const survivingHistory = await getConsentHistory(client.user.id);
  check("20c. and their consent history", survivingHistory.length > 0);

  /* ---------------------------------------------------------------- */
  console.log("\nLimits");
  /* ---------------------------------------------------------------- */

  check("21. the daily search budget is a real number", DESK_SEARCH_DAILY_LIMIT > 0 && DESK_SEARCH_DAILY_LIMIT <= 100);
  check("21b. and the pending-queue cap too", MAX_PENDING_PROPOSALS > 0 && MAX_PENDING_PROPOSALS <= 20);

  const withdrawn = await withdrawProposal(partnerUser.id, partner.id, "Bureau", pendingProposal.ok ? pendingProposal.proposalId : "");
  check("21c. a withdrawn/expired proposal cannot be withdrawn again", !withdrawn.ok);

  /* ---------------------------------------------------------------- */
  console.log("\nBoundaries in the code itself");
  /* ---------------------------------------------------------------- */

  // Comments are stripped first, for the same reason the Phase 1 check strips
  // them: these files *name* the thing they refuse to do, in the docstring
  // that explains the refusal. A check that failed on the explanation would
  // push the next person to delete the explanation.
  const proposalCode = codeOf("lib/services/clientDesk/proposalService.ts");
  check(
    "22. the proposal service cannot send an interest — no code path reaches one",
    !/sendInterest|createMatch|prisma\.interest\./.test(proposalCode),
  );
  check("22b. nor write a message", !/prisma\.message\./.test(proposalCode));

  const searchCode = codeOf("lib/services/clientDesk/clientSearchService.ts");
  check(
    "23. the client search runs the member's own function, not its own query",
    searchCode.includes("searchDiscoveryCandidates") && !/prisma\.profile\.findMany/.test(searchCode),
  );

  const leaks = clientModulesReachingServerOnly([
    "components/clientDesk/ClientDeskClient.tsx",
    "components/clientDesk/ProposalQueueClient.tsx",
    "components/managed/ProfileAccessClient.tsx",
  ]);
  check("24. no client component value-imports a server-only module", leaks.length === 0, leaks.join("; "));

  console.log(failures === 0 ? "\nAll client-desk checks passed.\n" : `\n${failures} check(s) FAILED.\n`);
}

/** Source with block and line comments removed. */
function codeOf(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

function emptyFilters() {
  return {
    nameQuery: null,
    minAge: null,
    maxAge: null,
    cities: [],
    education: null,
    professionCategory: null,
    maritalStatus: null,
    diet: null,
    smoking: null,
    drinking: null,
    verifiedOnly: false,
    minTrustScore: null,
    cursor: null,
  };
}

/** Same walker as the Phase 1 and Phase 2 checks — this environment cannot run
 *  `next build`, so the one build error it would have caught is asserted here. */
function clientModulesReachingServerOnly(entries: string[]): string[] {
  const problems: string[] = [];

  function resolve(spec: string, fromFile: string): string | null {
    let base: string;
    if (spec.startsWith("@/")) base = spec.slice(2);
    else if (spec.startsWith(".")) base = pathJoin(dirname(fromFile), spec);
    else return null;
    for (const ext of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
      const candidate = `${base}${ext}`;
      if (existsSync(candidate)) return candidate;
    }
    return existsSync(base) ? base : null;
  }

  function walk(file: string, trail: string[], seen: Set<string>) {
    if (seen.has(file)) return;
    seen.add(file);
    const src = readFileSync(file, "utf8");
    if (/^\s*import\s+["']server-only["']/m.test(src) && trail.length > 0) {
      problems.push(`${trail[0]} → ${[...trail.slice(1), file].join(" → ")}`);
      return;
    }
    const importRe = /import\s+(type\s+)?([\s\S]*?)from\s+["']([^"']+)["']/g;
    let m: RegExpExecArray | null;
    while ((m = importRe.exec(src))) {
      const [, typeKeyword, clause, spec] = m;
      if (typeKeyword) continue;
      const bindings = clause.trim();
      if (
        bindings.startsWith("{") &&
        bindings
          .replace(/[{}]/g, "")
          .split(",")
          .every((b) => !b.trim() || b.trim().startsWith("type "))
      ) {
        continue;
      }
      const resolved = resolve(spec, file);
      if (resolved) walk(resolved, [...trail, file], seen);
    }
  }

  for (const entry of entries) walk(entry, [], new Set());
  return problems;
}

function dirname(p: string): string {
  return p.slice(0, p.lastIndexOf("/"));
}

function pathJoin(dir: string, rel: string): string {
  const parts = `${dir}/${rel}`.split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (part === "." || part === "") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}

main()
  .catch((err) => {
    failures++;
    console.error("\nUNCAUGHT:", err);
  })
  .finally(async () => {
    await cleanup();
    await prisma.$disconnect();
    process.exit(failures === 0 ? 0 : 1);
  });
