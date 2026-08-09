/**
 * Phase 2 (data/service layer) translations for Group F:
 * lib/services/payments/subscriptionService.ts, lib/services/boost/boostService.ts,
 * lib/services/matchmaker/matchmakerService.ts, lib/data/planData.ts,
 * lib/data/partnerData.ts.
 *
 * lib/services/verification/photoReviewService.ts is deliberately not
 * represented here — every literal string it returns is read only by the
 * admin/moderator who calls `reviewPhoto`, never by the profile owner.
 */
const partnerSubscription: Record<string, string> = {
  "plans.bullets.reelPrefix": "",
  "plans.bullets.reelSuffix": "matches every day",
  "plans.bullets.unlimitedInterest": "Unlimited interest",
  "plans.bullets.interestPerMonthSuffix": "interest/month",
  "plans.bullets.chatUnlock": "Chat unlock",
  "plans.bullets.chatLocked": "Chat locked",
  "plans.bullets.aiUnlimited": "Unlimited AI questions",
  "plans.bullets.aiPerDayPrefix": "",
  "plans.bullets.aiPerDaySuffix": "AI questions/day",
  "plans.bullets.familySeat": "family seat",
  "plans.bullets.photoUnlockAll": "Everyone's photo — no waiting for a match",
  "plans.bullets.boost": "Profile boost",
  "plans.bullets.photoEnhance": "AI Photo Enhance",
  "plans.bullets.photoUltraEnhance": "AI Ultra Realistic Enhance",
  "plans.bullets.kundliPdfExport": "Download and share Kundli PDF",
  "plans.bullets.grioVoice": "Talk to Grio by voice",
  "plans.bullets.matchExplain": "Ask Grio about one match",
  "plans.bullets.incognitoBrowse": "Incognito browsing",
  "plans.bullets.priorityVerification": "Priority verification",
  "plans.bullets.assistedMatchmaker": "Assisted matchmaker",
  // subscriptionService.ts — quoteCheckout/createCheckout/cancelSubscription
  "subscription.checkout.discountFirstMonth": "With a partner code, the first month is only",
  "subscription.checkout.discountThereafter": "After that,",
  "subscription.checkout.planUnavailable": "This plan is not available right now.",
  "subscription.checkout.startFailed": "Payment could not start — please try again in a little while.",
  "subscription.cancel.noActive": "There is no active subscription.",

  // boostService.ts — activateBoostFromReward
  "boost.reward.noCredit": "You don't have a boost credit right now.",
  "boost.reward.noProfile": "Profile not found.",

  // matchmakerService.ts — createMatchmakerRequest, updateMatchmakerRequestStatus
  "matchmaker.request.tooMany":
    "You already have open requests — our team is looking into them. Please don't send a new request right now.",
  "matchmaker.notice.title": "Work has started on your matchmaker request",
  "matchmaker.notice.body": "Our team will contact you soon.",

  // planData.ts — getPlanPreviews, getCommissionDisplayText
  "plan.limitations.noBoost": "No profile boost",
  "plan.partnerOffer.firstMonthPrefix": "With a partner code, the first month is only",
  "plan.partnerOffer.thereafterPrefix": "After that,",
  "plan.commission.prefix": "On every payment:",
  "plan.commission.suffix": "— on every renewal, too",
  "plan.commission.goldPrefix": "up to",
  "plan.commission.goldSuffix": "for Gold partners",

  // partnerData.ts — buildTimeline
  "partnerData.timeline.joined": "Joined",
  "partnerData.timeline.profileStarted": "Started profile",
  "partnerData.timeline.profileDone": "Completed profile",
  "partnerData.timeline.paid": "Took a plan",

  // partnerData.ts — stalledNote
  "partnerData.stalled.notStarted": "profile not started",
  "partnerData.stalled.incomplete": "profile still incomplete",
  "partnerData.stalled.noPlan": "no plan taken yet",
  "partnerData.stalled.noActivity": "no activity",
  "partnerData.stalled.daysUnit": "days:",
  "partnerData.stalled.weeksUnit": "weeks:",
  "partnerData.stalled.monthsUnit": "months:",

  // partnerData.ts — getPartnerLeadDetail's suggestedAction fallback
  "partnerData.suggestedAction.defaultReason": "Now is a good time to follow up.",

  // partnerData.ts — buildInsight
  "partnerData.insight.stalledTitle": "You could send them a reminder",
  "partnerData.insight.stalledMessage":
    "people have started their profile but not finished it. A small reminder often helps.",
  "partnerData.insight.inactiveTitle": "Some people haven't been active in a while",
  "partnerData.insight.inactiveMessage": "people haven't logged in for over a month.",
  "partnerData.insight.okTitle": "Everything's going well",
  "partnerData.insight.okMessage": "The people you referred are active and completing their profiles.",

  // partnerData.ts — getPartnerDashboardData
  "partnerData.metrics.sent": "People referred",
  "partnerData.metrics.paid": "Took a plan",
  "partnerData.metrics.totalEarned": "Total earned",
  "partnerData.metrics.upcoming": "Coming up",
  "partnerData.conversion.none": "You haven't referred anyone yet.",
  "partnerData.conversion.of": "total,",
  "partnerData.conversion.tookPlan": "took a plan",
};

export default partnerSubscription;
