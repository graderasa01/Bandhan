import "./_env";
import { prisma } from "../lib/db/prisma";
import {
  addPilotCity,
  checkListingCapacity,
  citySlug,
  getDemandHotspots,
  notifyOpenCityWaitlists,
  recordDemandSignal,
  updatePilotCity,
} from "../lib/services/pilot/pilotCityService";
import { getOpsSettings, setOpsSettings, DEFAULT_OPS_SETTINGS } from "../lib/services/pilot/opsSettings";
import { runOpsSweep } from "../lib/services/pilot/opsSweep";
import { getSlaEscalations, runServiceSlaSweep } from "../lib/services/marketplace/slaJob";
import {
  reviewListing,
  saveListing,
  setAvailability,
  setServiceAreas,
  upsertService,
} from "../lib/services/marketplace/partnerListingService";
import {
  acceptBooking,
  disputeBooking,
  getServiceConfig,
  quoteBooking,
  submitMilestone,
} from "../lib/services/marketplace/bookingService";
import { splitBooking } from "../lib/services/marketplace/servicePolicy";
import { handleGatewayEvent } from "../lib/services/payments/subscriptionService";
import { addRishtaMeeting, confirmRishtaStage, saveMeetingCheckpoint } from "../lib/services/rishta/journeyService";
import { createReport } from "../lib/services/safety/reportService";
import { listSafetyCases, updateSafetyCase } from "../lib/services/safety/safetyCaseService";
import type { User } from "@prisma/client";

/**
 * Pilot launch and hardening — Phase 7.
 *
 * Run: `npx tsx scripts/pilot-launch-check.ts`
 *
 * Three promises, and every one of them is about something happening when
 * nobody is looking:
 *
 *   1. **A city says no honestly.** The capacity cap binds on the listing an
 *      admin approves, a city nobody entered blocks nothing, and somebody
 *      turned away is put on a list that is drained only when a real partner is
 *      actually free.
 *
 *   2. **The clocks run without a reader.** `settleBooking` used to fire only
 *      when a page was opened. The sweep has to refund the buyer whose partner
 *      never answered, release the partner whose window closed, and warn both
 *      of them beforehand — exactly once each.
 *
 *   3. **A safety signal reaches a person.** A rishta closed as unsafe, a
 *      meeting marked unsafe and a disputed booking each open a case. The case
 *      carries the fact and never the member's private words.
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
const citySlugs: string[] = [];

const OPEN_CITY = `Pilotpur${stamp}`;
const FULL_CITY = `Bharapur${stamp}`;
const CLOSED_CITY = `Bandpur${stamp}`;
const UNKNOWN_CITY = `Anjaanpur${stamp}`;
/** Kept partnerless on purpose: the waitlist test is about a city with nobody in it. */
const WAIT_CITY = `Intezaarpur${stamp}`;
const PRICE = 1_00_000; // ₹1,000

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

async function makeUser(name: string, role: "USER" | "PARTNER" | "ADMIN" = "USER"): Promise<User> {
  const user = await prisma.user.create({
    data: {
      fullName: `${name} Pilotkumar`,
      email: `pilot-${name}-${stamp}@local.test`,
      passwordHash: "x",
      role,
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
    },
  });
  userIds.push(user.id);
  return user;
}

