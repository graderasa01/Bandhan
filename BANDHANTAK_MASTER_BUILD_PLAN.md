# BandhanTak — Current-State Marriage Network Build Plan

**Status:** Build source of truth after repository audit  
**Snapshot date:** 2026-09-02 (Phases 1–6 built bar the Pro/Agency tiers; see §3.1 E–H and §13)  
**Purpose:** Jo already bana hai use dobara banaye bina BandhanTak ko profile-listing app se consent-based, end-to-end marriage journey network banana.

---

## 1. Product outcome

BandhanTak ka final promise marriage guarantee nahi hai. Final promise hai:

> Har serious rishta ek clear journey me chalega. User, family, Grio aur verified local partner ko pata hoga ki ab tak kya hua, agla kadam kya hai, kaun karega aur kis permission se karega.

Core journey:

```text
Profile Draft
  -> Owner Claim + Consent
  -> Profile Ready + Trust
  -> Discovery / Recommendation
  -> Interest
  -> Mutual Match
  -> Rishta Room
  -> Important Topics + Verification
  -> Family Introduction
  -> Secure Call
  -> Meeting
  -> Decision
  -> Engaged / Married / Respectful Closure
```

---

## 2. Authority and locked decisions

Implementation se pehle builder ko `docs/bandhantak/DECISIONS.md` poora padhna hai. Conflict me locked decision jeetega.

Is plan me ye existing decisions unchanged hain:

- Monthly plans remain Free / Basic ₹999 / Standard ₹1,999 / Premium ₹2,999.
- One-time items monthly plan ke upar additive hain; monthly ladder ko replace nahi karte.
- Existing referred subscription commission ₹100 flat rahegi jab tak formal decision ise change na kare.
- Family private chat aur private user reflections nahi dekh sakti.
- AI action propose kar sakta hai; bina user confirmation ke sensitive/write action execute nahi karta.
- Paid visibility organic recommendation ya verification ko buy nahi kar sakti.
- Adult profile subject ki consent ke bina profile public nahi hoti.

Naye commercial decisions — **2026-09-02 ko starting values tay kar di gayi hain**, aur ab har ek `/admin/pricing` se badla ja sakta hai, bina deploy ke. Ye "lock" nahi hain; ye wo jagah hain jahan se experiment shuru hota hai.

| Faisla | Starting value | Kyun | Kahan se badlega |
|---|---|---|---|
| Partner service booking commission | **15%** | Marketplace ka aam range 10–20% hai. 15% par partner ko 85% milta hai, jo listing screen ke "partner ko zyada milta hai" wale daave ko sach rakhta hai. Cap 40% — usse upar wo daava jhootha ho jata. | `/admin/pricing` → Platform ka hissa |
| Partner Pro / Agency prices | **abhi bhi nahi** | Tier ka feature hi nahi bana (§13 Phase 6 mana karta hai jab tak daam tay na ho). Phase 7 ban chuka hai, par pilot **chala nahi** hai — aur sawaal wahi hai: partner ek mahine me kamata kitna hai. Ab us sawaal ka jawab dene wali screen maujood hai (`/admin/growth` → "Waade nibhe ya nahi" aur partner section). Ek pilot city ka ek mahina, phir daam. | pehle asli pilot mahina, phir ye |
| Partner call / profile setup / assisted search ke daam | **band ke andar partner khud** — Intro Call ₹99–₹999, Profile Setup ₹299–₹2,499, Assisted Search ₹499–₹4,999 | Ek daam sab par thopna galat hai: Jaipur aur Delhi ka bazaar alag hai. Band isliye hai ki ₹49 ka loss-leader ranking na khareed le, aur ₹2,00,000 ka "package" kisi majboor parivaar ko na bech diya jaaye. | `/admin/pricing` → Service ke daam ki hadd |
| Cancellation / refund / missed-SLA | Accept SLA **48 ghante** (miss = poora auto-refund), refund window **3 din** delivery ke baad, partner ki apni cancellation wording checkout par dikhti hai | Platform ke niyam partner negotiate nahi kar sakta — wahi cheez buyer ko bharosa deti hai. 48 ghante ek kaam karne wale bureau ke liye aasan hai aur ek so rahe partner ko pakad leta hai. | `/admin/pricing` → Accept ka time, Refund window |
| Verification ke daam | Pehchaan ₹199, Padhai ₹249, Kaam ₹249, Shaadi ka iraada ₹149, Interview ₹499 | Har ek asli manav-mehnat hai. Interview sabse mehnga kyunki usme sabse zyada waqt lagta hai. | `/admin/pricing` → Verification ke daam |

Iske alawa admin kisi ek partner ki kisi ek service ka daam khud rakh sakta hai — **₹0 sameet**. Free rakhne par booking payment gateway ke paas jaati hi nahi; buyer seedha book ho jaata hai aur us booking se partner ki kamai zero rehti hai (ledger jhooth nahi bolta). Har badlaav admin audit log me jaata hai.

### Phase 7 ke waqt wale faisle — 2026-09-02

