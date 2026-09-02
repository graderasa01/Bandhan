import "./_env";
import { prisma } from "../lib/db/prisma";
import { grantDelegation, revokeDelegation } from "../lib/services/managedProfile/delegationService";
import {
  admitParticipant,
  getParticipantRoomView,
  listRoomParticipants,
  listRoomsForHelper,
  removeParticipant,
  resolveRoomAccess,
} from "../lib/services/rishta/roomParticipantService";
import { createRoomTask, completeRoomTask, listRoomTasks } from "../lib/services/rishta/roomTaskService";
import { decideRequest, listRoomRequests, raiseRequest } from "../lib/services/rishta/roomRequestService";
import { getRishtaSummary, saveMeetingCheckpoint } from "../lib/services/rishta/journeyService";
import { MAX_PENDING_REQUESTS_PER_ROOM } from "../lib/services/rishta/roomCollabPolicy";
import type { User } from "@prisma/client";

/**
 * Rishta Room collaboration — Phase 4.
 *
 * Run: `npx tsx scripts/room-collab-check.ts`
 *
 * Three properties, and none of them is "it stores rows":
 *
 *   1. **Two locks.** A helper needs a live delegation carrying the permission
 *      *and* an admission to this rishta. Either one alone buys nothing, and
 *      revoking the delegation closes every room on the next request — no cache
 *      to wait out.
 *
 *   2. **The helper's view is an allow-list.** No chat, no reflections, no
 *      topic text, no checkpoint, and none of another helper's requests. The
 *      test asserts on the *shape* of what comes back, because a view built by
 *      subtraction leaks the day somebody adds a field upstream.
 *
 *   3. **Only the owner's tap has an effect.** A request is a row until it is
 *      approved; approving is what creates the meeting, and it creates it on
 *      the owner's own journey.
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

async function makeUser(name: string, role: "USER" | "PARTNER" = "USER"): Promise<User> {
  const user = await prisma.user.create({
    data: {
      fullName: `${name} Roomkumar`,
      email: `room-${name}-${stamp}@local.test`,
      passwordHash: "x",
      role,
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
    },
  });
  userIds.push(user.id);
  return user;
}

async function cleanup() {
  await prisma.consentEvent.deleteMany({
    where: { OR: [{ actorUserId: { in: userIds } }, { ownerUserId: { in: userIds } }] },
  });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

async function main() {
  console.log("\nRishta Room collaboration — Phase 4\n");

  const owner = await makeUser("Owner");
  const candidate = await makeUser("Candidate");
  const partnerUser = await makeUser("Bureau", "PARTNER");
  const outsiderUser = await makeUser("Outsider", "PARTNER");

  // A real relationship, so the room exists at all. An interest is the
  // cheapest one the summary recognises.
  await prisma.interest.create({ data: { fromUserId: owner.id, toUserId: candidate.id, status: "PENDING" } });
  check("the rishta exists before anybody is admitted", (await getRishtaSummary(owner.id, candidate.id)) !== null);

  const partner = await prisma.partner.create({
    data: {
      userId: partnerUser.id,
      fullName: "Roomkumar Bureau",
      mobileNumber: `9300${Math.floor(Math.random() * 900000 + 100000)}`,
      email: partnerUser.email,
      mobileVerifiedAt: new Date(),
      emailVerifiedAt: new Date(),
      city: "RoompurTest",
      state: "Rajasthan",
      partnerType: "MARRIAGE_BUREAU",
      status: "ACTIVE",
    },
  });
  const outsider = await prisma.partner.create({
    data: {
      userId: outsiderUser.id,
      fullName: "Outsider Bureau",
      mobileNumber: `9400${Math.floor(Math.random() * 900000 + 100000)}`,
      email: outsiderUser.email,
      city: "RoompurTest",
      state: "Rajasthan",
      partnerType: "MARRIAGE_BUREAU",
      status: "ACTIVE",
    },
  });
  const papa = await prisma.familyMember.create({
    data: {
      ownerUserId: owner.id,
      displayName: "Papa",
      relation: "PARENT",
      inviteToken: `room-${stamp}`,
      inviteExpiresAt: new Date(Date.now() + 86_400_000),
    },
  });

  /* ---------------------------------------------------------------- */
  console.log("\nTwo locks, and each one alone buys nothing");
  /* ---------------------------------------------------------------- */

  const granted = await grantDelegation({
    ownerUserId: owner.id,
    actorUserId: owner.id,
    partnerId: partner.id,
    delegateUserId: partnerUser.id,
    permissions: ["VIEW_CONFIRMED_PROFILE", "REQUEST_MEETING", "REQUEST_CALL"],
    helperLabel: "Roomkumar Bureau",
  });
  check("the owner can grant the room permissions", granted.ok);
  if (!granted.ok) throw new Error("cannot continue without a delegation");

  check(
    "a permission without an admission reaches no room",
    (await listRoomsForHelper({ partnerId: partner.id })).length === 0,
  );

  const admitted = await admitParticipant(owner.id, candidate.id, granted.delegation.id);
  check("the owner admits them to this one rishta", admitted.ok);
  if (!admitted.ok) throw new Error("cannot continue without a participant");
  const participantId = admitted.participantId;

  check(
    "and now exactly one room is reachable",
    (await listRoomsForHelper({ partnerId: partner.id })).length === 1,
  );
  check(
    "another bureau cannot resolve that same participant",
    (await resolveRoomAccess({ participantId, partnerId: outsider.id })) === null,
  );
  check(
    "and neither can a family member holding no such grant",
    (await resolveRoomAccess({ participantId, familyMemberId: papa.id })) === null,
  );

  const papaGrant = await grantDelegation({
    ownerUserId: owner.id,
    actorUserId: owner.id,
    familyMemberId: papa.id,
    permissions: ["VIEW_CONFIRMED_PROFILE", "REQUEST_FAMILY_INTRO"],
    helperLabel: "Papa",
  });
  if (!papaGrant.ok) throw new Error("cannot continue without the family delegation");
  const papaAdmit = await admitParticipant(owner.id, candidate.id, papaGrant.delegation.id);
  if (!papaAdmit.ok) throw new Error("cannot continue without the family participant");

  const partnerAccess = (await resolveRoomAccess({ participantId, partnerId: partner.id }))!;
  const papaAccess = (await resolveRoomAccess({
    participantId: papaAdmit.participantId,
    familyMemberId: papa.id,
  }))!;

  check(
    "a helper's room permissions are only the ones the grant carries",
    partnerAccess.permissions.join(",") === "REQUEST_CALL,REQUEST_MEETING",
    partnerAccess.permissions.join(","),
  );
  check(
    "an admission does not add a permission nobody granted",
    !papaAccess.permissions.includes("REQUEST_MEETING"),
  );

  const refused = await raiseRequest(papaAccess, { kind: "MEETING", note: "Mulaqat kara dijiye please" });
  check("so a family intro grant cannot ask for a meeting", !refused.ok && refused.error === "NO_PERMISSION");

  /* ---------------------------------------------------------------- */
  console.log("\nOnly the owner's tap has an effect");
  /* ---------------------------------------------------------------- */

  const raised = await raiseRequest(partnerAccess, {
    kind: "MEETING",
    note: "Dono taraf baat ho chuki hai, ab milna chahiye",
    proposedFor: new Date(Date.now() + 7 * 86_400_000),
    proposedPlace: "Cafe",
  });
  check("a partner with the permission can ask", raised.ok);
  if (!raised.ok) throw new Error("cannot continue without a request");

  let summary = (await getRishtaSummary(owner.id, candidate.id))!;
  check("asking creates no meeting by itself", summary.meetings.length === 0);

  const again = await raiseRequest(partnerAccess, { kind: "MEETING", note: "Phir se keh raha hoon, mil lijiye" });
  check("and asking twice for the same thing is refused", !again.ok && again.error === "ALREADY_PENDING");

  const callRaised = await raiseRequest(partnerAccess, { kind: "CALL", note: "Pehle ek call kara dijiye" });
  check("a different kind is still allowed", callRaised.ok);

  const decided = await decideRequest(owner.id, raised.requestId, {
    approve: true,
    scheduledFor: new Date(Date.now() + 9 * 86_400_000),
    place: "Ghar par",
  });
  check("the owner approves it", decided.ok);

  summary = (await getRishtaSummary(owner.id, candidate.id))!;
  check("and only now is there a meeting", summary.meetings.length === 1);
  check(
    "on the owner's own terms, not the partner's suggestion",
    summary.meetings[0]?.place === "Ghar par",
    summary.meetings[0]?.place ?? "null",
  );

  const stranger = await decideRequest(candidate.id, callRaised.ok ? callRaised.requestId : "", { approve: true });
  check("somebody else cannot decide the owner's request", !stranger.ok && stranger.error === "NOT_FOUND");

  const declined = await decideRequest(owner.id, callRaised.ok ? callRaised.requestId : "", { approve: false });
  check("declining is allowed with no reason at all", declined.ok);
  summary = (await getRishtaSummary(owner.id, candidate.id))!;
  check("and a decline creates nothing", summary.meetings.length === 1);

  const introRaised = await raiseRequest(papaAccess, {
    kind: "FAMILY_INTRO",
    note: "Ab hum log unke ghar walon se baat karna chahte hain",
  });
  check("a family member can ask for the introduction", introRaised.ok);
  if (introRaised.ok) {
    await decideRequest(owner.id, introRaised.requestId, { approve: true });
    const tasks = await listRoomTasks(owner.id, candidate.id);
    check(
      "approving it leaves the doing with the owner, as a task",
      tasks.some((t) => t.party === "OWNER" && !t.doneAt),
    );
  }

  /* ---------------------------------------------------------------- */
  console.log("\nTasks flow one way");
  /* ---------------------------------------------------------------- */

  const assigned = await createRoomTask(owner.id, candidate.id, {
    title: "Unke ghar walon se time poochhiye",
    party: "PARTNER",
    participantId,
  });
  check("the owner can give a helper a task", assigned.ok);
  if (!assigned.ok) throw new Error("cannot continue without a task");

  const mismatched = await createRoomTask(owner.id, candidate.id, {
    title: "Galat party",
    party: "FAMILY",
    participantId,
  });
  check("a partner cannot be given a family task", !mismatched.ok && mismatched.error === "PARTY_MISMATCH");

  const wrongHelper = await completeRoomTask({ access: papaAccess }, assigned.taskId, true);
  check("and a different helper cannot close it", !wrongHelper.ok && wrongHelper.error === "NOT_FOUND");

  const closed = await completeRoomTask({ access: partnerAccess }, assigned.taskId, true);
  check("the helper it belongs to can", closed.ok);

  /* ---------------------------------------------------------------- */
  console.log("\nThe helper's view is an allow-list");
  /* ---------------------------------------------------------------- */

  // Something private on every axis the view could leak.
  await prisma.rishtaJourney.update({
    where: { userId_otherUserId: { userId: owner.id, otherUserId: candidate.id } },
    data: {
      topics: { create: { label: "Dahej ki baat" } },
      reflections: { create: { body: "Mujhe abhi tak theek nahi laga" } },
    },
  });
  await saveMeetingCheckpoint(owner.id, summary.meetings[0]!.id, {
    feeling: "UNSURE",
    note: "Sochne ka waqt chahiye",
  });

  const view = await getParticipantRoomView(partnerAccess);
  const serialised = JSON.stringify(view);
  check("the helper sees the stage", typeof view.stageLabel === "string" && view.stageLabel.length > 0);
  check("and the tasks", view.tasks.length > 0);
  check("but not the owner's private reflection", !serialised.includes("theek nahi laga"));
  check("nor the topics they have not discussed", !serialised.includes("Dahej"));
  check("nor the post-meeting checkpoint", !serialised.includes("Sochne ka waqt"));
  check(
    "and not another helper's requests",
    view.requests.every((r) => r.kind !== "FAMILY_INTRO"),
  );

  /* ---------------------------------------------------------------- */
  console.log("\nRevoking closes every room, immediately");
  /* ---------------------------------------------------------------- */

  const pendingBefore = await raiseRequest(partnerAccess, {
    kind: "CALL",
    note: "Ek aur baar call ki koshish karte hain",
  });
  check("a fresh ask is pending", pendingBefore.ok);

  await revokeDelegation(owner.id, granted.delegation.id, owner.id);
  check(
    "the revoked partner resolves to no room at all",
    (await resolveRoomAccess({ participantId, partnerId: partner.id })) === null,
  );
  check(
    "and their rooms list is empty on the very next read",
    (await listRoomsForHelper({ partnerId: partner.id })).length === 0,
  );
  check(
    "while the owner still sees who was in the room",
    (await listRoomParticipants(owner.id, candidate.id)).some((p) => p.id === participantId && !p.live),
  );
  check(
    "and the family member is untouched by it",
    (await resolveRoomAccess({ participantId: papaAdmit.participantId, familyMemberId: papa.id })) !== null,
  );
  check(
    "their undecided ask is withdrawn the next time the owner looks at the queue",
    (await listRoomRequests(owner.id, candidate.id)).find(
      (r) => r.id === (pendingBefore.ok ? pendingBefore.requestId : ""),
    )?.status === "WITHDRAWN",
  );
  const stale = await decideRequest(owner.id, pendingBefore.ok ? pendingBefore.requestId : "", { approve: true });
  check("and it cannot be approved after the fact", !stale.ok);

  /* ---------------------------------------------------------------- */
  console.log("\nRemoving somebody from one room");
  /* ---------------------------------------------------------------- */

  const removed = await removeParticipant(owner.id, papaAdmit.participantId);
  check("the owner can show a helper out", removed.ok);
  check(
    "their pending asks go with them",
    (await listRoomRequests(owner.id, candidate.id)).every((r) => r.status !== "PROPOSED"),
  );
  check(
    "and a removed helper can raise nothing more",
    !(await raiseRequest(papaAccess, { kind: "FAMILY_INTRO", note: "Ek baar aur keh raha hoon" })).ok,
  );
  check(
    "but the history of what happened stays",
    (await listRoomRequests(owner.id, candidate.id)).length > 0,
  );
  check(
    "and the delegation itself still stands",
    (await prisma.profileDelegation.findUnique({ where: { id: papaGrant.delegation.id } }))?.status === "ACTIVE",
  );
  check(
    "so re-admitting them is one row, not two",
    (await admitParticipant(owner.id, candidate.id, papaGrant.delegation.id)).ok &&
      (await prisma.rishtaParticipant.count({ where: { delegationId: papaGrant.delegation.id } })) === 1,
  );

  /* ---------------------------------------------------------------- */
  console.log("\nAnti-nag");
  /* ---------------------------------------------------------------- */

  const papaAccess2 = (await resolveRoomAccess({
    participantId: papaAdmit.participantId,
    familyMemberId: papa.id,
  }))!;
  // FAMILY_INTRO is the only kind this grant may raise, so the per-kind rule
  // bites before the total does — assert the total on a grant that can ask for
  // all three.
  const wide = await grantDelegation({
    ownerUserId: owner.id,
    actorUserId: owner.id,
    familyMemberId: papa.id,
    permissions: ["REQUEST_FAMILY_INTRO", "REQUEST_CALL", "REQUEST_MEETING"],
    helperLabel: "Papa",
  });
  check("the owner can widen an existing grant", wide.ok);
  const wideAccess = (await resolveRoomAccess({
    participantId: papaAccess2.participantId,
    familyMemberId: papa.id,
  }))!;

  for (const kind of ["FAMILY_INTRO", "CALL", "MEETING"] as const) {
    await raiseRequest(wideAccess, { kind, note: `Ye ${kind} wali baat kar lijiye` });
  }
  const overflow = await raiseRequest(wideAccess, {
    kind: "CALL",
    note: "Chauthi baat, jo honi hi nahi chahiye",
  });
  check(
    `a helper cannot hold more than ${MAX_PENDING_REQUESTS_PER_ROOM} undecided asks`,
    !overflow.ok && ["TOO_MANY_PENDING", "ALREADY_PENDING"].includes(overflow.error),
    overflow.ok ? "allowed" : overflow.error,
  );

  console.log(`\n${failures === 0 ? "PASS" : `FAIL — ${failures} check(s)`}`);
}

main()
  .catch((err) => {
    console.error(err);
    failures++;
  })
  .finally(async () => {
    await cleanup();
    await prisma.$disconnect();
    process.exit(failures === 0 ? 0 : 1);
  });
