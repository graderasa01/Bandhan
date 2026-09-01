# BandhanTak — Current-State Marriage Network Build Plan

**Status:** Build source of truth after repository audit  
**Snapshot date:** 2026-09-01  
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

Naye commercial decisions jinhe launch se pehle formally approve karna hoga:

- Partner service booking commission percentage.
- Partner Pro / Agency subscription prices.
- Partner call, profile setup aur assisted-search prices.
- Service cancellation, refund aur missed-SLA rules.

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

#### E. Existing platform foundation

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
- Refund reverses pending earnings.
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

Deliver:

- Pilot-city partner onboarding and capacity controls.
- Response-SLA reminders and escalation.
- Safety/support playbooks.
- Funnel/outcome dashboard.
- Backup, migration, payment webhook, rate-limit and audit review.
- Accessibility, small-screen and low-network QA.

Acceptance:

- One real flow passes: partner draft -> owner claim -> discovery -> mutual -> family -> meeting -> closure/outcome.
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

The next builder should implement only Phase 1 in this order:

1. Lock delegation permissions and status transitions.
2. Add private profile contribution/draft storage.
3. Add claim token + owner OTP confirmation.
4. Add Smart Profile Deck `for partner/family` context.
5. Add owner change-review screen.
6. Add Partner `Clients` list/detail.
7. Add revoke/expiry/audit UI.
8. Add checks proving unclaimed profiles never enter discovery and revoked partners immediately lose access.

Only after all eight pass should Partner Marketplace work begin.

---

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
