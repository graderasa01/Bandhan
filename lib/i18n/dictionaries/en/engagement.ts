/** AI assistant, Ask Bridge, notices, shared links, generic UI states, and voice notes. */
const engagement: Record<string, string> = {
  // components/ai/AIButton.tsx
  "ai.button.ariaLabel": "AI Help",

  // components/ai/AIConfirmationCard.tsx
  "ai.confirmationCard.title": "Do you want to submit your profile?",
  "ai.confirmationCard.description": "Please review the details before you submit.",
  "ai.confirmationCard.confirmLabel": "Confirm",
  "ai.confirmationCard.cancelLabel": "Cancel",

  // components/ai/AIMissingFieldCard.tsx
  "ai.missingFieldCard.heightName": "Height",
  "ai.missingFieldCard.heightReason": "Add your height for better matches",
  "ai.missingFieldCard.cityName": "Current City",
  "ai.missingFieldCard.cityReason": "Your city is needed for location-based matches",
  "ai.missingFieldCard.preferenceName": "Partner Preference",
  "ai.missingFieldCard.preferenceReason": "Tell us your preference for suitable partner suggestions",
  "ai.missingFieldCard.title": "Missing Fields",
  "ai.missingFieldCard.addNow": "Add Now",
  "ai.missingFieldCard.askAI": "Ask AI",

  // components/ai/AIDrawer.tsx
  "ai.drawer.demoMessage1":
    "Hi! I can help you complete your profile. Would you like me to find out what details are missing?",
  "ai.drawer.demoMessage2": "Yes, tell me what's missing.",
  "ai.drawer.demoMessage3":
    "Right now your height, current city and family details are missing. What is your height?",
  "ai.drawer.demoAction1Title": "Complete My Profile",
  "ai.drawer.demoAction1Desc": "AI will ask you for the missing details",
  "ai.drawer.demoAction2Title": "Upload Biodata",
  "ai.drawer.demoAction2Desc": "Auto-fill from your biodata",
  "ai.drawer.defaultContextPage": "Dashboard",
  "ai.drawer.panelAriaLabel": "AI Assistant panel",
  "ai.drawer.title": "AI Assistant",
  "ai.drawer.currentPagePrefix": "Current Page: ",
  "ai.drawer.closeAriaLabel": "Close AI drawer",
  "ai.drawer.suggestedActions": "Suggested Actions",
  "ai.drawer.thinkingAriaLabel": "AI is thinking",
  "ai.drawer.thinkingText": "AI is thinking...",
  "ai.drawer.inputPlaceholder": "Type your message...",
  "ai.drawer.inputAriaLabel": "AI chat input",
  "ai.drawer.send": "Send",
  "ai.drawer.sendAriaLabel": "Send message",

  // components/askBridge/AnswerQuestionSheet.tsx
  "askBridge.answerSheet.sendFailedTitle": "Could not send your answer",
  "askBridge.answerSheet.reviewTitle": "Your answer is under review",
  "askBridge.answerSheet.sentTitle": "Answer sent",
  "askBridge.answerSheet.reviewDescription": "It will reach them as soon as it's checked.",
  "askBridge.answerSheet.identityRevealedPre": "Now you know it was ",
  "askBridge.answerSheet.someone": "someone",
  "askBridge.answerSheet.identityRevealedPost": ".",
  "askBridge.answerSheet.networkError": "Network error — please try again",
  "askBridge.answerSheet.declineFailedTitle": "That didn't work",
  "askBridge.answerSheet.title": "Answer the question",
  "askBridge.answerSheet.recorderHint": "10 seconds — answering also reveals who you are",
  "askBridge.answerSheet.sendButton": "Send Answer",
  "askBridge.answerSheet.skipButton": "Skip",

  // components/askBridge/AskQuestionSheet.tsx
  "askBridge.askSheet.sendFailedTitle": "Could not send your question",
  "askBridge.askSheet.alreadyAsked": "You have already asked them a question",
  "askBridge.askSheet.reviewTitle": "Your question is under review",
  "askBridge.askSheet.reviewDescription": "It will reach them as soon as it's checked.",
  "askBridge.askSheet.sentTitleSuffix": " — question sent",
  "askBridge.askSheet.networkError": "Network error — please try again",
  "askBridge.askSheet.titleSuffix": " — ask something",
  "askBridge.askSheet.explainer":
    "They will reply to you in voice — only then will they find out it was you who asked. Your identity is revealed only after they answer.",
  "askBridge.askSheet.placeholder": "Example: What do you enjoy about traveling?",
  "askBridge.askSheet.sendButton": "Send Question",

  // components/askBridge/PendingQuestions.tsx
  "askBridge.pendingQuestions.title": "Questions received",
  "askBridge.pendingQuestions.askedSuffix": " asked this",
  "askBridge.pendingQuestions.answerButton": "Answer",
  "askBridge.pendingQuestions.reportTargetLabel": "This question",

  // components/notice/NoticeBell.tsx
  "notice.bell.inboxWithCountPre": "Inbox — ",
  "notice.bell.inboxWithCountPost": " new",
  "notice.bell.inbox": "Inbox",

  // components/notice/NoticeList.tsx
  "notice.list.timeNow": "just now",
  "notice.list.timeMin": " min ago",
  "notice.list.timeHours": " hours ago",
  "notice.list.timeDays": " days ago",
  "notice.list.timeMonths": " months ago",
  "notice.list.emptyTitle": "Nothing new right now",
  "notice.list.emptyDescription":
    "When someone reacts to your profile — a voice note, a question, or family activity — it will show up here.",
  "notice.list.newSuffix": " new",
  "notice.list.markAllRead": "Mark All Read",

  // components/notice/PushOptIn.tsx
  "notice.pushOptIn.reasonUnsupported": "This browser does not support push notifications.",
  "notice.pushOptIn.reasonInsecureContext": "Notifications need HTTPS.",
  "notice.pushOptIn.reasonFailed": "Could not turn notifications on. Please try again.",
  "notice.pushOptIn.loading": "Checking notification settings…",
  "notice.pushOptIn.offTitle": "Get notified even when the app is closed",
  "notice.pushOptIn.offDescription":
    "When a new match, voice note, or question arrives, you'll know right away on your phone. Names are never shown in the notification — just that something has arrived.",
  "notice.pushOptIn.turnOn": "Turn On Notifications",
  "notice.pushOptIn.onTitle": "Notifications are on",
  "notice.pushOptIn.onMultiDevice": " devices.",
  "notice.pushOptIn.onSingleDevice": "On for this device.",
  "notice.pushOptIn.testSentPre": " Test sent — ",
  "notice.pushOptIn.testSentPost": " devices received it.",
  "notice.pushOptIn.testSentNone":
    " Test sent, but it did not reach any device. Please check BandhanTak's notifications in your phone settings.",
  "notice.pushOptIn.sendTest": "Send Test",
  "notice.pushOptIn.turnOff": "Turn Off",
  "notice.pushOptIn.deniedTitle": "Notifications are blocked",
  "notice.pushOptIn.deniedDescription":
    'Your browser has blocked notifications for this site, so the app cannot ask again from here. Tap the lock icon (🔒) in the address bar, allow "Notifications", then refresh the page.',
  "notice.pushOptIn.tryAgain": "Try Again",

  // components/share/SharedProfileView.tsx
  "share.profileView.sharedByPre": " shared this · ",
  "share.profileView.photoVerified": "Photo verified",
  "share.profileView.mobileVerified": "Mobile verified",
  "share.profileView.trustScore": "Trust score ",
  "share.profileView.tagline": "BandhanTak — AI-powered verified matrimony",
  "share.profileView.taglineSub": "Verified profiles, trust scores, and a privacy-first journey to marriage.",
  "share.profileView.explore": "Explore BandhanTak",

  // components/share/ShareLinkInactiveCard.tsx
  "share.linkInactiveCard.expiredDescription":
    "This link closes on its own after 30 days — for safety, so no old link stays open forever.",
  "share.linkInactiveCard.revokedDescription": "The person who created this link has closed it.",
  "share.linkInactiveCard.title": "This link is no longer active",
  "share.linkInactiveCard.homeLink": "Go to BandhanTak",

  // components/share/SharedSochBoardView.tsx
  "share.sochBoardView.titleSuffix": "'s Soch Board",
  "share.sochBoardView.subtitle": "Their thoughts on BandhanTak, in their own words",
  "share.sochBoardView.footer": "BandhanTak — AI-guided, verified matrimony",

  // components/states/BlockedState.tsx
  "states.blockedState.unauthorizedTitle": "You don't have access to this page.",
  "states.blockedState.unauthorizedDescription": "You need to log in or have a different role to view this page.",
  "states.blockedState.unauthorizedAction": "Go to Dashboard",
  "states.blockedState.pendingPartnerTitle": "Your partner account is still waiting for approval.",
  "states.blockedState.pendingPartnerDescription":
    "You'll get dashboard access once approved. We'll review your application soon.",
  "states.blockedState.pendingPartnerAction": "Go to Home",
  "states.blockedState.suspendedTitle": "Your account is temporarily suspended.",
  "states.blockedState.suspendedDescription": "Your account is on hold due to an issue. Please contact our support team.",
  "states.blockedState.suspendedAction": "Contact Support",
  "states.blockedState.subscriptionLockedTitle": "A subscription is required.",
  "states.blockedState.subscriptionLockedDescription":
    "You need an active subscription to use this feature. View plans and activate one.",
  "states.blockedState.subscriptionLockedAction": "View Plans",
  "states.blockedState.profileIncompleteTitle": "Your profile is incomplete.",
  "states.blockedState.profileIncompleteDescription":
    "Complete your profile before accessing this section. Please add the required details.",
  "states.blockedState.profileIncompleteAction": "Complete Profile",

  // components/states/ErrorState.tsx
  "states.errorState.title": "Something went wrong",
  "states.errorState.message": "Please try again.",
  "states.errorState.retry": "Try Again",
  "states.errorState.goBack": "Go Back",

  // components/states/LoadingState.tsx
  "states.loadingState.defaultText": "Loading...",

  // components/states/MockDataBanner.tsx
  "states.mockDataBanner.ariaLabel": "Mock data notice",
  "states.mockDataBanner.text": "⚠ MOCK DATA — Demo only — Not real user data",

  // components/voice/ReceivedVoiceNotes.tsx
  "voice.receivedVoiceNotes.title": "Voice notes received",
  "voice.receivedVoiceNotes.unlockFailedTitle": "Can't open this right now",
  "voice.receivedVoiceNotes.viewPlans": "View Plans",
  "voice.receivedVoiceNotes.networkError": "Network error — please try again",
  "voice.receivedVoiceNotes.unhoneFallback": "They",
  "voice.receivedVoiceNotes.sentSuffix": " sent this",
  "voice.receivedVoiceNotes.identityHidden": "Name and profile will show after you unlock it",
  "voice.receivedVoiceNotes.reportAriaLabel": "Report",
  "voice.receivedVoiceNotes.listen": "Listen",
  "voice.receivedVoiceNotes.unlockWithCreditsPrefix": "Unlock — ",
  "voice.receivedVoiceNotes.unlockWithCreditsSuffix": " available",
  "voice.receivedVoiceNotes.unlock": "Unlock",
  "voice.receivedVoiceNotes.upgradeHint": "Upgrade your plan, or send a voice note in the reel to earn an unlock",
  "voice.receivedVoiceNotes.viewFullProfile": "View Full Profile",
  "voice.receivedVoiceNotes.reportTargetFallback": "This voice note",

  // components/voice/VoicePlayer.tsx
  "voice.player.lockedAriaLabel": "Locked",
  "voice.player.pauseAriaLabel": "Pause",
  "voice.player.playAriaLabel": "Play",
  "voice.player.secondsSuffix": "s",
  "voice.player.failed": "Could not play",

  // components/voice/VoiceRecorder.tsx
  "voice.recorder.defaultHint": "In 10 seconds, tell them what you liked about them",
  "voice.recorder.micAccessDenied": "Could not get mic access. Please allow the microphone in your browser settings.",
  "voice.recorder.uploadFailed": "Could not upload the recording.",
  "voice.recorder.networkError": "Network problem — please try again.",
  "voice.recorder.listenAriaLabel": "Listen to your recording",
  "voice.recorder.recordAgain": "Record Again",
  "voice.recorder.stopAriaLabel": "Stop recording",
  "voice.recorder.recordAriaLabel": "Record voice note",
  "voice.recorder.secondsRemainingSuffix": " seconds left",
  "voice.recorder.uploading": "Sending…",
};

export default engagement;
