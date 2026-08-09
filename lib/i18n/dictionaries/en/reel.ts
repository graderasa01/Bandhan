/**
 * Reel: the swipe-based profile discovery deck — components/reel/.
 * The core, most-used screen in the app, so this copy is kept as short and
 * plain as the buttons and labels it replaces.
 */
const reel: Record<string, string> = {
  // AiQuotaUpgradeCard
  "reel.aiQuota.viewPlans": "View Plans",

  // ReelActionBar
  "reel.actionBar.skip": "Skip",
  "reel.actionBar.askAi": "Ask AI",
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
  "reel.card.decisionSkip": "Skipped",
  "reel.card.decisionShortlist": "Shortlisted",
  "reel.card.noPhotoYet": "hasn't added a photo yet",
  "reel.card.photoLockedHint": "Photo will be visible after a mutual interest or subscription",
  "reel.card.badgeInterest": "Interest",
  "reel.card.badgeSkip": "Not Now",
  "reel.card.badgeAskAi": "Ask AI",
  "reel.card.badgeShortlist": "Shortlist",
  "reel.card.askSomething": "Ask Something",
  "reel.card.questionAsked": "Question already asked",
  "reel.card.selfLabel": "You",

  // ReelEmptyState
  "reel.emptyState.title": "Today's matches are done",
  "reel.emptyState.description": "Sent interest to {sent} out of {daily} today. New matches will be ready tomorrow morning.",
  "reel.emptyState.viewAgain": "View Again",
  "reel.emptyState.viewShortlist": "View Shortlist",
  "reel.emptyState.comeBackTomorrow": "Come Back Tomorrow",
  "reel.emptyState.upgradeBenefit": "{count} profiles every day",

  // ReelFrame
  "reel.frame.keyboardLabel": "Keyboard",
  "reel.frame.keySkip": "← Skip",
  "reel.frame.keyInterest": "→ Interest",
  "reel.frame.keyShortlist": "↓ Shortlist",
  "reel.frame.keyAskAi": "↑ Ask AI",

  // ReelHeader
  "reel.header.backToDashboard": "Back to Dashboard",
  "reel.header.progressLabel": "Today's matches",

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

  // ReelSwipeCoach
  "reel.swipeCoach.directionRight": "Right — Interest",
  "reel.swipeCoach.directionLeft": "Left — Not Now",
  "reel.swipeCoach.directionDown": "Down — Shortlist",
  "reel.swipeCoach.directionUp": "Up — Ask AI",
  "reel.swipeCoach.heading": "Swipe the card with two fingers",
  "reel.swipeCoach.instructionPart1":
    "Sometimes one finger doesn't move the card — that's because your phone is scrolling the details inside the card instead.",
  "reel.swipeCoach.instructionBold": "Two fingers",
  "reel.swipeCoach.instructionPart2": "on the card will always move it. The buttons below do the same thing.",
  "reel.swipeCoach.gotIt": "OK, Got It",
  "reel.swipeCoach.oneTimeNote": "This will only show once.",

  // ReelTrustStrip
  "reel.trustStrip.photoVerified": "Photo Verified",
  "reel.trustStrip.photoPending": "Photo Pending",
  "reel.trustStrip.mobileVerified": "Mobile Verified",
  "reel.trustStrip.mobilePending": "Mobile Pending",
};

export default reel;
