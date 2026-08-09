/**
 * Catch-all dictionary for the smaller consumer-facing areas: messages
 * (chat), subscription (plans/boost/matchmaker), vibe (Soch Board polls),
 * grio (the AI concierge overlay), pwa (install prompts), quiz (Quiz
 * Battle), and layout (the three page-level app shells).
 *
 * Split out from partner.ts / auth.ts / etc. because none of these areas is
 * individually large enough to earn its own file yet.
 */
const misc: Record<string, string> = {
  // ---- Grio: GrioActionChips ----
  "grio.actionDone": "Done ✓",
  "grio.actionFailed": "Couldn't do that",
  "grio.chipDone": "Done ✓",
  "grio.networkError": "Network error — please try again",
  "grio.tryAgain": "Please try again.",
  "grio.willRemember": "Grio remembered this ✓",

  // ---- Grio: GrioAvatar / GrioBubble ----
  "grio.bubbleHint": "You can talk to Grio from here anytime — you can drag it too",

  // ---- Grio: GrioChatCore ----
  "grio.askByVoice": "Ask by speaking",
  "grio.clearScope": "Clear scope",
  "grio.composerPlaceholder": "Type your question…",
  "grio.introCandidate":
    "Ask to understand how {name}'s profile was scored. Grio explains it — the decision is always yours.",
  "grio.introGeneral":
    "Ask for general guidance on your matrimony journey — not about one specific profile, that decision is always your own.",
  "grio.introMatch": "Ask for help with your conversation with {name} — an icebreaker, a reply, or anything else.",
  "grio.networkErrorDot": "Network error — please try again.",
  "grio.noReply": "No reply came through — please try again.",
  "grio.pickRecipient": "Send this to someone?",
  "grio.scopeForMatch": "For {name}",
  "grio.scopeOnProfile": "On {name}'s profile",
  "grio.sendFailed": "Couldn't send it",
  "grio.sentTo": "Sent to {name}",
  "grio.speakReplies": "Read replies out loud",
  "grio.stopListening": "Stop listening",
  "grio.stopSpeaking": "Stop reading replies",
  "grio.thinking": "Thinking…",

  // ---- Grio: GrioDeck ----
  "grio.answerArrived": "Your question has an answer",
  "grio.askedSuffix": "asked",
  "grio.cannotUnlockYet": "Can't unlock this yet",
  "grio.earnedReward": "Earned reward",
  "grio.expiresIfUnused": "— will expire if you don't use it",
  "grio.manyUnlocksInHand": "You have {count} voice-note unlocks",
  "grio.nameAfterUnlock": "Name and profile will show after you unlock it",
  "grio.oneUnlockInHand": "You have 1 voice-note unlock",
  "grio.openInbox": "Open inbox",
  "grio.sentItSuffix": "sent it",
  "grio.voiceNoteArrived": "New voice note",

  // ---- Grio: GrioMatchPicker ----
  "grio.loading": "Loading…",
  "grio.noUnlockedMatch": "No chat-unlocked match found.",
  "grio.sendToWhom": "Send to whom?",

  // ---- Grio: GrioMemoryPanel ----
  "grio.addFactPlaceholder": "e.g. I work in Bengaluru",
  "grio.addYourOwn": "Add something yourself",
  "grio.memoryEmpty":
    "Nothing saved yet. When you tell Grio something about yourself in chat, it will offer a button to save it — or you can just type it in here.",
  "grio.memoryOnlyYours": "Only what you've told Grio or saved yourself.",
  "grio.memoryOnlyYoursWithLimit":
    "Only what you've told Grio or saved yourself. Your plan allows {limit} — {count} are saved right now.",
  "grio.memoryOverLimit":
    "Your plan now allows {limit} saved items, but none of the older ones were removed — they're all still here, and Grio still remembers them. To add a new one, remove an older one first.",
  "grio.removeFact": "Remove “{fact}”",

  // ---- Grio: GrioOverlay ----
  "grio.overlay.close": "Close",

  // ---- Grio: GrioSendConfirm ----
  "grio.sendConfirm.cancel": "Cancel",
  "grio.sendConfirm.send": "Send",
  "grio.sendConfirm.sendToPrefix": "Send to",

  // ---- Grio: SuggestedMessageCard ----
  "grio.copyFailed": "Couldn't copy",
  "grio.suggestedMessage": "Suggested message",

  // ---- Layout: AppShell ----
  "layout.appShell.adminPanel": "ADMIN PANEL",
  "layout.appShell.adminPanelAriaLabel": "Admin panel",

  // ---- Layout: PartnerShell ----
  "layout.partnerShell.logout": "Logout",
  "layout.partnerShell.namastePrefix": "Hello,",
  "layout.partnerShell.navCommissions": "Commissions",
  "layout.partnerShell.navDashboard": "Dashboard",
  "layout.partnerShell.navInviteSomeone": "Invite Someone",
  "layout.partnerShell.navMyLeads": "My Leads",
  "layout.partnerShell.navPayouts": "Payouts",
  "layout.partnerShell.navReferralTools": "Referral Tools",

  // ---- Layout: UserShell ----
  "layout.userShell.close": "Close",
  "layout.userShell.goAnywhere": "Go anywhere",
  "layout.userShell.logout": "Logout",
  "layout.userShell.more": "More",
  "layout.userShell.moreWithBadgeAriaLabel": "More — something new",
  "layout.userShell.namastePrefix": "Hello,",
  "layout.userShell.newSuffix": "new",

  // ---- Messages: ContactShareCard ----
  "messages.awaitingTheirReply": "'s reply",
  "messages.bothAgreedNote":
    "You both said yes. You can withdraw your yes, but a number that has already been shown can't be taken back.",
  "messages.bothMustAgree": "The number shows only once both sides say yes. Until then, it stays inside this chat.",
  "messages.consentSaved": "Your yes has been saved",
  "messages.consentWithdrawn": "You've withdrawn it",
  "messages.contactFailed": "Couldn't go through",
  "messages.networkError": "Network error — please try again",
  "messages.numberSuffix": "'s number",
  "messages.numberUnavailable": "Number not available",
  "messages.shareNumberTitle": "Share number?",
  "messages.theyAgreedNote":
    " is ready to share their number. If you say yes too, the number will show for both of you.",
  "messages.withdraw": "Withdraw",
  "messages.withdrawConsent": "Withdraw Consent",
  "messages.yesShareNumber": "Yes, Share My Number",
  "messages.yourYesSaved": "Your yes is saved — waiting for",

  // ---- Messages: ConversationListItem ----
  "messages.justNow": "just now",
  "messages.startChat": "You've matched — start the conversation",

  // ---- Messages: MessageBubble ----
  "messages.messageBubble.seen": "Seen",
  "messages.messageBubble.sent": "Sent",

  // ---- Messages: MessageThread ----
  "messages.composerPlaceholder": "Type a message…",
  "messages.ghostingNudgeMid": "'s message reached you",
  "messages.ghostingNudgeTail": " hours ago — a small reply could take this further.",
  "messages.nudgeOk": "Okay",

  // ---- Messages: MessageThreadHeader ----
  "messages.threadHeader.backToConversations": "Back to Conversations",
  "messages.threadHeader.verified": "Verified",

  // ---- PWA: AppInstallPanel ----
  "pwa.installPanel.alreadyInstalled": "Already installed — you're already using it like an app.",
  "pwa.installPanel.checking": "Checking…",
  "pwa.installPanel.description":
    "An icon lands on your home screen — tap it and you're straight in, no typing a URL, no logging in again and again.",
  "pwa.installPanel.installApp": "Install App",
  "pwa.installPanel.iosStep1Prefix": "Tap the",
  "pwa.installPanel.iosStep1Suffix": "button below",
  "pwa.installPanel.iosStep2Suffix": "and tap that",
  "pwa.installPanel.title": "Install it like an app",
  "pwa.installPanel.unavailable":
    "There's no install option in this browser right now. Open this page in Chrome on your phone — the install button will show up there.",

  // ---- PWA: InstallAppPrompt ----
  "pwa.installPrompt.androidDescription":
    "One tap and the app opens — no typing a URL, no logging in again and again. You'll also get notified about new matches right away.",
  "pwa.installPrompt.androidTitle": "Put BandhanTak on your home screen",
  "pwa.installPrompt.ariaLabel": "Install BandhanTak app",
  "pwa.installPrompt.dismiss": "Dismiss",
  "pwa.installPrompt.gotIt": "Got It",
  "pwa.installPrompt.installApp": "Install App",
  "pwa.installPrompt.iosDescription":
    "It's a two-step job — after that, BandhanTak opens from your home screen just like an app, without logging in every time.",
  "pwa.installPrompt.iosStep1Prefix": "Tap the",
  "pwa.installPrompt.iosStep1Suffix": "button below",
  "pwa.installPrompt.iosStep2Suffix": "and tap that",
  "pwa.installPrompt.iosTitle": "Add the app on your iPhone like this",
  "pwa.installPrompt.notNow": "Not Now",

  // ---- Quiz: QuizBattleCard ----
  "quiz.battleCard.answer": "Answer",
  "quiz.battleCard.inProgress": "Quiz Battle is on",
  "quiz.battleCard.invitedPost": "'s answer.",
  "quiz.battleCard.invitedPre": "Invite sent — waiting for",
  "quiz.battleCard.invitedYouSuffix": " invited you to a Quiz Battle",
  "quiz.battleCard.matchesFound": " answers matched!",
  "quiz.battleCard.networkError": "Network error — please try again",
  "quiz.battleCard.newBattle": "New Battle",
  "quiz.battleCard.notNow": "Not Now",
  "quiz.battleCard.play": "Play",
  "quiz.battleCard.playPrompt": "Play a Quiz Battle?",
  "quiz.battleCard.playPromptDesc": "5 light, fun questions — your answers get compared to see how well you match.",
  "quiz.battleCard.respondFailed": "Couldn't do that",
  "quiz.battleCard.startBattle": "Start Battle",
  "quiz.battleCard.startFailed": "Couldn't start the battle",
  "quiz.battleCard.theirCountPrefix": "'s",
  "quiz.battleCard.waitingForTheirAnswer": "'s answer — still waiting",
  "quiz.battleCard.youAnswerLabel": "— You: ",
  "quiz.battleCard.yourCountPrefix": "Your",

  // ---- Quiz: QuizBattleSheet ----
  "quiz.battleSheet.answerFailed": "Answer didn't go through",
  "quiz.battleSheet.completedDesc": "Open the card to see the result.",
  "quiz.battleSheet.completedTitle": "Battle complete!",
  "quiz.battleSheet.networkError": "Network error — please try again",
  "quiz.battleSheet.title": "Quiz Battle",

  // ---- Subscription: BoostStatusCard ----
  "subscription.boostActiveLead": "Your profile is currently ranking a bit higher in Rishta Reel — until",
  "subscription.boostActiveTail": ".",
  "subscription.boostComingSoon": "Your plan includes boost — it will activate soon.",
  "subscription.boostLocked": "Profile boost is included with the Standard or Premium plan.",
  "subscription.boostStatusCard.activeSuffix": "— Active",
  "subscription.boostStatusCard.title": "Profile Boost",
  "subscription.viewDetails": "View Details",

  // ---- Subscription: ContextualUpgradeCard ----
  "subscription.aiLimitLead": "You've used today's",
  "subscription.aiLimitTail": " AI questions",
  "subscription.cancelAnytime": "You can cancel anytime.",
  "subscription.chatLocked": "You need a plan to chat",
  "subscription.familySeat": "Want to add a family member?",
  "subscription.highEngagementLead": "You've shortlisted",
  "subscription.highEngagementTail": " profiles this week",
  "subscription.interestLimitLead": "You've sent",
  "subscription.interestLimitTail": " interests this month",
  "subscription.maybeTomorrow": "Maybe tomorrow",
  "subscription.perMonthCancel": " / month · cancel anytime",
  "subscription.planGivesLead": " plan gives you",
  "subscription.planGivesTail": ".",
  "subscription.reelExhaustedLead": "You've seen today's",
  "subscription.reelExhaustedTail": " matches for today 🙏",

  // ---- Subscription: MatchmakerRequestCard ----
  "subscription.matchmakerBlurb": "Our team will look at your profile and help you personally — no AI, a real person.",
  "subscription.matchmakerCta": "Request a Call",
  "subscription.matchmakerFailed": "Couldn't send the request",
  "subscription.matchmakerLimit": "You already have 3 open requests.",
  "subscription.matchmakerPlaceholder": "What do you need help with? (optional)",
  "subscription.matchmakerSent": "Request sent",
  "subscription.matchmakerSentNote": "Our team will contact you soon.",
  "subscription.matchmakerTitle": "Talk to a Matchmaker",

  // ---- Subscription: PhotoUnlockCta ----
  "subscription.photoUnlockCta.viewPlans": "View Plans",

  // ---- Subscription: PlanCheckoutGrid ----
  "subscription.choosePlan": "Choose",
  "subscription.paymentFailed": "Payment failed",
  "subscription.paymentFailedNote": "Nothing was charged — you can try again.",
  "subscription.paymentSuccess": "Payment successful",
  "subscription.paymentSuccessNote": "Your plan is active right away.",

  // ---- Subscription: PlanComparisonTable ----
  "subscription.compareCaption": "Comparing plans — what each plan includes",
  "subscription.included": "Included",
  "subscription.notIncluded": "Not included",
  "subscription.rowDeepProfileAll": "All 13",
  "subscription.rowGrioMemoryUnit": "memories",
  "subscription.planComparisonTable.feature": "Feature",

  // ---- Subscription: SubscriptionStatusCard ----
  "subscription.accessUntilLead": "Access valid until",
  "subscription.accessUntilTail": "",
  "subscription.autoRenew": "Auto-renew",
  "subscription.autoRenewOff": "is off",
  "subscription.autoRenewOn": "is on",
  "subscription.cancelPlan": "Cancel Plan",
  "subscription.cancelling": "Cancelling…",
  "subscription.currentPlan": "Current plan",
  "subscription.nextRenewal": "Next renewal",

  // ---- Subscription: SubscriptionStatusPanel ----
  "subscription.cancelFailed": "Could not cancel",
  "subscription.cancelled": "Plan cancelled",
  "subscription.cancelledNote": "Your access will continue until the current period ends.",

  // ---- Vibe: AnswerNoteSheet ----
  "vibe.added": "Added",
  "vibe.networkError": "Network error — please try again",
  "vibe.saveFailed": "Couldn't save",
  "vibe.tenSecondHint": "10 seconds — that's all it takes",
  "vibe.underReview": "Under review",
  "vibe.whyThisHelp":
    "Optional — share your reason in 10 seconds. This will show to everyone on your Soch Board (if it's turned on).",
  "vibe.whyThisTitle": "Tell us — why did you pick this?",
  "vibe.willShowAfterCheck": "This will show on your Soch Board once it's been checked.",
  "vibe.willShowOnBoard": "This will show on your Soch Board.",

  // ---- Vibe: PollCard ----
  "vibe.addReason": "Add a Reason (optional)",
  "vibe.answerHidden": "Your Soch Board is currently off — this answer won't show to anyone.",
  "vibe.answerVisible": "This answer will show to everyone on your Soch Board.",
  "vibe.peopleAnswered": "{count} people answered",
  "vibe.sameAsYou": "{count} thought the same as you",
  "vibe.sameThinking": "They thought the same too",
  "vibe.voteFailed": "Vote didn't go through",
  "vibe.yourAnswer": "Your answer",

  // ---- Vibe: SameVoteLeadVoiceSheet ----
  "vibe.recordingUnderReview": "Recording is under review",
  "vibe.sendVoiceNoteTo": "Send a voice note to {name}",
  "vibe.voiceCountsAsInterest":
    "A 10-second note like this counts as one Interest, from your monthly quota.",
  "vibe.voiceNoteFailed": "Couldn't send the voice note",
  "vibe.voiceNoteSent": "Voice note sent to {name}",
  "vibe.willReachAfterCheck": "This will reach them once it's been checked.",

  // ---- Vibe: ShareSochBoardCard ----
  "vibe.createShareLink": "Create Share Link",
  "vibe.linkFailed": "Couldn't create the link",

  // ---- Vibe: SochBoardList ----
  "vibe.sochBoardList.empty": "No poll answers yet.",

  // ---- Vibe: SochBoardVisibilityToggle ----
  "vibe.sochBoardVisibilityToggle.ariaLabel": "Soch Board visibility",
  "vibe.sochBoardVisibilityToggle.description": "When this is off, nobody can see your poll answers.",
  "vibe.sochBoardVisibilityToggle.networkError": "Network error — please try again",
  "vibe.sochBoardVisibilityToggle.saveError": "Couldn't save",
  "vibe.sochBoardVisibilityToggle.title": "Show my Soch Board",
};

export default misc;