Daam `/admin/pricing` par hain; **waqt** `/admin/pilot` par. Do alag screen isliye ki "partner ko 6 ghante pehle yaad dilao" badalne wala insaan ek galat field door platform ke commission se na khada ho. Ye bhi lock nahi hain.

| Faisla | Starting value | Kyun |
|---|---|---|
| Ek sheher kitne partner utha sakta hai | **12** (naye sheher ka default; har sheher ka apna number) | Ye database ki hadd nahi, us insaan ki hadd hai jise har partner ko naam se jaanna hai aur dikkat par phone karna hai. Zyada partner = har partner ki kamai kam = partner chala jaata hai. |
| Accept ka reminder | **24 ghante** bache hue par pehla, **6 ghante** par aakhri | 48-ghante ke clock par: ek aadhe raste par, ek tab jab poora working day bacha ho. Dono par partner kuch kar sakta hai. |
| Kitne miss par escalation | **2 miss, 30 din me** — aur us par nayi booking rok di jaati hai | Ek miss bura hafta hai; do ek mahine me pattern hai, aur wo pattern buyer ke paise se pata nahi chalna chahiye. Partner khud wapas chaalu kar sakta hai; record rehta hai. |
| Buyer ko refund window band hone ka reminder | **24 ghante** pehle | Chup-chaap band hone wali window window nahi hoti. |
| Milestone late hone par chhoot | **2 din** | Due date ek plan hai; ek dopahar ka late hona abhi toota hua waada nahi. |
| Safety case ka pehla jawab | **4 ghante** | Is product ki ek hi queue hai jiski ghadi kisi ki safety hai, paisa nahi. Poora nahi hone par case list me sabse upar chala jaata hai — band nahi hota. |
| "Yahan kholiye" ka threshold | **5 log** | Isse kam shor hai; ek pilot me ek sheher se paanch parivaar ek line hai. |

---

## 3. Current repository audit

### 3.1 Last work that is already built

#### A. Smart Profile Deck — commit `44486e7` (2026-08-31)

Already built:

- Default `Tap -> Confirm -> Live` mobile profile flow.
- One question per card; selected single answers auto-advance.
- Cascades such as Profession -> Industry -> Role on the same card.
- Date, height, time, place and number pickers.
- State -> City catalog, popular cities and city search.
- Religion-dependent community choices.
- Education and profession taxonomies.
- About Me composition from selectable answers.
- Visible Skip / Don't know / Prefer not to say / Not listed exits.
- Old manual form remains as fallback.
- Catalog checker: `scripts/quick-picks-check.ts`.

Do not rebuild the profile deck. Extend it with contributor/source tracking, partner mode and owner confirmation.

#### B. My Rishte + Rishta Room — commit `0972b95` (2026-08-31)

Already built:

- `/user/matches` is now `My Rishte`, not a generic matched-profile grid.
- Rishte are grouped into `Aap par hai`, `Chal rahe hain`, and closed.
- Every card has stage, outcome and deterministic next action.
- Full `/user/rishta/[otherUserId]` room.
- Journey stages from discovered through family, meeting, decision and closure.
- Topics, resolved/unresolved discussions, meetings and private notes.
- Explicit closure outcomes instead of one anonymous CLOSED state.
- Human-help request available inside the relevant Rishta Room.
- Bulk board service avoids per-card query explosion.
- Journey checker: `scripts/rishta-journey-check.ts`.

Do not create a second case/journey system. Extend the existing Rishta Room with assigned family/partner participants, tasks and service bookings.

#### C. One-time service items — commit `e7ccda0` (2026-08-27)

Already built:

- Admin-editable service item catalog.
- One-time checkout and payment-kind handling.
- Expiring entitlement fulfilment.
- Discovery Week item.
- Admin item management.
- Payment labels for plan vs one-time item.
- Item checker: `scripts/items-check.ts`.

Reuse this purchase infrastructure for future one-time digital capabilities. Human services need a booking/milestone layer on top; a payment row alone is not service delivery.

#### D. Spotlight Phase One — commit `63e055d` (2026-08-27)

Already built:

- Reach 50 and City Spotlight catalog items.
- Campaign eligibility and audience qualification.
- Audience estimation before purchase.
- Campaign builder and campaign status UI.
- Campaign fulfilment and delivery accounting foundation.
- Spotlight checker: `scripts/spotlight-check.ts`.

Paid placement must remain labelled and must never bypass two-way preference, safety or trust eligibility.

#### E. Managed Profile, Partner Marketplace, Client Desk — Phases 1–3, commit `1734b54` (2026-09-01)

Already built and live in production:

- Self / family / partner entry context, private client drafts and claim-by-OTP.
- `ProfileDelegation` + `ProfileDelegatePermission`, answer provenance and owner review.
- Revoke / expiry / audit UI on `/user/profile/access`, backed by `ConsentEvent`.
- `/partners` marketplace, partner services, availability, booking, milestones, refunds and reviews.
- Partner Client Desk: client-scoped search, candidate proposals with reasons, owner accept/reject.
- Checkers: `scripts/managed-profile-check.ts`, `scripts/marketplace-check.ts`, `scripts/client-desk-check.ts`.

