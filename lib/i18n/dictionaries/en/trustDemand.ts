/**
 * Data/service-layer copy for the dashboard's AI Next Step card, the Trust
 * Score card/page, and the Rishta Demand meter — generated inside plain
 * functions in lib/data/userDashboardData.ts, lib/services/trust/trustScoreService.ts
 * and lib/services/demand/demandService.ts rather than in JSX.
 */
const trustDemand: Record<string, string> = {
  // Dashboard — AI Next Step card (lib/data/userDashboardData.ts aiNextStep())
  "dashboard.nextStep.basic.title": "Start With the Basics",
  "dashboard.nextStep.basic.message":
    "Add a few essentials like your name, age and height — it only takes two minutes.",
  "dashboard.nextStep.basic.cta": "Start With Voice",
  "dashboard.nextStep.family.title": "Add Family Details and Partner Preferences",
  "dashboard.nextStep.family.message": "This directly improves the quality of your matches.",
  "dashboard.nextStep.family.cta": "Continue",
  "dashboard.nextStep.photo.title": "Add a Photo",
  "dashboard.nextStep.photo.message": "Adding a photo raises your trust score and makes your profile look complete.",
  "dashboard.nextStep.photo.cta": "Add Photo",
  "dashboard.nextStep.explore.title": "Explore Matches",
  "dashboard.nextStep.explore.message": "Your profile is complete — start checking your daily matches.",
  "dashboard.nextStep.intelligence.cta": "Answer Questions",
  "dashboard.nextStep.explore.cta": "Open Rishta Reel",

  // Dashboard — interests preview empty state
  "dashboard.interests.emptyTitle": "No interests yet.",
  "dashboard.interests.emptyDescription":
    "Completing your profile and improving your trust score will bring more matches and interests.",

  // Dashboard — subscription card CTA
  "dashboard.subscription.managePlan": "Manage Plan",
  "dashboard.subscription.viewPlans": "View Plans",

  // Trust Score (lib/services/trust/trustScoreService.ts computeTrustScore())
  "trustScore.notCalculated": "Trust score has not been calculated yet. Complete your profile.",
  "trustScore.mobileVerified.label": "Mobile Verified",
  "trustScore.mobileVerified.description": "Your mobile number is verified.",
  "trustScore.mobileUnverified.label": "Verify Mobile",
  "trustScore.mobileUnverified.description": "Verify your mobile number with an OTP.",
  "trustScore.emailVerified.label": "Email Verified",
  "trustScore.emailVerified.description": "Your email is verified.",
  "trustScore.emailUnverified.label": "Verify Email",
  "trustScore.emailUnverified.description": "Verify it using the link sent to your email.",
  "trustScore.requiredComplete.label": "Required Fields Complete",
  "trustScore.requiredComplete.description": "All the required fields are filled in.",
  "trustScore.requiredIncomplete.label": "Required Fields Incomplete",
  "trustScore.requiredIncomplete.descriptionSuffix": " required fields are still left.",
  "trustScore.optionalFields.label": "Profile Details",
  "trustScore.optionalFields.descriptionSuffix": " fields are filled in.",
  "trustScore.photoUploaded.label": "Photo Uploaded",
  "trustScore.photoUploaded.description": "Your profile photo has been added.",
  "trustScore.photoVerified.label": "Photo Verified",
  "trustScore.photoVerified.description": "Your photo is verified.",
  "trustScore.photoPending.label": "Photo Verification Pending",
  "trustScore.photoPending.description": "Your photo is currently under review.",
  "trustScore.photoMissing.label": "Add a Photo",
  "trustScore.photoMissing.description": "Add a clear photo of your face.",
  "trustScore.education.addedLabel": "Education Added",
  "trustScore.education.addedDescription": "Your education details are filled in.",
  "trustScore.education.incompleteLabel": "Education Incomplete",
  "trustScore.education.incompleteDescription": "Add your education.",
  "trustScore.profession.addedLabel": "Profession Added",
  "trustScore.profession.addedDescription": "Your profession details are filled in.",
  "trustScore.profession.incompleteLabel": "Profession Incomplete",
  "trustScore.profession.incompleteDescription": "Add your profession.",
  "trustScore.family.addedLabel": "Family Details Added",
  "trustScore.family.addedDescription": "Your family background is filled in.",
  "trustScore.family.incompleteLabel": "Family Details Incomplete",
  "trustScore.family.incompleteDescription": "Add your family details.",
  "trustScore.preferences.addedLabel": "Partner Preferences Added",
  "trustScore.preferences.addedDescription": "Your partner preferences are set.",
  "trustScore.preferences.incompleteLabel": "Partner Preferences Incomplete",
  "trustScore.preferences.incompleteDescription": "Add your partner preferences.",
  "trustScore.message.scoreCanReachPre": " can take your score from ",
  "trustScore.message.scoreCanReachMid": " to ",
  "trustScore.message.scoreCanReachPost": ".",
  "trustScore.message.strong": "Your profile is very strong.",

  // Rishta Demand (lib/services/demand/demandService.ts getDemandSnapshot())
  "demand.blocked.noGender": "Nobody can find you without your gender filled in.",
  "demand.lever.gender.label": "Add Gender",
  "demand.lever.gender.detail": "Without this, you don't appear in anyone's list.",
  "demand.blocked.notLive": "Your profile is not live yet — so these people can't see you.",
  "demand.lever.goLive.label": "Make Your Profile Live",
  "demand.lever.goLive.detailPre": "As soon as you go live, you'll appear in the list for ",
  "demand.lever.goLive.detailPost": " people.",
  "demand.lever.dob.label": "Add Date of Birth",
  "demand.lever.dob.detailSuffix":
    " people are searching by age — without your date of birth, you won't appear in their list at all.",
  "demand.lever.city.labelReview": "Review City Preference",
  "demand.lever.city.labelAdd": "Add Current City",
  "demand.lever.city.detailWithCitySuffix":
    " people are looking in another city — you rank lower in their lists.",
  "demand.lever.city.detailNoCitySuffix":
    " people have set a city preference. Without your city filled in, you rank lower in their lists.",
  "demand.lever.education.labelComplete": "Complete Education Details",
  "demand.lever.education.labelAdd": "Add Education",
  "demand.lever.education.detailSuffix": " people's education preference does not match you right now.",
  "demand.lever.photo.labelVerify": "Get Your Photo Verified",
  "demand.lever.photo.labelAdd": "Add a Photo",
  "demand.lever.photo.detailVerifyPre":
    "A verified photo raises your trust score, and trust score counts in the ranking for these ",
  "demand.lever.photo.detailVerifyPost": " people.",
  "demand.lever.photo.detailAddPre": "Without a photo your trust score stays low — it counts in the ranking for these ",
  "demand.lever.photo.detailAddPost": " people.",
};

export default trustDemand;
