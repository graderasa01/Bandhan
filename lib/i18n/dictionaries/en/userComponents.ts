/** Reel, profile, matches, messages, interests and subscription components. */
const userComponents: Record<string, string> = {
  // components/interests/InterestsTabs.tsx
  "interests.errorGeneric": "Something went wrong — please try again",
  "interests.accepted": "Interest accepted",
  "interests.declined": "Interest declined",
  "interests.networkError": "Network error — please try again",
  "interests.withdrawFailed": "Could not withdraw",
  "interests.withdrawn": "Interest withdrawn",
  "interests.tabReceived": "Received",
  "interests.tabSent": "Sent",
  "interests.withdrawnNote": "You withdrew this interest",
  "interests.sentToYou": "Sent you an interest",
  "interests.sentByYou": "Interest sent",
  "interests.viewProfile": "View Profile",
  "interests.accept": "Accept",
  "interests.decline": "Decline",
  "interests.withdrawInterest": "Withdraw interest",

  // components/messages/ContactShareCard.tsx

  // components/messages/ConversationListItem.tsx

  // components/messages/MessageThread.tsx

  // components/subscription/BoostStatusCard.tsx

  // components/subscription/ContextualUpgradeCard.tsx

  // components/subscription/MatchmakerRequestCard.tsx
  "subscription.matchmakerOpen": "Request sent",
  "subscription.matchmakerContacted": "Our team reached out",
  "subscription.matchmakerResolved": "Completed",

  // components/subscription/PlanCard.tsx
  "subscription.mostPopular": "Most Popular",
  "subscription.yourCurrentPlan": "Your Current Plan",
  "subscription.perMonth": "/ month",
  "subscription.perMonthShort": "month",
  "subscription.planActive": "Active",
  "subscription.pleaseWait": "Please wait…",
  // A live admin offer. The end date and the price after it always render
  // together — see PlanOfferModel for why that is not optional.
  "subscription.offerFreeUntil": "Free right now —",
  "subscription.offerUntil": "This price until",
  "subscription.offerTill": "",
  "subscription.offerThereafter": "After that",

  // components/subscription/PlanCheckoutGrid.tsx

  // components/subscription/PlanComparisonTable.tsx
  "subscription.rowReelPerDay": "Rishta Reel per day",
  "subscription.rowAllChats": "Every chat open (no Chat Unlock needed)",
  "subscription.rowGrioChat": "Questions to Grio",
  "subscription.rowAskAi": "Ask AI questions",
  "subscription.rowPhotoUnlock": "See photos without a match",
  "subscription.rowAdmirerIdentity": "See who shortlisted you — by name",
  "subscription.rowViewerIdentity": "See who viewed your profile — by name",
  "subscription.rowVoiceUnlock": "Open voice notes you receive",
  "subscription.rowKundliManual": "Instant Kundli Generator (manual entry)",
  "subscription.rowKundliPdf": "Kundli PDF download & share",
  "subscription.rowMatchExplain": "Chat with Grio about a match",
  "subscription.rowGrioMemory": "How much Grio remembers",
  "subscription.rowGrioVoice": "Talk to Grio by voice",
  "subscription.rowIncognito": "Incognito — browse without being seen",

  // components/subscription/SubscriptionStatusCard.tsx
  "subscription.statusActiveLine": "Your plan is active — it stops on its own after the end date, with no charge.",
  "subscription.statusCancelledLine": "Your plan runs until the end date, then stops on its own.",
  "subscription.statusExpiredLine": "Your plan has ended — you can get it again whenever you like.",
  "subscription.statusNoneLine": "You're on Free — matches, interests, search and photos are all free.",
  "subscription.statusGrantedLine": "The BandhanTak team gave you this plan — no payment was made.",

  // components/subscription/SubscriptionStatusPanel.tsx

  // components/user/DemandMeterCard.tsx
};

export default userComponents;