#### F. Rishta Room collaboration — Phase 4 (2026-09-02)

Already built:

- `RishtaParticipant` — the owner admitting one helper into one rishta, separate from the delegation.
- `RishtaTask` — owner-assigned work with exactly one responsible party, closable by the helper it belongs to.
- `RishtaRequest` — family-intro / call / meeting asks, raised by a helper and decided by the owner.
- `REQUEST_FAMILY_INTRO`, `REQUEST_CALL`, `REQUEST_MEETING` permissions, which now do something.
- Post-meeting checkpoint on `RishtaMeeting`, owner-private, with `FELT_UNSAFE` routed to safety.
- `ServiceBooking.rishtaOtherUserId`, so a booking's status shows inside the rishta it is about.
- Helper surfaces: `/partner/rooms`, `/partner/rooms/[participantId]`, `/family/rishta/[participantId]`.
- Checker: `scripts/room-collab-check.ts`.

Do not build a second participant or task system. Verification requests (Phase 5) attach to the same room.

#### G. Verification services — Phase 5 (2026-09-02)

Already built:

- Verification catalog: eight kinds, each with its badge wording, the sentence naming what was checked, the sentence naming what it does **not** mean, a validity period and a fee.
- `VerificationCheck` — the result, with a frozen scope sentence and an expiry. Written only by staff recording evidence.
- `VerificationRequest` — one member asking another, with REQUESTER / SUBJECT / SPLIT payment and refund on decline, cancellation or an unfinishable check.
- Badges computed from existing truth (contact OTP, photo review) plus checks, so there is one list in one vocabulary and no duplicated state.
- Human verification queue in the admin panel: assignee, mandatory evidence note, member-safe result note, audit log entry.
- Member surfaces: `/user/verification`, and a verification card inside the Rishta Room.
- Checker: `scripts/verification-check.ts`.

**Deliberate decision, worth re-approving before launch:** the product stores **no identity documents**. `VerificationCheck` has no column for one. Staff verify against a document on a call or through an issuing body and record what they concluded; the app never holds the image. This makes "raw identity documents never reach another member or partner" true by construction rather than by access control, and keeps BandhanTak from becoming a document store worth breaking into. Partner KYC keeps its own separate flow for its own legal basis.

#### H. Commercial services and partner earnings — Phase 6 (2026-09-02)

Phase 2 already built the money and this phase deliberately did not rebuild it: a booking holds the fee, delivery releases the partner's share, a refund reverses it, and one withdrawal settles referral commission and service earnings together. What Phase 6 added is the case that machine could not express.

Already built:

- `PartnerRecovery` — the debt created when a refund lands after the partner's share has already been paid out, or committed to an approved payout. Reversal alone used to lose that money silently.
- Reversal now branches on how far the money travelled: HELD and unattached RELEASED reverse; a RELEASED share inside a still-REQUESTED payout shrinks that request instead; PAID or in-flight-and-approved becomes a recorded debt.
- Debts net off the available balance (floored at zero — never a negative balance on a payout screen), settle out of the next withdrawal with partial settlement, and can be waived by an admin with a reason and an audit-log entry.
- Earnings statement for the partner: every service allocation, referral commission and recovery as a dated line with the platform's cut shown, so three tiles become a total somebody can decompose.
- Admin recovery queue on `/admin/payouts`.
- Checker: `scripts/service-earnings-check.ts`.

**Not built, and deliberately:** Partner Pro / Agency subscription tiers. §2 lists their prices as an unapproved commercial decision and §13 says not to build the tiers before the prices are locked. The one-time Grio One-Rishta and human-service products are also unbuilt — the item infrastructure from Phase 2 already carries that shape, so they are a small add once somebody decides they should exist.

#### I. Admin pricing control plane (2026-09-02)

Har paise wala number ab admin ke haath me hai, code me nahi:

- Platform ka service commission %, accept SLA, refund window, minimum withdrawal — `/admin/pricing`.
- Per-kind service price bands, jinka floor 0 ho sakta hai.
- Verification fees, jinme 0 ka matlab "ye check free hai".
- Kisi bhi partner ki kisi bhi service par platform ka apna daam, **₹0 sameet** — `/admin/service-bookings` → Listings. ₹0 par booking gateway skip karti hai aur partner ki kamai 0 rehti hai.

Values code me defaults ki tarah rehti hain aur DB ka override unke upar merge hota hai — wahi shape jo `Plan.features` pehle se use karta hai. Iska matlab: naya database sahi daamon ke saath boot hota hai, aur override hatane par ek known-good value wapas aati hai, khaali khana nahi.

Jo admin **nahi** badal sakta: service ka naam aur uska promise. Wo code me fixed hain, kyunki is marketplace ka ek hi niyam mudta nahi — koi shaadi ka vaada nahi kar sakta — aur admin screen se editable promise ek din "Guaranteed Rishta in 30 Days" ban jaata hai. Daam mudte hain, daave nahi.

