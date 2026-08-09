/**
 * Profile-related service/data layer — incognito, photo slides, submit,
 * voice self-fill access, deep profile analysis, the candidate profile
 * view builder, and the legacy AI drawer mock data.
 */
const profileServices: Record<string, string> = {
  // Incognito browsing (lib/services/profile/incognitoService.ts)
  "profileServices.incognito.premiumRequired": "Incognito browsing is available on the Premium plan.",
  "profileServices.incognito.profileRequired": "Please create your profile first.",

  // Photo slides (lib/services/profile/photoSlides.ts)
  "profileServices.photo.noteTooLong": "character limit exceeded.",
  "profileServices.photo.notFound": "Photo not found.",
  "profileServices.photo.invalidFocalY": "Position must be between 0 and 100.",
  "profileServices.photo.profileNotFound": "Profile not found.",
  "profileServices.photo.notApproved": "Only a verified photo can be added to the reel.",
  "profileServices.photo.limitReachedPrefix": "The reel can hold a maximum of",
  "profileServices.photo.limitReachedSuffix": "photos — remove one first.",

  // Submit (lib/services/profile/submitService.ts)
  "profileServices.submit.notStarted": "Your profile has not been started yet.",

  // Voice self-fill access (lib/services/profile/voiceAccessService.ts)
  "profileServices.voiceAccess.userNotFound": "User not found.",
  "profileServices.voiceAccess.alreadyPending": "Your request is already pending review.",
  "profileServices.voiceAccess.alreadyApproved": "You already have access.",
  "profileServices.voiceAccess.notPending": "This request is no longer pending.",

  // Deep profile analysis (lib/services/deepProfile/deepProfileService.ts)
  "profileServices.deepProfile.profileNotFound": "Profile not found.",
  "profileServices.deepProfile.noDimensionsAvailable": "No dimensions are available.",
  "profileServices.deepProfile.notEnoughSignal":
    "There are not enough confirmed answers yet to score this dimension.",
  "profileServices.deepProfile.analysisFailed": "The analysis could not be completed — please try again shortly.",
  "profileServices.deepProfile.parseError": "We could not understand the AI's response.",

  // Candidate profile view (lib/data/profileViewData.ts)
  "profileServices.profileView.years": "years",
  "profileServices.profileView.yearsUpTo": "years and below",
  "profileServices.profileView.lockedL1.title": "You'll see more once you send interest",
  "profileServices.profileView.lockedL1.description":
    "College, work city, native place, family details and what they're looking for in a partner — all of this appears as soon as you send interest.",
  "profileServices.profileView.lockedL2.title": "The full profile opens once you match",
  "profileServices.profileView.lockedL2.description":
    "Photo, caste, gotra, manglik status and income range are shown only once both sides say yes. The same protection applies to you.",
  "profileServices.profileView.defaultDisplayName": "Profile",

  "profileServices.profileView.section.overview": "At a Glance",
  "profileServices.profileView.section.educationWork": "Education and Work",
  "profileServices.profileView.section.family": "Family",
  "profileServices.profileView.section.lifestyle": "Lifestyle",
  "profileServices.profileView.section.tradition": "Tradition",
  "profileServices.profileView.section.partnerExpectation": "Partner Expectations",

  "profileServices.profileView.label.age": "Age",
  "profileServices.profileView.label.city": "City",
  "profileServices.profileView.label.maritalStatus": "Marital Status",
  "profileServices.profileView.label.height": "Height",
  "profileServices.profileView.label.nativePlace": "Native Place",
  "profileServices.profileView.label.motherTongue": "Mother Tongue",
  "profileServices.profileView.label.education": "Education",
  "profileServices.profileView.label.degree": "Degree",
  "profileServices.profileView.label.college": "College",
  "profileServices.profileView.label.work": "Work",
  "profileServices.profileView.label.company": "Company",
  "profileServices.profileView.label.workCity": "Work City",
  "profileServices.profileView.label.income": "Annual Income",
  "profileServices.profileView.label.familyType": "Family Type",
  "profileServices.profileView.label.father": "Father",
  "profileServices.profileView.label.mother": "Mother",
  "profileServices.profileView.label.siblings": "Siblings",
  "profileServices.profileView.label.familyValues": "Family Values",
  "profileServices.profileView.label.familyAbout": "About the Family",
  "profileServices.profileView.label.diet": "Diet",
  "profileServices.profileView.label.smoking": "Smoking",
  "profileServices.profileView.label.drinking": "Drinking",
  "profileServices.profileView.label.languages": "Languages",
  "profileServices.profileView.label.hobbies": "Hobbies",
  "profileServices.profileView.label.relocation": "Relocation",
  "profileServices.profileView.label.religion": "Religion",
  "profileServices.profileView.label.community": "Community",
  "profileServices.profileView.label.caste": "Caste",
  "profileServices.profileView.label.gotra": "Gotra",
  "profileServices.profileView.label.manglik": "Manglik",
  "profileServices.profileView.label.workExpectation": "About Work",

  // Legacy AI drawer mock data (lib/data/aiData.ts)
  "profileServices.ai.partner.greeting": "Hello! I can help you with your partner dashboard.",
  "profileServices.ai.partner.message":
    "Hello! You are currently tracking 24 leads. Would you like some referral tips?",
  "profileServices.ai.partner.action.label": "View Referral Tips",
  "profileServices.ai.partner.action.description": "Tips for better referrals",
  "profileServices.ai.admin.greeting": "Welcome to the admin panel.",
  "profileServices.ai.admin.message":
    "There are 12 pending partners and 56 pending commissions right now. Would you like to review them?",
  "profileServices.ai.admin.action.label": "View Pending Reviews",
  "profileServices.ai.admin.action.description": "Pending partners and commissions",
  "profileServices.ai.public.greeting": "Hello! Welcome to BandhanTak.",
  "profileServices.ai.public.message": "Would you like to create a profile or explore the partner program?",
  "profileServices.ai.public.action.label": "Create Free Profile",
  "profileServices.ai.public.action.description": "AI-guided registration",
  "profileServices.ai.mockResponse":
    "I understand your query. Right now, in this early phase, I'm giving demo responses. Full AI integration will be added soon.",
};

export default profileServices;
