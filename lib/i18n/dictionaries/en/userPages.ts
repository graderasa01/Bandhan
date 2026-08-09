/**
 * English copy for the `/user/*` page-level screens (headings, empty states,
 * safety notes) converted from inline Hinglish. Component-level copy lives in
 * `userComponents.ts` / `featureComponents.ts` — this file only covers text
 * that lives directly in each route's `page.tsx`.
 */
const userPages: Record<string, string> = {
  // app-setup
  "userPages.appSetup.title": "App Setup",
  "userPages.appSetup.subtitle":
    "Set it up once — after that it's just an icon tap and your 4-digit PIN. No typing URLs, no logging in again and again.",
  "userPages.appSetup.backToDashboard": "Back to Dashboard",

  // boost
  "userPages.boost.title": "Profile Boost",
  "userPages.boost.serviceTag": "BandhanTak Service",
  "userPages.boost.subtitle": "For 24 hours, your profile shows up a little higher in everyone else's Rishta Reel.",
  "userPages.boost.whatYouGetTitle": "What this service gives you",
  "userPages.boost.feature1Label": "+15% boost in Reel ranking",
  "userPages.boost.feature1Detail":
    "A bounded +15% on the Reel ranking's recency signal (capped at 100) — for 24 hours.",
  "userPages.boost.feature2Label": "Trust score is never overtaken",
  "userPages.boost.feature2Detail":
    "Match-fit and trust score are never overtaken — boost is just a small nudge, never a false guarantee.",
  "userPages.boost.feature3Label": "Earn it, or get it with a plan",
  "userPages.boost.feature3Detail": "Earn it (today's voice quest), or get it permanently with a Standard/Premium plan.",
  "userPages.boost.viewPlansCta": "View Standard & Premium",

  // concierge
  "userPages.concierge.upgradeMessage": "Grio opens up on our paid plans.",

  // deep-profile
  "userPages.deepProfile.title": "Deep Profile",
  "userPages.deepProfile.subtitle":
    "13 dimensions that matter for matching — built only from your own answers, nothing is ever invented.",

  // deep-profile/report
  "userPages.deepProfileReport.title": "Deep Compatibility Report",
  "userPages.deepProfileReport.printHint": "Choose “Save as PDF” in the print dialog to send this to family.",
  "userPages.deepProfileReport.descPre": "These ",
  "userPages.deepProfileReport.descMid": " dimensions for ",
  "userPages.deepProfileReport.descPost":
    " are drawn straight from their own profile fields — the AI never invents anything, only what they've shared.",
  "userPages.deepProfileReport.dimensionsHeading": "Dimensions",
  "userPages.deepProfileReport.unknownLabel": "Not known yet",
  "userPages.deepProfileReport.footer": "BandhanTak.com — Deep Compatibility Report",

  // family
  "userPages.family.title": "Family Circle",
  "userPages.family.subtitle":
    "Add Papa, Mummy, or a sibling — they can see your matches and shortlist, and share their opinion. Chat is never shown to them.",

  // inbox
  "userPages.inbox.title": "For You",
  "userPages.inbox.subtitle": "Everything that's happened on your profile — in one place.",

  // interests
  "userPages.interests.title": "Interests",
  "userPages.interests.subtitle": "An overview of received and sent interests.",
  "userPages.interests.safetyNote":
    "Only accept interests from verified profiles. Never share personal details in chat.",

  // matches
  "userPages.matches.title": "Matches",
  "userPages.matches.subtitle": " profiles have matched — verified profiles with trust scores.",
  "userPages.matches.emptyTitle": "No matches yet.",
  "userPages.matches.emptyDescription": "Complete and verify your profile so you get better matches.",
  "userPages.matches.safetyNote":
    "Matches are generated from trusted profiles. Complete your deep profile to improve AI match quality.",

  // messages
  "userPages.messages.title": "Messages",
  "userPages.messages.subtitle": "Chat with your matched profiles.",
  "userPages.messages.emptyTitle": "No conversations yet.",
  "userPages.messages.emptyDescription": "Conversations show up here once you match — go explore Rishta Reel.",
  "userPages.messages.safetyNote":
    "For safe communication, don't share personal contact details in chat. Report any suspicious activity.",

  // profile-trust-score
  "userPages.trustScore.title": "Trust Score",
  "userPages.trustScore.improveHeading": "How to Improve Your Trust Score",
  "userPages.trustScore.pointsPre": "(+",
  "userPages.trustScore.pointsPost": " points)",
  "userPages.trustScore.improveWithAi": "Improve with AI",
  "userPages.trustScore.backToDashboard": "Back to Dashboard",

  // profile/[id]
  "userPages.profileView.previewReel": "Preview My Reel",
  "userPages.profileView.kundliCta": "Want to see the kundli match?",
  "userPages.profileView.kundliCtaBody": "Just fill in your Date of Birth — the 36-guna calculation will be done automatically.",
  "userPages.profileView.sochBoard": "Soch Board",

  // profile/preview
  "userPages.reelPreview.goBack": "Go Back",
  "userPages.reelPreview.title": "Your Reel Card",
  "userPages.reelPreview.subtitle": "This is what strangers see when they swipe to you",
  "userPages.reelPreview.noPhotoTitle": "Add a photo",
  "userPages.reelPreview.noPhotoBody": "Upload at least one photo first to see your Reel card.",
  "userPages.reelPreview.goToProfile": "Go to My Profile",

  // shortlist
  "userPages.shortlist.title": "My Shortlist",
  "userPages.shortlist.subtitle":
    "Profiles you swiped down on in the Reel are saved here. No one else can see them.",
  "userPages.shortlist.emptyTitle": "Your shortlist is empty right now.",
  "userPages.shortlist.emptyDescription":
    "Swipe down on a profile in Rishta Reel — it'll be saved here so you can talk it over with family before deciding.",

  // subscription
  "userPages.subscription.title": "Subscription",
  "userPages.subscription.subtitle": "Choose the best plan for you. You may also get a discount on your first month through a partner referral.",
  "userPages.subscription.testMode": "Test Mode — payments are currently on a dummy gateway",
  "userPages.subscription.availablePlans": "Available plans",
  "userPages.subscription.noPlans": "No plans are available right now.",
  "userPages.subscription.fullComparison": "Full comparison",
  "userPages.subscription.paymentNote":
    "Card details are never stored. You can cancel your plan anytime — even after cancelling, you'll keep access for the period you already paid for.",

  // vibe
  "userPages.vibe.title": "Vibe",
  "userPages.vibe.subtitle": "One question, one poll, every day — your profile gets deeper without filling out a single form.",
  "userPages.vibe.streakSuffix": " days",
  "userPages.vibe.allDoneToday": "You're all caught up for now — a new question and poll arrive tomorrow.",
  "userPages.vibe.mySochBoard": "My Soch Board",
  "userPages.vibe.shareOnWhatsapp": "Share on WhatsApp",
};

export default userPages;