#### I2. Existing platform foundation

Already present and reusable:

- User, partner, admin and support roles.
- Profile, photo, biodata, kundli, deep profile and profile intelligence.
- Contact verification adapters including Twilio Verify integration seam.
- Trust score, photo review, block/report and moderation.
- Reel, discovery, filters, behavioural learning, interests and shortlist.
- Mutual matches, messaging, voice notes and mutual contact sharing.
- Family seats, family expectations, shortlist and notes.
- Grio assistant, Grio Map, action proposals, memory and scoped rishta context.
- Subscription plans, Razorpay seam, invoices, one-time items and entitlement overrides.
- Partner registration, approval, KYC, referral links/QR, leads, commission, withdrawals and payouts.
- Admin controls for users, partners, verification, pricing, items, payments, commissions and audit logs.

### 3.2 Partially built — extend, do not rename as complete

| Area | Current reality | Required extension |
|---|---|---|
| Human matchmaker | Premium intake request + OPEN/CONTACTED/RESOLVED queue | Named assignee, booking, SLA, tasks, service milestones and result |
| Partner | Referral/lead/commission portal | Managed client profiles, scoped search, suggestions and service delivery |
| Smart Profile | Fast user entry | Filling-for-self/family/client mode, source/provenance and owner review |
| Rishta Room | Strong private per-user journey | Family/partner participation with explicit permissions and task ownership |
| Family | Separate limited portal | Exact-rishta invitation, approvals and meeting coordination |
| Verification | Contact/trust/photo foundation | Paid human verification request, sponsored request and safe result sharing |
| OTP | Adapter/system seam exists | Production credentials, provider health checks, rate-limit and end-to-end live test |
| Service items | Digital entitlement and Spotlight | Human booking, milestone release, cancellation/refund and partner payout split |
| Notifications | In-app notices and some reach foundations | Booking reminders, consent expiry, meeting reminders and service SLA alerts |

### 3.3 Missing product systems

These are the real next builds:

1. Managed Profile consent and permission system.
2. Partner public marketplace by city/service/language.
3. Partner service catalog, availability and booking.
4. In-platform partner consultation instead of raw contact selling.
5. Partner client desk for assigned profiles only.
6. Owner approval for partner/family-entered information and actions.
7. Service milestone, refund and payout-split ledger.
8. Rishta-level participant/task layer for user, family and partner.
9. Human/two-sided verification request and safe result model.
10. Funnel, SLA, safety and outcome analytics.

---

## 4. Product information architecture

Member navigation should feel like five spaces, even if supporting URLs remain:

1. **Today** — one highest-value next action, active reminders and new responses.
2. **Discover** — Reel, advanced search, Grio suggestions and partner suggestions.
3. **My Rishte** — every real rishta, its stage and its room.
4. **Partners** — find/book local help and track booked services.
5. **Me & Trust** — profile, family access, verification, biodata, kundli and payments.

Grio is globally reachable and helps inside these spaces; it should not create a second copy of every page.

Partner navigation should become:

1. Today
2. Clients
3. Search for Client
4. Bookings
5. Earnings
6. Profile & Availability

Referral tools remain inside Earnings/Growth, not the main purpose of the partner portal.

---

## 5. Roles and permission boundary

### 5.1 Profile Owner

- Owns the account and public profile.
- Confirms sensitive facts and partner/family contributions.
- Controls photo/contact visibility.
- Approves interests, introductions, contact sharing and meetings.
- Can revoke all delegated access immediately.

### 5.2 Family Member

- Can view the profile sections granted to them.
- Can shortlist, leave family notes and propose an introduction.
- Can give availability and help coordinate a meeting.
- Cannot read private match chat or user reflections.
- Cannot publish edits or reveal contact without owner permission.

### 5.3 Verified Partner

- Uses one Partner Account for many consented clients.
- Never creates many fake user accounts from the partner phone number.
- Can draft a profile, search for an assigned client and propose candidates.
- Can draft messages, introductions and meetings.
- Cannot send/confirm sensitive actions without permission.
- Cannot browse/export the whole member database.
- Cannot see documents or private chats unless an explicit, narrow permission exists.

### 5.4 Grio

- Reads only allowed user/case state.
- Explains, compares and proposes the next action.
- Never buys, sends, reveals, ranks secretly or confirms on behalf of the user.
- Sponsored content is disclosed and separate from organic advice.

### 5.5 Admin / Verification / Support

- Operates queues with reason, assignee and audit log.
- Cannot impersonate a user silently.
- Sensitive access must be purpose-bound and logged.

---

## 6. End-to-end user journeys

### 6.1 Self-led user

1. Register and verify contact.
2. Complete eight live-profile facts with Smart Profile Deck.
3. Add deeper details gradually.
4. Receive Reel/search/Grio suggestions.
5. Express interest; mutual match opens Rishta Room.
6. Clear topics, request verification and invite family when ready.
7. Secure call, meeting and decision.
8. Close respectfully or record engagement/marriage outcome.

