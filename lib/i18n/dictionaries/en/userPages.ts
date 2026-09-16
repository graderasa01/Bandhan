/**
 * English copy for the `/user/*` page-level screens (headings, empty states,
 * safety notes) converted from inline Hinglish. Component-level copy lives in
 * `userComponents.ts` / `featureComponents.ts` — this file only covers text
 * that lives directly in each route's `page.tsx`.
 */
const userPages: Record<string, string> = {
  // app-setup
  "userPages.appSetup.title": "Login & App Setup",
  "userPages.appSetup.subtitle":
    "Change your login password, install the app, and set a private screen-lock PIN.",
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
  "userPages.boost.feature3Label": "Earned, never sold",
  "userPages.boost.feature3Detail":
    "You get it by finishing today's voice quest. Boost's effect is small, and charging for something that small would not be fair.",

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
  "userPages.subscription.title": "Pass & Unlocks",
  "userPages.subscription.subtitle": "Finding a match is free. You pay in only two places — to open one match's chat, or for a month's Pass.",
  "userPages.subscription.freeTitle": "Always free",
  "userPages.subscription.unlockTitle": "Chat Unlock",
  "userPages.subscription.unlockPer": "/ one match",
  "userPages.subscription.unlockBody": "Open it inside the chat once you match. One unlock opens the chat for both of you.",
  "userPages.subscription.unlockRefund": "You wrote, but got no reply within {hours} hours — the unlock comes back (up to {cap} times every {days} days).",
  "userPages.subscription.unlockCredits": "Free unlocks you have: {n} — use them in any match's chat.",
  "userPages.subscription.unlockCovered": "Your plan opens every match's chat — no separate unlock needed.",
  "userPages.subscription.goToMessages": "Go to Messages",
  "userPages.subscription.passTitle": "A month's Pass",
  "userPages.subscription.passSubtitle": "For when you are talking to several matches at once. It never renews on its own.",
  "userPages.subscription.testMode": "Test Mode — payments are currently on a dummy gateway",
  "userPages.subscription.noPlans": "No plans are available right now.",
  "userPages.subscription.itemsTitle": "One-time things",
  "userPages.subscription.itemsSubtitle": "Don't need a whole plan? Get only the thing you need — no monthly bill.",
  "userPages.subscription.fullComparison": "Full comparison",
  "userPages.subscription.paymentNote":
    "Card details are never stored. Nothing renews on its own — you are never charged without asking.",

  // vibe
  "userPages.vibe.title": "Vibe",
  "userPages.vibe.subtitle": "One question, one poll, every day — your profile gets deeper without filling out a single form.",
  "userPages.vibe.streakSuffix": " days",
  "userPages.vibe.allDoneToday": "You're all caught up for now — a new question and poll arrive tomorrow.",
  "userPages.vibe.mySochBoard": "My Soch Board",
  "userPages.vibe.shareOnWhatsapp": "Share on WhatsApp",
};

export default userPages;
