/**
 * Reel: the swipe-based profile discovery deck — components/reel/.
 * The core, most-used screen in the app, so this copy is kept as short and
 * plain as the buttons and labels it replaces.
 */
const reel: Record<string, string> = {
  // AiQuotaUpgradeCard
  "reel.aiQuota.viewPass": "View Rishta Pass",

  // ReelActionBar
  "reel.actionBar.notNow": "Not now",
  "reel.actionBar.askGrio": "Ask Grio",
  "reel.actionBar.shortlist": "Shortlist",
  "reel.actionBar.interest": "Interest",
  "reel.actionBar.groupLabel": "Match actions",

  // ReelAISheet
  "reel.aiSheet.example1": "Does the family's thinking match?",
  "reel.aiSheet.example2": "What do they think about relocating?",
  "reel.aiSheet.example3": "What is their lifestyle like?",
  "reel.aiSheet.title": "— Ask a Question",
  "reel.aiSheet.questionsToday": "questions today",
  "reel.aiSheet.quotaExceededDefault": "You've used up today's questions.",
  "reel.aiSheet.answerFailedDefault": "Could not get an answer.",
  "reel.aiSheet.networkError": "Network error — please try again.",
  "reel.aiSheet.thinkingLabel": "Thinking",
  "reel.aiSheet.inputPlaceholder": "Ask anything...",
  "reel.aiSheet.sendLabel": "Send",

  // ReelCard
  "reel.card.decisionInterest": "Interest sent",
  "reel.card.decisionShortlist": "Shortlisted",
  "reel.card.noPhotoYet": "hasn't added a photo yet",
  "reel.card.badgeInterest": "Interest",
  "reel.card.spotlight": "Spotlight",
  "reel.card.spotlightNote": "This member chose to put their profile forward.",
  "reel.card.badgeShortlist": "Shortlist",
  "reel.card.askSomething": "Ask Something",
  "reel.card.questionAsked": "Question already asked",
  "reel.card.selfLabel": "You",

  // ReelEndDiscovery — the close of the day's reel
  "reel.emptyState.viewAgain": "View Again",
  "reel.end.title": "That's today's matches.",
  "reel.end.recap": "You saw {seen} profiles today — sent interest to {interest}, shortlisted {shortlist}.",
  "reel.end.observationCity": "{n} of the profiles you picked were from {city}.",
  "reel.end.observationTrait": "“{trait}” was common to {n} of your picks.",
  "reel.end.refineLabel": "Shall we find you better matches?",
  "reel.end.saveAnswer": "Save",
  "reel.end.skipQuestion": "Not now",
  "reel.end.saveFailed": "Could not save — please try again.",
  "reel.end.saved": "Thank you — {n} saved. Tomorrow's matches will use this.",
  "reel.end.openDiscover": "Open Discover",
  "reel.end.talkToGrio": "Talk to Grio",
  "reel.end.backHome": "Back Home",

  // ReelFrame
  "reel.frame.keyboardLabel": "Keyboard",
  "reel.frame.keyNotNow": "← Not now",
  "reel.frame.keyInterest": "→ Interest",
  "reel.frame.keyShortlist": "↓ Shortlist",
  "reel.frame.keyAskGrio": "↑ Ask Grio",

  // ReelHeader
  "reel.header.backToDashboard": "Back to Dashboard",
  "reel.header.tagline": "Matches built on trust",
  "reel.header.askGrio": "Ask Grio",
  "reel.header.search": "Search profiles",
  "reel.header.myProfile": "My profile",

  // ReelTabs
  "reel.tabs.forYou": "For You",
  "reel.tabs.nearby": "Nearby",
  "reel.tabs.new": "New",
  "reel.tabs.compatible": "Compatible",
  "reel.tabs.groupLabel": "Lenses over today's matches",
  "reel.tabs.emptySuffix": "— nothing in this lens today",
  "reel.tabs.progressLabel": "Today's matches",

  // ReelUtilityRail
  "reel.rail.voice": "Voice",
  "reel.rail.voiceAria": "Listen to the family's verified voice",
  "reel.rail.whyMatch": "Why Match",
  "reel.rail.whyMatchAria": "Why this match — open the full answer",
  "reel.rail.moreDetails": "Details",
  "reel.rail.report": "Report",
  "reel.rail.reportAria": "Report this profile",

  // ReelVoiceSheet
  "reel.voiceSheet.title": "{name}'s family's voice",

  // Lens with nothing left in it
  "reel.lensEmpty.title": "Nothing left in this lens today.",
  "reel.lensEmpty.body": "The rest of today's matches are under “For You”.",

  // IcebreakerSheet
  "reel.icebreakerSheet.title": "— Interest Sent",
  "reel.icebreakerSheet.tabVoice": "Voice",
  "reel.icebreakerSheet.tabText": "Text",
  "reel.icebreakerSheet.voiceHint": "10 seconds — that's all you need",
  "reel.icebreakerSheet.questConnector": "unlocks",
  "reel.icebreakerSheet.sendVoiceNote": "Send Voice Note",
  "reel.icebreakerSheet.justSendInterest": "Just Send Interest",
  "reel.icebreakerSheet.aiSuggestionHint":
    "AI has suggested an opening line — you can edit it, or just send the interest.",
  "reel.icebreakerSheet.suggestionLoading": "Preparing a suggestion…",
  "reel.icebreakerSheet.messagePlaceholder": "Write your message…",
  "reel.icebreakerSheet.sendWithInterest": "Send with Interest",
  "reel.icebreakerSheet.messageSent": "Message sent",
  "reel.icebreakerSheet.messageSendFailed": "Message could not be sent",
  "reel.icebreakerSheet.networkError": "Network error — please try again",
  "reel.icebreakerSheet.voiceSendFailed": "Voice note could not be sent",
  "reel.icebreakerSheet.reviewTitle": "Recording is under review",
  "reel.icebreakerSheet.reviewDescription": "It will reach them as soon as it's checked.",
  "reel.icebreakerSheet.voiceSent": "— voice note sent",

  // ReelInsightPanel
  "reel.insightPanel.heading": "What AI noticed",
  "reel.insightPanel.noInsight": "AI insight isn't available for this profile yet.",

  // ReelShortlistSheet
  "reel.shortlistSheet.titleSuffix": "shortlisted",
  "reel.shortlistSheet.descriptionWithFamily":
    "This is saved in your shortlist — your Family Circle can already see it from their family portal.",
  "reel.shortlistSheet.descriptionNoFamily":
    "This is saved in your own shortlist. Create a Family Circle so your parents or siblings can also see it and share their opinion.",
  "reel.shortlistSheet.ok": "OK",
  "reel.shortlistSheet.viewShortlist": "View My Shortlist",
  "reel.shortlistSheet.createFamilyLink": "Create Family Circle",

  // ReelStack
  "reel.stack.interestLimitTitle": "This Month's Interests Are Done",
  "reel.stack.interestLimitDefault": "This month's interests are used up.",
  "reel.stack.matchedTitle": "You and {name} have matched",
  "reel.stack.matchedDescription":
    "Interest is confirmed from both sides — photos and other details will now be visible, and you can start talking.",
  "reel.stack.later": "Later",
  "reel.stack.startChat": "Start Chat",

  // Verification wording — ReelVerificationPills (card) and ReelDetailsSheet
  "reel.trustStrip.photoVerified": "Photo Verified",
  "reel.trustStrip.photoPending": "Photo Pending",
  "reel.trustStrip.mobileVerified": "Mobile Verified",
  "reel.trustStrip.mobilePending": "Mobile Pending",

  // ReelCard — preference honesty, rank, details
  "reel.card.aiTag": "AI",
  "reel.card.badgeAskGrio": "Ask Grio",
  "reel.card.badgeNotNow": "Not now",
  "reel.card.decisionNotNow": "Marked not now",
  "reel.card.kundliCautionHint": "Tradition has a note on this one — see the details.",
  "reel.card.lowInfo": "Little information",
  "reel.card.moreDetails": "More Details",
  "reel.card.moreDetailsAria": "Open full match details",
  "reel.card.rankLabel": "Rank",
  "reel.card.whyHeading": "Why this match?",
  "reel.card.whyNothing": "This hasn't been shared yet.",
  "reel.card.whyMore": "+{n} more",
  "reel.card.whyLess": "Show less",

  // ReelDetailsSheet
  "reel.details.aboutHeading": "About them",
  "reel.details.askAi": "Ask the AI",
  "reel.details.aiGrounded": "These are the AI's own words, drawn only from the profile facts shown above — no guesses, no claims about personality.",
  "reel.details.aiHeading": "What the AI noticed",
  "reel.details.commonGround": "Common ground",
  "reel.details.expectations": "Expectations",
  "reel.details.family": "Family",
  "reel.details.fullProfile": "Full Profile",
  "reel.details.gunaMilan": "Guna Milan",
  "reel.details.gunaMilanHint": "One traditional view — not a verdict on the match. The full working is on the profile.",
  "reel.details.kundli": "Kundli",
  "reel.details.lifestyle": "Lifestyle",
  "reel.details.noFactsYet": "They haven't shared family, lifestyle or expectation details yet.",
  "reel.details.nothingKnown": "This hasn't been shared yet.",
  "reel.details.rankLowInfo": "No personal comparison could be made for this pair yet — not from your preferences, not from how you each think — so there is no percentage here.",
  "reel.details.rankMeaning": "The rank score puts together the preferences you stated, how alike you think, trust and activity — it is not a guarantee, and not a compatibility percentage.",
  "reel.details.sendInterest": "Send Interest",
  "reel.details.starter": "Start the conversation",
  "reel.details.trustScore": "Trust score",
  "reel.details.unclear": "Not clear yet",
  "reel.details.valueConnection": "Value connection",
  "reel.details.verification": "Verification",
  "reel.details.whyHeading": "Why this match?",
};

export default reel;