### 6.2 Family-assisted user

1. Parent creates a private draft invitation, not a public user account for the child.
2. Adult subject claims with own OTP.
3. Subject grants limited Family Manager permissions.
4. Family proposes details/shortlists; owner confirms sensitive actions.
5. Family joins an exact Rishta Room only when invited.
6. Family helps with expectations, availability and meeting—not private chat.

### 6.3 Partner-assisted user

1. Partner starts `New Client Draft` from Partner Desk.
2. Smart Profile Deck opens in `Filling for Client` mode.
3. Each answer is marked `Partner entered — owner not yet confirmed`.
4. Partner sends claim/consent link.
5. Adult owner verifies own phone/email, reviews changes and grants permissions.
6. Partner searches only on behalf of this assignment.
7. Partner proposes a shortlist with reasons; owner accepts/rejects.
8. Mutual interest opens normal Rishta Room.
9. Partner may coordinate family/call/meeting only inside granted scope.
10. Access expires or can be revoked; audit history remains.

### 6.4 User books a local partner

1. User filters verified partners by city, language, service, fee and availability.
2. User views transparent partner card, scope, SLA, reviews and cancellation rule.
3. User books an in-platform intro call or package.
4. Payment creates a booking; it does not reveal all contacts or grant profile control.
5. Partner accepts within SLA.
6. Service milestones are completed and acknowledged.
7. Partner earning becomes payable after completion/refund window.
8. User rates the completed service, not a promised marriage result.

---

## 7. Smart Profile Deck extensions

Keep the current deck and add:

### 7.1 Entry context

```text
Main apni profile bhar raha/rahi hoon
Ghar wale ke liye draft bana raha/rahi hoon
Main verified partner hoon, client ka draft bana raha/rahi hoon
```

### 7.2 Answer source and confidence

Every contributed answer should carry:

- contributor type and id;
- entered at;
- owner confirmation status/time;
- optional verification status/source;
- previous and proposed value for auditable edits.

Public profile continues to read the confirmed profile tables. Unconfirmed contributions remain a draft overlay and never leak into discovery.

### 7.3 Review experience

- Owner sees only proposed/changed answers, not the entire form again.
- `Confirm all safe answers` can confirm ordinary fields.
- Sensitive facts require explicit individual confirmation.
- `This is wrong` opens the same quick picker.
- Profile cannot go public until owner claims and minimum required fields are confirmed.

### 7.4 Data-quality rules

- Controlled values for matching/search fields.
- Rare answers use `Not listed`, then admin-reviewed mapping; never force a wrong chip.
- Full name and genuinely personal narrative may use typing/voice.
- Partner cannot infer religion, caste, marital status, income or intent.

---

## 8. Partner Marketplace and Service Desk

### 8.1 Public partner card

Show:

- verified partner badge and KYC state;
- service cities and languages;
- services and itemised fees;
- availability and current capacity;
- median response time and completion rate;
- verified completed-booking reviews;
- cancellation/refund rule;
- what data the partner will receive after booking.

Do not show a raw phone directory. Before booking, communication stays through the platform.

### 8.2 Initial service catalog (prices are experiments)

| Service | Test shape | Delivery proof |
|---|---|---|
| Partner Intro Call | 10–15 minutes, one-time | Completed call or auto credit |
| Profile Setup | Structured draft + owner review | Owner accepts delivered draft |
| Curated Shortlist | Defined number of eligible profiles | Suggestions delivered with reasons |
| Assisted Search | 30-day package | Weekly shortlist/activity milestones |
| Family Coordination | Calls + availability + meeting help | Logged coordination tasks |
| Meeting Coordination | One specific rishta | Scheduled/held meeting record |

No service may promise marriage. Promise measurable work, response time and refund/credit conditions.

### 8.3 Partner Client Desk

For each assigned client:

- profile readiness and confirmation gaps;
- allowed permissions and expiry;
- search using that client's preferences;
- candidate suggestion builder;
- owner approval queue;
- active rishte and next actions;
- booked-service milestones;
- family/meeting coordination tasks;
- private partner service notes, never shown as user statements;
- audit trail.

### 8.4 Partner actions

Permission keys should be explicit, for example:

```text
VIEW_PROFILE
PROPOSE_PROFILE_EDIT
SEARCH_FOR_CLIENT
PROPOSE_SHORTLIST
DRAFT_MESSAGE
REQUEST_FAMILY_INTRO
REQUEST_CALL
REQUEST_MEETING
VIEW_SERVICE_BOOKING
```

No broad `FULL_ACCESS` shortcut.

---

## 9. Rishta Room extensions

The existing room remains the single source of one-rishta state. Add:

