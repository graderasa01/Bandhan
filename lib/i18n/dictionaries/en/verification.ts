/**
 * Human verification requests and badges (distinct from the automated
 * mobile/email OTP flow in verifyContact.*). components/admin/VerificationQueue.tsx,
 * components/verification/{MyVerificationRequests,VerificationBadgeList}.tsx,
 * app/admin/verification, app/user/verification, and the API routes under
 * app/api/admin/verification-checks and app/api/verification/requests.
 */
const verification: Record<string, string> = {
  // components/admin/VerificationQueue
  "verification.queue.title": "Human Verification",
  "verification.queue.pendingSuffix":
    "checks are pending. As soon as a result is recorded, both people will know — the outcome only shows on their own verification screen.",
  "verification.queue.noneOpen": "No checks are pending.",
  "verification.queue.requestedBySuffix": "requested this",
  "verification.queue.watchingSuffix": "is on it",
  "verification.queue.unassigned": "nobody has picked this up",
  "verification.queue.releaseAction": "Release",
  "verification.queue.takeAction": "I'll take this",
  "verification.queue.recordOutcomeAction": "Record outcome",
  "verification.queue.outcomeMatched": "Matched",
  "verification.queue.outcomeMismatch": "Mismatch",
  "verification.queue.outcomeIncomplete": "Could not complete",
  "verification.queue.evidenceLabel": "What was seen and found — for the team only",
  "verification.queue.resultNoteLabel": "One line both members will read (optional)",
  "verification.queue.resultNotePlaceholder": "e.g. Name and date of birth matched",
  "verification.queue.submitAction": "Submit",
  "verification.queue.actionFailedTitle": "Couldn't do that",
  "verification.queue.tryAgain": "Please try again.",
  "verification.queue.networkError": "Network error",

  // components/verification/MyVerificationRequests
  "verification.myRequests.actionFailedTitle": "Couldn't do that",
  "verification.myRequests.tryAgain": "Please try again.",
  "verification.myRequests.networkError": "Network error — please try again",
  "verification.myRequests.incomingHeading": "Requested from you",
  "verification.myRequests.incomingEmpty": "Nobody has asked you to prove anything yet.",
  "verification.myRequests.yourSharePrefix": "Your share is",
  "verification.myRequests.yourShareSuffix": "— charged if you say yes.",
  "verification.myRequests.noShare": "You don't pay anything. They're covering the cost.",
  "verification.myRequests.declineReasonPlaceholder": "Add a reason if you'd like (not required)",
  "verification.myRequests.confirmDeclineAction": "Confirm decline",
  "verification.myRequests.cancelAction": "Cancel",
  "verification.myRequests.acceptWithSharePrefix": "Yes —",
  "verification.myRequests.acceptWithShareSuffix": "paying",
  "verification.myRequests.acceptAction": "Yes, go ahead",
  "verification.myRequests.declineAction": "No",
  "verification.myRequests.outgoingHeading": "Requested by you",
  "verification.myRequests.outgoingEmpty":
    "You haven't requested anything yet. You can request one from inside a rishta.",
  "verification.myRequests.withdrawAction": "Withdraw",
  "verification.myRequests.status.awaitingPayment": "payment pending",
  "verification.myRequests.status.awaitingSubject": "waiting on their answer",
  "verification.myRequests.status.accepted": "check in progress",
  "verification.myRequests.status.declined": "they declined",
  "verification.myRequests.status.cancelled": "withdrawn",
  "verification.myRequests.status.expired": "expired",
  "verification.myRequests.status.completed": "completed",

  // components/verification/VerificationBadgeList
  "verification.badgeList.empty": "No check has been done yet.",
  "verification.badgeList.expiredSuffix": "it became outdated.",

  // app/admin/verification/page
  "verification.adminPage.title": "Photo Verification",
  "verification.adminPage.pendingSuffix":
    "photos are pending review. As soon as you approve, the user's trust score goes up and a verified badge appears on their profile.",
  "verification.adminPage.allReviewed": "All photos have been reviewed.",

  // app/user/verification/page
  "verification.userPage.title": "Verification",
  "verification.userPage.intro":
    "Every badge says exactly as much as was checked — no more, no less. What was checked and when is written under every badge.",
  "verification.userPage.badgesHeading": "Your badges",
  "verification.userPage.disclosureNote":
    "No copy of your document is kept in the app — the team looks at it, records the outcome, and only that is shown.",
  "verification.userPage.verifyContactLink": "Verify mobile/email",
  "verification.userPage.verifyContactSuffix": "you can do yourself.",

  // API routes (app/api/admin/verification-checks, app/api/verification/requests)
  "verification.api.invalidRequest": "That request isn't valid.",
};

export default verification;