async function makePartner(name: string, city: string, extraCities: string[] = []) {
  const user = await makeUser(name, "PARTNER");
  const partner = await prisma.partner.create({
    data: {
      userId: user.id,
      fullName: `${name} Bureau`,
      organizationName: `${name} Rishta Seva`,
      mobileNumber: `9${Math.floor(Math.random() * 900000000 + 100000000)}`,
      email: user.email,
      mobileVerifiedAt: new Date(),
      emailVerifiedAt: new Date(),
      city,
      state: "Rajasthan",
      partnerType: "MARRIAGE_BUREAU",
      status: "ACTIVE",
    },
  });

  await saveListing(partner.id, { isListed: true, headline: "Test bureau", about: "Test", languages: ["Hindi"] });
  await setServiceAreas(partner.id, [city, ...extraCities].map((c) => ({ city: c })));
  await setAvailability(partner.id, { acceptingBookings: true, weeklyCapacity: 20 });

  const service = await upsertService(partner.id, {
    kind: "CURATED_SHORTLIST",
    name: "Curated Shortlist",
    scope: "10 profiles",
    deliverables: ["10 eligible profiles"],
    priceInPaise: PRICE,
    deliveryDays: 7,
    acceptSlaHours: 48,
    cancellationPolicy: "Accept se pehle poora refund.",
    isActive: true,
  });
  if (!service.ok) throw new Error("no service");

  return { user, partner, serviceId: service.serviceId };
}

/** The booking + capture path, minus the gateway call — the same shape the other checkers use. */
async function bookAndCapture(buyerId: string, serviceId: string): Promise<string> {
  const quoted = await quoteBooking(serviceId);
  if (!quoted.ok) throw new Error(`quote failed: ${quoted.message}`);
  const config = await getServiceConfig();
  const split = splitBooking(quoted.quote.pricePaise, config.platformFeeBps);
  const orderId = `order_pilot_${Math.random().toString(36).slice(2, 12)}`;

  const payment = await prisma.payment.create({
    data: {
      userId: buyerId,
      kind: "SERVICE_BOOKING",
      amountPaise: quoted.quote.pricePaise,
      status: "CREATED",
      isTest: true,
      externalOrderId: orderId,
    },
  });
  const booking = await prisma.serviceBooking.create({
    data: {
      partnerId: quoted.quote.partnerId,
      serviceId,
      buyerUserId: buyerId,
      beneficiaryUserId: buyerId,
      status: "PENDING_PAYMENT",
      pricePaise: quoted.quote.pricePaise,
      platformFeeBps: config.platformFeeBps,
      platformFeePaise: split.platformFeePaise,
      partnerAmountPaise: split.partnerAmountPaise,
      paymentId: payment.id,
    },
  });

  await handleGatewayEvent({
    orderId,
    paymentId: `pay_pilot_${payment.id.slice(0, 8)}`,
    status: "CAPTURED",
    amountPaise: quoted.quote.pricePaise,
  });
  return booking.id;
}

/** A rishta real enough for the closure flow to accept a stage. */
async function makeRishta(a: User, b: User) {
  await prisma.interest.create({ data: { fromUserId: a.id, toUserId: b.id, status: "ACCEPTED" } });
  await prisma.match.create({ data: { userAId: a.id, userBId: b.id } });
}

/**
 * This checker edits the *global* ops settings row, which the live job reads.
 * Same rule `service-earnings-check` follows for pricing: put back exactly what
 * was there, whatever happens.
 */
let originalOps: Awaited<ReturnType<typeof getOpsSettings>> | null = null;