- participant strip: owner, invited family, assigned partner, human support;
- each participant's visible permission scope;
- next action with `who owns it` and optional due date;
- verification request/status for this pair;
- family introduction request and consent;
- secure call booking;
- partner/human service task and SLA;
- meeting invitation/accept/reschedule states;
- post-meeting private checkpoint;
- service/disclosure labels: Organic, Grio, Family, Partner, Sponsored;
- owner-visible access/audit history.

Private per-user stage, notes and reflections remain private. A participant does not automatically see them.

---

## 10. Verification system

### 10.1 Layers

- Contact Verified: mobile/email OTP.
- Identity Checked: identity workflow result, never raw document exposure.
- Photo Checked.
- Education/Work Checked where supported.
- Marriage Intent Confirmed.
- Human Interview Completed.
- Partner-assisted label, separate from fact verification.

### 10.2 Request/sponsor model

A verification request is raised inside the Rishta Room the two people already share (Phase 4). It is not a new surface, and the participant/permission rules there apply unchanged: a helper may ask for a check, the owner decides, and the result is disclosed by scope.

A user may request a specific check from the other person. The requester may sponsor the fee, split it, or let the subject pay. Payment never gives access to raw documents.

Result disclosure should be scoped:

```text
Checked and matched
Checked with a mismatch that needs discussion
Could not be completed
Declined by profile owner
Expired / needs refresh
```

`BandhanTak Verified` never means safe spouse, good character or marriage guarantee. It names exactly what was checked.

### 10.3 Production OTP gate

Built as of Phase 5's audit: rate limits (5 sends/hour), 60-second resend cooldown, 5-attempt cap, destination hashing and masking, per-scope buckets, and an adapter seam that keeps tests off the live provider. What remains is configuration rather than code — real Twilio Verify credentials and a service SID — plus a live end-to-end run against them.

- Twilio Verify credentials and service SID configured outside code.
- Phone/email rate limits and resend cooldown.
- Abuse and enumeration protection.
- Provider failure fallback and user-safe error.
- Live test for send, correct code, wrong code, expiry and retry.

---

## 11. Commerce and ledger rules

### 11.1 Existing money remains separate

- Subscription payments and ₹100 referral commission keep existing ledger/rules.
- One-time digital items keep existing item purchase/fulfilment flow.
- Human service bookings get a separate service booking and partner earning flow.

### 11.2 Human service money flow

```text
Booking created
  -> Payment captured
  -> Partner accepts
  -> Milestone delivered
  -> User acknowledges / SLA evidence settles
  -> Refund window
  -> Partner earning payable
  -> Withdrawal/payout
```

Rules:

- No partner earning on failed/refunded booking.
- Self-funded/circular booking does not create commission.
- Refund reverses pending earnings. When the money has already been paid out, the reversal becomes a recorded debt (`PartnerRecovery`) that nets off the partner's next earnings — never a negative balance, and never a silent loss.
- Payer and beneficiary are separate fields.
- Payment never silently grants data permissions.
- Checkout shows list price, discount, taxes, total, renewal (if any), beneficiary, deliverables and cancellation policy.
- Sponsored profiles are labelled; organic Grio recommendation cannot be purchased.

---

## 12. Minimum data additions

Names may change during implementation, but responsibilities may not be merged into ambiguous tables.

### 12.1 Managed access

- `ProfileDelegation` — owner, delegate family/partner, status, start/expiry/revoked timestamps.
- `ProfileDelegationPermission` — one permission per row or validated permission set.
- `ProfileContribution` — proposed field value, source, confirmation and audit state.
- `ConsentEvent` — grant, change, revoke and claim evidence.

### 12.2 Partner services

- `PartnerService` — name, scope, price, duration, deliverables, active state.
- `PartnerServiceArea` — city/region/language.
- `PartnerAvailability` — bookable slots/capacity.
- `ServiceBooking` — buyer, beneficiary, partner, service, status and SLA.
- `ServiceMilestone` — due, submitted, accepted/disputed.
- `ServicePaymentAllocation` — platform/partner amounts and refund/reversal state.
- `ServiceReview` — only after completed booking.

### 12.3 Rishta collaboration

- `RishtaParticipantAccess` or equivalent assignment from an existing delegation.
- `RishtaTask` — owner, kind, due date and completion.
- `RecommendationDisclosure` — source and sponsored flag.
- `VerificationRequest` — requester, subject, scope, payer and outcome.

Prefer additive migrations and existing services. Do not replace `RishtaJourney`, `FamilyMember`, `PartnerCommission` or the current item/payment tables without a demonstrated incompatibility.

---

## 13. Build phases and acceptance gates

### Phase 0 — Stabilise the four recent builds

Deliver:

- Run typecheck/build plus quick-picks, rishta, items and Spotlight check scripts.
- Mobile QA for Smart Profile Deck, My Rishte, Rishta Room and Spotlight.
- Fix only verified defects; no redesign.
- Add current plan link to docs index/source hierarchy.

Acceptance:

- Existing custom checks pass.
- No regression to manual/voice/biodata profile entry.
- No purchasable item without fulfilment.
- Existing user, partner and admin permissions unchanged.

### Phase 1 — Managed Profile foundation (highest priority)

