/**
 * English copy for the two blocks at the top of the dashboard: the priority
 * rail ("Aaj ke liye", from `priorityEngine.ts`) and the readiness card
 * ("Aapki taiyari", from `bandhanJourney.ts`).
 *
 * Both used to be the only Hinglish-only surfaces on that screen, which was
 * conspicuous precisely because they sit above everything that was already
 * translated. `{count}`, `{fields}`, `{slot}` and friends are substituted by
 * the caller with `.replace()` — dropping one loses the number the line exists
 * to carry.
 */
const todayJourney: Record<string, string> = {
  /* ── The priority rail ──────────────────────────────────────────────── */
  "today.sectionTitle": "For today",
  "today.sectionAria": "Today's most important",

  "today.p0.profileNotLive.title": "Your profile isn't live yet",
  "today.p0.profileNotLive.detail":
    "Until your profile is live, nobody can see you.",
  "today.p0.profileNotLive.detailMissing":
    "Still missing: {fields}. Until your profile is live, nobody can see you.",
  "today.p0.profileNotLive.cta": "Finish profile",

  "today.p0.photoRejected.titleOne": "A photo was rejected",
  "today.p0.photoRejected.titleMany": "{count} photos were rejected",
  "today.p0.photoRejected.detail":
    "They didn't clear review. Add a new one — profiles without a photo are rarely opened.",
  "today.p0.photoRejected.cta": "Replace photo",

  "today.p1.messages.titleOne": "One message is waiting on a reply",
  "today.p1.messages.titleMany": "{count} chats are waiting on a reply",
  "today.p1.messages.detail": "They wrote; your reply hasn't gone yet.",
  "today.p1.messages.cta": "Open chat",

  "today.p1.questions.titleOne": "A question has come in",
  "today.p1.questions.titleMany": "{count} questions have come in",
  "today.p1.questions.detail": "Someone asked you something and is waiting on an answer.",

  "today.p1.interests.titleOne": "An interest has come in",
  "today.p1.interests.titleMany": "{count} interests have come in",
  "today.p1.interests.detail":
    "They've shown interest in you — yes or no are both fine, but a reply matters.",
  "today.p1.interests.cta": "Review",

  "today.p1.voice.titleOne": "A voice note is unplayed",
  "today.p1.voice.titleMany": "{count} voice notes are unplayed",
  "today.p1.voice.detail": "Someone sent something in their own voice.",
  "today.p1.voice.cta": "Listen",

  "today.p2.circleLive.title": "Serious Circle is running now",
  "today.p2.circleLive.detail":
    "{count} people are waiting on your reply. This doesn't come back once the session ends.",
  "today.p2.circleLive.cta": "Join now",

  "today.p2.circleOpen.title": "Serious Circle registration is open",
  "today.p2.circleOpen.detail": "{slot} — the roster closes 24 hours before it starts.",
  "today.p2.circleOpen.cta": "Register",

  "today.p3.silent.titleOne": "One match hasn't started talking",
  "today.p3.silent.titleMany": "{count} matches haven't started talking",
  "today.p3.silent.detail": "Both sides have said yes. Either of you can send the first message.",
  "today.p3.silent.cta": "Say hello",

  "today.p4.reel.title": "{count} rishtey are left today",
  "today.p4.reel.detailFresh": "Today's new rishtey haven't been opened.",
  "today.p4.reel.detailPartial": "You've seen {seen} of {total}.",
  "today.p4.reel.cta": "Open reel",

  "today.p5.gap.title": "One question: {label}",

  "today.p6.trust.detail": "{description} Your trust is {score}/100 right now.",
  "today.p6.trust.ctaVerify": "Verify now",
  "today.p6.trust.ctaImprove": "Improve trust",

  "today.p7.kundli.titleTime": "Add your birth time for the kundli",
  "today.p7.kundli.titlePlace": "Add your birth place for the kundli",
  "today.p7.kundli.detail":
    "The Lagna needs an exact time and the right city — the Moon sign and guna milan work without them.",
  "today.p7.kundli.cta": "Add details",

  "today.p7.quest.detail": "{done} of {target} done.",
  "today.p7.quest.cta": "Continue",

  /* ── The readiness card ─────────────────────────────────────────────── */
  "journey.cardTitle": "Where you stand",
  "journey.cardCount": "{done} of {total} set",

  "journey.profile.label": "Profile ready",
  "journey.profile.whyLive": "People stop on a complete profile — they scroll past a half-finished one.",
  "journey.profile.whyNotLive": "Until your profile is live, nobody can see you at all.",
  "journey.profile.cta": "Complete",

  "journey.trust.label": "Trust",
  "journey.trust.valueNone": "not yet",
  "journey.trust.why": "Verified profiles get replies faster.",
  "journey.trust.cta": "Improve",

  "journey.understanding.label": "How well Grio understands you",
  "journey.understanding.value": "{done} of {total}",
  "journey.understanding.why": "The more it understands, the better the rishtey — and the clearer the advice.",
  "journey.understanding.cta": "Answer",

  "journey.family.label": "Family",
  "journey.family.valueNone": "none",
  "journey.family.valueSome": "{count} joined",
  "journey.family.why": "Knowing the family's thinking in advance keeps a rishta from stalling halfway.",
  "journey.family.whySilent": "Family have joined, but none of them has shared what they expect.",
  "journey.family.ctaRemind": "Remind them",
  "journey.family.ctaInvite": "Invite",

  "journey.conversation.label": "Conversation",
  "journey.conversation.valueNone": "not started",
  "journey.conversation.valueSome": "running in {count}",
  "journey.conversation.why": "A match is half the work — the first message is the other half.",
  "journey.conversation.cta": "Say hello",

  "journey.circle.label": "Serious Circle",
  "journey.circle.valueNone": "not yet",
  "journey.circle.valueSome": "{count} times",
  "journey.circle.why": "Only people who genuinely want to marry turn up there.",
  "journey.circle.cta": "See next",

  /* ── The dashboard's Grio Map entry ─────────────────────────────────── */
  "userPage.dashboard.grioMapTitle": "Grio Map",
  "userPage.dashboard.grioMapSub":
    "The whole app at a glance — where you stand, what Grio knows, what's next.",
};

export default todayJourney;