async function cleanup() {
  if (originalOps) {
    await prisma.opsSettings
      .upsert({ where: { id: "default" }, create: { id: "default", ...originalOps }, update: originalOps })
      .catch(() => {
        /* a settings row that vanished mid-run is not worth failing cleanup over */
      });
  }
  await prisma.cityDemandSignal.deleteMany({ where: { citySlug: { in: citySlugs } } });
  await prisma.pilotCity.deleteMany({ where: { slug: { in: citySlugs } } });
  await prisma.adminAuditLog.deleteMany({ where: { actorId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

async function main() {
  console.log("\nPilot launch and hardening — Phase 7\n");
  originalOps = await getOpsSettings();

  const admin = await makeUser("Admin", "ADMIN");
  const actor = { actorId: admin.id, actorRole: "ADMIN" as const };
  citySlugs.push(
    citySlug(OPEN_CITY),
    citySlug(FULL_CITY),
    citySlug(CLOSED_CITY),
    citySlug(UNKNOWN_CITY),
    citySlug(WAIT_CITY),
  );

  /* ---------------------------------------------------------------- */
  console.log("A city that is not in the registry blocks nothing");
  /* ---------------------------------------------------------------- */

  const stranger = await makePartner("Anjaan", UNKNOWN_CITY);
  const strangerVerdict = await checkListingCapacity(stranger.partner.id);
  check("an unknown city has no opinion", strangerVerdict.ok);
  const strangerApproval = await reviewListing({ partnerId: stranger.partner.id, approve: true, ...actor });
  check("so the listing is approved", strangerApproval.ok);

  /* ---------------------------------------------------------------- */
  console.log("\nA city decides who may be listed in it");
  /* ---------------------------------------------------------------- */

  const waitlisted = await addPilotCity({ city: CLOSED_CITY, state: "Rajasthan" }, actor);
  check("a new city starts on the waitlist", waitlisted.ok);
  const waitlistRow = await prisma.pilotCity.findUnique({ where: { slug: citySlug(CLOSED_CITY) } });
  check("with the default capacity from settings", waitlistRow?.partnerCapacity === DEFAULT_OPS_SETTINGS.defaultCityPartnerCapacity);
  check("and no opening date", waitlistRow?.openedAt === null);

  const closedPartner = await makePartner("Bandhu", CLOSED_CITY);
  const closedApproval = await reviewListing({ partnerId: closedPartner.partner.id, approve: true, ...actor });
  check("a waitlisted city refuses a listing", !closedApproval.ok);
  check(
    "and says why, rather than failing silently",
    !closedApproval.ok && closedApproval.message.includes(CLOSED_CITY),
    !closedApproval.ok ? closedApproval.message : "",
  );

  const opened = await addPilotCity({ city: FULL_CITY, state: "Rajasthan", status: "OPEN", partnerCapacity: 1 }, actor);
  check("a city can be opened with a capacity of one", opened.ok);

  const firstIn = await makePartner("Pehla", FULL_CITY);
  check("the first partner fits", (await reviewListing({ partnerId: firstIn.partner.id, approve: true, ...actor })).ok);

  const secondIn = await makePartner("Doosra", FULL_CITY);
  const full = await reviewListing({ partnerId: secondIn.partner.id, approve: true, ...actor });
  check("the second is refused — the city is full", !full.ok);
  check("and the message counts the seats", !full.ok && full.message.includes("1/1"), !full.ok ? full.message : "");

  // Raising the number is the only override, and it leaves a row behind.
  const raised = await updatePilotCity(opened.ok ? opened.id : "", { partnerCapacity: 2 }, actor);
  check("capacity can be raised", raised.ok);
  check("and then the second partner fits", (await reviewListing({ partnerId: secondIn.partner.id, approve: true, ...actor })).ok);
  const capacityAudit = await prisma.adminAuditLog.findFirst({
    where: { actorId: admin.id, actionType: "PILOT_CITY_UPDATED" },
  });
  check("raising it is in the audit log", capacityAudit !== null);

  // One city with room is enough — a bureau's second city must not cost them
  // the first.
  await addPilotCity({ city: OPEN_CITY, state: "Rajasthan", status: "OPEN", partnerCapacity: 5 }, actor);
  const both = await makePartner("Dono", OPEN_CITY, [CLOSED_CITY]);
  check(
    "covering one open city and one closed one is still approved",
    (await reviewListing({ partnerId: both.partner.id, approve: true, ...actor })).ok,
  );

  /* ---------------------------------------------------------------- */
  console.log("\nWhoever we turn away goes on a list");
  /* ---------------------------------------------------------------- */

  const waiting = await makeUser("Intezaar");
  const firstAsk = await recordDemandSignal({ userId: waiting.id, city: WAIT_CITY, reason: "NO_PILOT_CITY" });
  check("a demand signal is recorded", firstAsk.ok && !firstAsk.alreadyWaiting);
  const secondAsk = await recordDemandSignal({ userId: waiting.id, city: WAIT_CITY, reason: "NO_PILOT_CITY" });
  check("asking twice is the same want, not two", secondAsk.ok && secondAsk.alreadyWaiting);
  check(
    "one row per person per city",
    (await prisma.cityDemandSignal.count({ where: { userId: waiting.id, citySlug: citySlug(WAIT_CITY) } })) === 1,
  );

  const hotspots = await getDemandHotspots();
  check(
    "and it shows up as a place to open next, even though nobody had entered the city",
    hotspots.some((h) => h.citySlug === citySlug(WAIT_CITY) && h.waiting === 1 && !h.known),
  );

  // Opening the city is not the same as having somebody in it.
  const waitCity = await addPilotCity({ city: WAIT_CITY, state: "Rajasthan", status: "OPEN" }, actor);
  check("opening a city with no free partner tells nobody", waitCity.ok && waitCity.notified === 0);
  check(
    "and leaves them on the list",
    (await prisma.cityDemandSignal.count({ where: { userId: waiting.id, notifiedAt: null } })) === 1,
  );
  check(
    "though the signal now belongs to the city that was just created for it",
    (await prisma.cityDemandSignal.findFirstOrThrow({ where: { userId: waiting.id } })).pilotCityId ===
      (waitCity.ok ? waitCity.id : null),
  );

  // Give the city a partner who is listed, approved and free.
  const arrived = await makePartner("Pahuncha", WAIT_CITY);
  await reviewListing({ partnerId: arrived.partner.id, approve: true, ...actor });
  const drained = await notifyOpenCityWaitlists();
  check("once somebody is free, the waitlist is told", drained === 1);
  check(
    "exactly once",
    (await notifyOpenCityWaitlists()) === 0 &&
      (await prisma.cityDemandSignal.count({ where: { userId: waiting.id, notifiedAt: null } })) === 0,
  );
  check(
    "and the notice points at their city",
    (await prisma.notice.count({ where: { userId: waiting.id, kind: "SERVICE_UPDATE" } })) === 1,
  );

  /* ---------------------------------------------------------------- */
  console.log("\nThe clocks run without anybody reading the page");
  /* ---------------------------------------------------------------- */

  const buyer = await makeUser("Kharidaar");
  const seller = firstIn;

  // A booking whose acceptance deadline has already passed. Nothing reads it —
  // the sweep is the only thing that touches it.
  const dead = await bookAndCapture(buyer.id, seller.serviceId);
  await prisma.serviceBooking.update({
    where: { id: dead },
    data: { acceptBySla: new Date(Date.now() - HOUR) },
  });

  const firstSweep = await runServiceSlaSweep();
  check("the sweep expires an un-accepted booking", firstSweep.expired === 1);
  const deadRow = await prisma.serviceBooking.findUniqueOrThrow({ where: { id: dead } });
  check("its status says so", deadRow.status === "EXPIRED_UNACCEPTED");
  check("the buyer's money is refunded", deadRow.refundedAt !== null);
  check(
    "the allocation is reversed",
    (await prisma.servicePaymentAllocation.findFirstOrThrow({ where: { bookingId: dead } })).status === "REVERSED",
  );
  check(
    "and the buyer is told about the refund",
    // Not just "a notice exists" — the capture already sent them one about the
    // booking. This is specifically the refund notice.
    (await prisma.notice.count({ where: { userId: buyer.id, relatedId: dead, body: { contains: "refund" } } })) === 1,
  );

  // Reminders: one booking inside the first window, one inside the final one.
  const settings = await getOpsSettings();
  const gentle = await bookAndCapture(buyer.id, seller.serviceId);
  await prisma.serviceBooking.update({
    where: { id: gentle },
    data: { acceptBySla: new Date(Date.now() + (settings.slaFirstReminderHours - 1) * HOUR) },
  });
  const urgent = await bookAndCapture(buyer.id, seller.serviceId);
  await prisma.serviceBooking.update({
    where: { id: urgent },
    data: { acceptBySla: new Date(Date.now() + (settings.slaFinalReminderHours - 1) * HOUR) },
  });

  const reminderSweep = await runServiceSlaSweep();
  check("a partner is warned once as the clock runs down", reminderSweep.acceptReminders === 1);
  check("and once more at the end", reminderSweep.acceptFinalReminders === 1);

  const repeat = await runServiceSlaSweep();
  check(
    "running the sweep again sends nothing twice",
    repeat.acceptReminders === 0 && repeat.acceptFinalReminders === 0,
  );
  const urgentRow = await prisma.serviceBooking.findUniqueOrThrow({ where: { id: urgent } });
  check(
    "a booking warned at the end never gets the gentle reminder afterwards",
    urgentRow.acceptReminderAt !== null && urgentRow.acceptFinalReminderAt !== null,
  );

  // The buyer's side of the same idea: the refund window closing, and then
  // closing.
  const delivered = await bookAndCapture(buyer.id, seller.serviceId);
  await acceptBooking(seller.partner.id, delivered);
  for (const m of await prisma.serviceMilestone.findMany({ where: { bookingId: delivered } })) {
    await submitMilestone(seller.partner.id, m.id, "Ho gaya");
  }
  await prisma.serviceBooking.update({
    where: { id: delivered },
    data: { refundWindowEndsAt: new Date(Date.now() + (settings.ackReminderHours - 1) * HOUR) },
  });

  const ackSweep = await runServiceSlaSweep();
  check("the buyer is warned before the refund window shuts", ackSweep.ackReminders === 1);
  check("once", (await runServiceSlaSweep()).ackReminders === 0);

  await prisma.serviceBooking.update({
    where: { id: delivered },
    data: { refundWindowEndsAt: new Date(Date.now() - HOUR) },
  });
  const releaseSweep = await runServiceSlaSweep();
  check("a closed window releases the partner's money without anybody clicking", releaseSweep.released === 1);
  check(
    "and the allocation says released",
    (await prisma.servicePaymentAllocation.findFirstOrThrow({ where: { bookingId: delivered } })).status ===
      "RELEASED",
  );

  // An overdue milestone is chased once.
  const running = await bookAndCapture(buyer.id, seller.serviceId);
  await acceptBooking(seller.partner.id, running);
  const overdue = await prisma.serviceMilestone.findFirstOrThrow({ where: { bookingId: running } });
  await prisma.serviceMilestone.update({
    where: { id: overdue.id },
    data: { dueAt: new Date(Date.now() - (settings.milestoneOverdueGraceDays + 1) * DAY) },
  });
  const milestoneSweep = await runServiceSlaSweep();
  check("an overdue milestone is chased", milestoneSweep.milestoneReminders === 1);
  check("once", (await runServiceSlaSweep()).milestoneReminders === 0);

  /* ---------------------------------------------------------------- */
  console.log("\nTwo misses stop the buyers, not the partner");
  /* ---------------------------------------------------------------- */

  const second = await bookAndCapture(buyer.id, seller.serviceId);
  await prisma.serviceBooking.update({ where: { id: second }, data: { acceptBySla: new Date(Date.now() - HOUR) } });
  const escalationSweep = await runServiceSlaSweep();
  check("the second miss escalates the partner", escalationSweep.escalated === 1);
  check("and pauses new bookings", escalationSweep.autoPaused === 1);

  const availability = await prisma.partnerAvailability.findUniqueOrThrow({
    where: { partnerId: seller.partner.id },
  });
  check("their availability is off", !availability.acceptingBookings);
  check("with a reason on the row", availability.autoPausedAt !== null && Boolean(availability.autoPauseReason));

  const escalations = await getSlaEscalations();
  check(
    "the admin has a list to act on",
    escalations.some((e) => e.partnerId === seller.partner.id && e.misses >= 2),
  );

  // The partner can start again themselves — and the automatic pause clears
  // with their own decision, while the record stays.
  await setAvailability(seller.partner.id, { acceptingBookings: true, weeklyCapacity: 20 });
  const restarted = await prisma.partnerAvailability.findUniqueOrThrow({ where: { partnerId: seller.partner.id } });
  check("switching themselves back on clears the pause", restarted.acceptingBookings && restarted.autoPausedAt === null);
  check(
    "but the escalation record stands",
    (await getSlaEscalations()).some((e) => e.partnerId === seller.partner.id),
  );

  /* ---------------------------------------------------------------- */
  console.log("\nA safety signal reaches a person");
  /* ---------------------------------------------------------------- */

  const scared = await makeUser("Pareshaan");
  const other = await makeUser("Saamne");
  await makeRishta(scared, other);

  const closed = await confirmRishtaStage(scared.id, other.id, "CLOSED", "Bahut ajeeb baat ki thi", "SAFETY_CONCERN");
  check("a rishta can be closed as unsafe", closed.ok);

  const closureCase = await prisma.safetyCase.findFirst({
    where: { source: "RISHTA_CLOSURE", raisedByUserId: scared.id },
  });
  check("which opens a case", closureCase !== null);
  check("about the other person", closureCase?.aboutUserId === other.id);
  check(
    "and the case does not carry their private words",
    !JSON.stringify(closureCase ?? {}).includes("Bahut ajeeb baat ki thi"),
  );

  await addRishtaMeeting(scared.id, other.id, { happenedAt: new Date(), place: "Cafe" });
  const meeting = await prisma.rishtaMeeting.findFirstOrThrow({
    where: { journey: { userId: scared.id, otherUserId: other.id } },
  });
  await saveMeetingCheckpoint(scared.id, meeting.id, { feeling: "FELT_UNSAFE", note: "Peechha kiya" });

  const meetingCase = await prisma.safetyCase.findFirst({
    where: { source: "MEETING_CHECKPOINT", sourceId: meeting.id },
  });
  check("an unsafe checkpoint opens its own case", meetingCase !== null);
  check(
    "and the checkpoint note stays where it was promised to stay",
    !JSON.stringify(meetingCase ?? {}).includes("Peechha kiya"),
  );
  check(
    "the same checkpoint answered twice does not open a second case",
    (await saveMeetingCheckpoint(scared.id, meeting.id, { feeling: "FELT_UNSAFE" })) &&
      (await prisma.safetyCase.count({ where: { source: "MEETING_CHECKPOINT", sourceId: meeting.id } })) === 1,
  );

  await createReport({
    reporterUserId: scared.id,
    reportedUserId: other.id,
    targetType: "PROFILE",
    targetId: other.id,
    reason: "Peechha kar rahe hain",
  });
  const withReport = await prisma.safetyCase.findFirstOrThrow({ where: { id: meetingCase!.id } });
  check("a report they chose to file attaches to the case", withReport.reportId !== null);

  const complaintBuyer = await makeUser("Shikayat");
  const complained = await bookAndCapture(complaintBuyer.id, both.serviceId);
  await acceptBooking(both.partner.id, complained);
  const disputed = await disputeBooking(complaintBuyer.id, complained, "Paise le liye, kaam nahi kiya");
  check("a disputed booking is accepted", disputed.ok);
  const disputeCase = await prisma.safetyCase.findFirst({ where: { source: "SERVICE_DISPUTE", sourceId: complained } });
  check("and opens a case against the partner", disputeCase?.partnerId === both.partner.id);

  const rows = await listSafetyCases();
  const disputeRow = rows.find((r) => r.id === disputeCase?.id);
  check("the console can read the complaint, because it was written to us", disputeRow?.disputeReason !== null);
  check("and every case arrives with its playbook", rows.every((r) => r.playbook.steps.length > 0));

  /* ---------------------------------------------------------------- */
  console.log("\nA case cannot be closed silently");
  /* ---------------------------------------------------------------- */

  const noNote = await updateSafetyCase(disputeCase!.id, { status: "CLOSED_NO_ACTION" }, actor);
  check("closing without a note is refused", !noNote.ok);

  const badStep = await updateSafetyCase(disputeCase!.id, { stepsDone: ["invented-step"] }, actor);
  check("a step that is not in the playbook is refused", !badStep.ok);

  const stepped = await updateSafetyCase(disputeCase!.id, { stepsDone: ["read-complaint"] }, actor);
  check("a real step is recorded", stepped.ok);
  const claimed = await prisma.safetyCase.findUniqueOrThrow({ where: { id: disputeCase!.id } });
  check("touching a case claims it", claimed.claimedBy === admin.id && claimed.status === "IN_REVIEW");

  const closedCase = await updateSafetyCase(
    disputeCase!.id,
    { status: "ACTION_TAKEN", resolutionNote: "Partner se baat ki, refund diya." },
    actor,
  );
  check("with a note it closes", closedCase.ok);
  check(
    "and the closure is in the audit log",
    (await prisma.adminAuditLog.count({ where: { actorId: admin.id, actionType: "SAFETY_CASE_CLOSED" } })) === 1,
  );

  // The first-response clock only marks; it never closes anything.
  await prisma.safetyCase.update({
    where: { id: closureCase!.id },
    data: { openedAt: new Date(Date.now() - (settings.safetyFirstResponseHours + 1) * HOUR) },
  });
  const sweep = await runOpsSweep();
  check("an unclaimed case past its window is escalated", sweep.safetyEscalated >= 1);
  const escalated = await prisma.safetyCase.findUniqueOrThrow({ where: { id: closureCase!.id } });
  check("marked, not closed", escalated.escalatedAt !== null && escalated.status === "OPEN");
  check("and it sorts to the top", (await listSafetyCases())[0]?.id === closureCase!.id);

  /* ---------------------------------------------------------------- */
  console.log("\nThe dials are the dials the job reads");
  /* ---------------------------------------------------------------- */

  const backwards = await setOpsSettings({ slaFinalReminderHours: 48 }, actor);
  check("a final reminder later than the first is refused", !backwards.ok);

  const tooBig = await setOpsSettings({ defaultCityPartnerCapacity: 5000 }, actor);
  check("a capacity outside the guard rail is refused", !tooBig.ok);

  const saved = await setOpsSettings({ slaFirstReminderHours: 30 }, actor);
  check("a legal change saves", saved.ok);
  check("and is what the next read returns", (await getOpsSettings()).slaFirstReminderHours === 30);
  check(
    "every change is in the audit log",
    (await prisma.adminAuditLog.count({ where: { actorId: admin.id, actionType: "OPS_SETTINGS_UPDATED" } })) === 1,
  );

  /* ---------------------------------------------------------------- */
  console.log("\nA dry run writes nothing");
  /* ---------------------------------------------------------------- */

  const pending = await bookAndCapture(buyer.id, both.serviceId);
  await prisma.serviceBooking.update({ where: { id: pending }, data: { acceptBySla: new Date(Date.now() - HOUR) } });

  const dry = await runOpsSweep({ dryRun: true });
  check("the dry run sees the expiry", dry.sla.expired === 1);
  check(
    "but the booking is untouched",
    (await prisma.serviceBooking.findUniqueOrThrow({ where: { id: pending } })).status === "PAID",
  );
  check("and nobody was messaged", dry.waitlistNotified === 0 && dry.safetyEscalated === 0);
}

main()
  .catch((err) => {
    failures++;
    console.error("\nRun failed:", err instanceof Error ? err.message : err);
  })
  .finally(async () => {
    await cleanup();
    await prisma.$disconnect();
    console.log(failures === 0 ? "\nAll pilot launch checks passed.\n" : `\n${failures} check(s) failed.\n`);
    process.exit(failures === 0 ? 0 : 1);
  });