**Status: built** — commit `1734b54`, live in production. Checker: `scripts/managed-profile-check.ts`.

Deliver:

- Self / family / partner entry context.
- Private client draft.
- Claim-by-OTP link.
- Delegation and permission model.
- Answer provenance and owner review.
- Revoke/expiry/audit UI.
- Partner `Clients` list and client profile-draft screen.

Acceptance:

- Partner can manage multiple clients from one account.
- Partner phone is never used as client login.
- Unclaimed/unconfirmed profile cannot enter discovery.
- Owner can revoke access immediately.
- Sensitive answers require owner confirmation.

### Phase 2 — Partner Marketplace + booking

**Status: built** — commit `1734b54`, live in production. Checker: `scripts/marketplace-check.ts`.

Deliver:

- `/partners` and `/partners/[id]`.
- City/language/service/availability filters.
- Partner services and fees.
- Booking, payment, acceptance and cancellation.
- In-platform pre-booking messaging/call request.
- User `My Partner Services` and partner `Bookings` views.
- Admin booking/complaint/refund console.

Acceptance:

- Raw contact list is never sold.
- Every charge has a concrete deliverable and refund rule.
- Missed SLA can credit/refund automatically or enter a clear review queue.
- Only completed bookings can be reviewed.

### Phase 3 — Partner Client Desk + candidate proposals

**Status: built** — commit `1734b54`, live in production. Checker: `scripts/client-desk-check.ts`.

Deliver:

- Search scoped to one assigned client.
- Eligibility uses existing discovery/privacy/trust rules.
- Candidate proposal with explanation and source label.
- Owner accept/reject queue.
- Draft interest/message/family intro/meeting requests.
- Approval required before external effect.

Acceptance:

- Partner cannot access unassigned profiles beyond ordinary public eligibility.
- No bulk export/contact reveal.
- Every proposal records who made it.
- Owner can use the full product without the partner after revocation.

### Phase 4 — Rishta Room collaboration

**Status: built** — 2026-09-02. Checker: `scripts/room-collab-check.ts`.

Deliver:

- Participant and permission strip.
- Family and partner task assignment.
- Family introduction approval.
- Call and meeting request lifecycle.
- Booking/service status inside the relevant room.
- Post-meeting checkpoint and respectful closure.

Acceptance:

- Every active rishta has one deterministic next action and one responsible party.
- Private chat/reflections stay private.
- One party's private stage never overwrites the other party's view.

### Phase 5 — Verification services

**Status: built** — 2026-09-02. Checker: `scripts/verification-check.ts`. Outstanding and *not* code: production Twilio Verify credentials, and a decision on the fees in the catalog (they are experiments, per §8.2).

Deliver:

- Production contact verification hardening.
- Verification catalog and exact badge wording.
- Request/sponsor/split-payment flow.
- Human verification queue with assignee/evidence/result.
- Expiry/reverification and scoped result disclosure.

Acceptance:

- Paying does not change the verification result.
- Raw identity documents never reach another member/partner.
- Every badge names its verified scope and date.

### Phase 6 — Commercial services and partner earnings

**Status: built, except the tiers** — 2026-09-02. Checker: `scripts/service-earnings-check.ts`. Partner Pro / Agency entitlements remain blocked on the pricing decision in §2 and were not built.

Deliver:

- Service milestones and acknowledgement.
- Platform/partner allocation ledger.
- Refund/reversal/dispute path.
- Partner Pro/Agency entitlements only after pricing decision lock.
- Optional Grio One-Rishta and human service one-time products.

Acceptance:

- Existing ₹100 subscription referral commission remains separate.
- Totals, renewal and cancellation are explicit.
- No service earning before delivery/refund gate.

### Phase 7 — Pilot city launch and hardening

**Status: built** — 2026-09-02. Checker: `scripts/pilot-launch-check.ts`. What is
outstanding is not code: the pilot has to actually be run.

Deliver:

- Pilot-city partner onboarding and capacity controls. **Built** — `PilotCity`
  registry with OPEN/WAITLIST/PAUSED and a per-city cap on *listed* partners,
  enforced at listing approval; `CityDemandSignal` for everybody the marketplace
  turns away, drained only once a real partner in that city is free.
- Response-SLA reminders and escalation. **Built** — `/api/cron/ops`, hourly:
  settles both booking deadlines without waiting for a page view, two warnings
  before the acceptance clock runs out, a buyer warning before the refund window
  shuts, an overdue-milestone chase, and an escalation that pauses new bookings
  after two misses in thirty days.
- Safety/support playbooks. **Built** — `SafetyCase` opened by the same write
  that records a `SAFETY_CONCERN` closure, a `FELT_UNSAFE` checkpoint or a
  booking dispute, with the written playbook beside each case at `/admin/safety`.
  The case carries the fact, never the member's private words.
- Funnel/outcome dashboard. **Built** — the §14 metrics nothing reported, on
  `/admin/growth`: the north star, stage dwell, time to live profile, draft →
  claim, service SLA and dispute rate, verification outcomes, safety response.
- Backup, migration, payment webhook, rate-limit and audit review. **Written
  down** — `DEPLOYMENT.md` §5–§7: the cron schedule and what breaks without it,
  a restore that is actually tested (and the two things a restore does not bring
  back), and how a webhook is replayed rather than patched by hand.
- Accessibility, small-screen and low-network QA. **Not done.** The Phase 4–6
  surfaces have not been walked on a real phone on a bad connection, and no
  checker can stand in for that.

Acceptance:

- One real flow passes: partner draft -> owner claim -> discovery -> mutual -> family -> meeting -> closure/outcome. **Not done — this needs real people.**
- Support can explain and audit every permission, payment and service status.
- Failed provider/payment calls are retry-safe and do not double charge or double commission.

---

## 14. Metrics that prove marriage progress

Do not optimise only visits, swipes or time spent. Track:

- median time to live profile;
- partner draft -> owner claim rate;
- owner confirmation and delegation revocation rate;
- profile -> qualified interest;
- interest -> mutual match;
- mutual -> first two-way conversation;
- conversation -> family introduction;
- family introduction -> call;
- call -> meeting;
- meeting -> decision/outcome;
- median days spent at each stage;
- partner response SLA and service completion;
- refund/dispute/report rate;
- sponsored reach -> qualified interest, not raw impressions;
- verification completion/mismatch/decline;
- engagement/marriage outcome recorded voluntarily.

North-star operational metric:

> Active serious rishte jinke paas clear next action, responsible person aur recent progress hai.

---

## 15. Things not to build yet

- Wedding vendor marketplace before the matchmaking journey works.
- Raw city-wise phone/contact packages.
- Unlimited partner database browsing/export.
- A second profile builder or second Rishta CRM.
- Hidden sponsored recommendations.
- Pay-to-buy verification result or trust score.
- AI auto-send/auto-interest/auto-meeting.
- Marriage guarantee or success fee that pressures a decision.
- Twenty more top-level pages before existing surfaces are connected.

---

## 16. Builder execution protocol

Use this section when handing the plan to Claude/Codex/another implementation agent.

1. Read `DECISIONS.md`, this plan, relevant existing services and schema before editing.
2. Work one phase at a time. Do not implement later-phase models speculatively.
3. Start each phase with a current-state audit and file map.
4. Reuse Smart Profile Deck, Rishta Journey/Room, item payments, partner KYC/earnings and existing auth gates.
5. Use additive Prisma migrations. Never rewrite migration history.
6. Every write route must re-authorise the logged-in actor on the server.
7. Add audit records for consent, delegated access, money, verification and admin actions.
8. Do not make a service buyable until fulfilment/refund paths exist.
9. Add focused scripts/tests for each phase plus typecheck/build.
10. Preserve unrelated working-tree changes. At this snapshot `app/globals.css` and a local image are uncommitted and must not be overwritten or deleted.
11. End every phase with: changed files, migration impact, tests run, known limitations and next phase—not a vague completion statement.

---

## 17. Immediate next implementation slice

Phases 1–7 are built, apart from the Partner Pro / Agency tiers that §2's pricing decision still blocks. **There is no Phase 8 to write.** What is left is not a build slice — it is running the thing:

1. **Open one city.** `/admin/pilot` → add the city, set its capacity, open it. Onboard partners until the cap is a real constraint rather than a number. Everything below depends on this having actually happened.
2. **Point a scheduler at `/api/cron/ops`, hourly.** `DEPLOYMENT.md` §5. Without it the refunds and payouts still settle — but only when somebody opens the page, which is not what the buyer was promised.
3. **Twilio Verify credentials** (Phase 5) and a live end-to-end run against them. Configuration, not code, and it blocks launch.
4. **Accessibility, small-screen and low-network QA** on the Phase 4–6 surfaces. The only item in Phase 7's list that no checker can stand in for.
5. **One real end-to-end flow, in one city, with real people**: partner draft → owner claim → discovery → mutual → family → meeting → closure or outcome.
6. **Then, and only then, the Pro / Agency tiers.** After a month of that pilot, `/admin/growth` can say what a partner actually earns — and §2's last open price stops being a guess about somebody else's income.

Everything else in §2 is already a dial rather than a decision: prices at `/admin/pricing`, the operational clocks at `/admin/pilot`, and both audited.

## 18. Definition of done for BandhanTak Marriage Network

BandhanTak is not complete because all pages exist. It is complete when:

- A person, parent or partner can start a profile without creating identity confusion.
- The adult owner can claim, confirm and control it.
- Discovery produces clearly sourced, eligible recommendations.
- A mutual match becomes one usable Rishta Room.
- Family, Grio and a partner can help without seeing more than they should.
- Calls, verification, meetings and decisions move through clear states.
- Every paid item/service has a measurable promise, status and refund path.
- Every sensitive access and payment is explainable from an audit log.
- The user can leave a partner/service and continue their marriage journey with their own profile and history intact.
