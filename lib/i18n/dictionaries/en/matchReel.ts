/**
 * Reel/match-explanation copy generated in the service layer (not JSX) —
 * lib/data/reelData.ts, lib/services/match/fitBreakdown.ts,
 * lib/services/match/contactShare.ts, lib/services/match/withdrawInterest.ts.
 *
 * Several keys are deliberately short label/prefix/suffix fragments rather
 * than full sentences: the source function builds its string by concatenating
 * a translated fragment around a dynamic value (a city name, an hour count, a
 * candidate's stated hobby), so the English text has to slot into the same
 * position and still read as a normal sentence.
 */
const matchReel: Record<string, string> = {
  // reelData.ts — computeSharedTags: shared-detail chips on a Reel card
  "matchReel.sharedTag.sameCity": "Same city",
  "matchReel.sharedTag.bothDiet": "Both",
  "matchReel.sharedTag.commonHobby": "Common hobby",

  // reelData.ts — buildMissionSuggestion: the opening line suggested for a voice note
  "matchReel.mission.suggestHobby.prefix": "Tell them you also enjoy",
  "matchReel.mission.suggestHobby.suffix": "too.",
  "matchReel.mission.suggestCity.prefix": "Tell them you're both in the same city —",
  "match.mission.headlineSuffix": "% match — one of today's strongest rishtas",
  "matchReel.mission.suggestDiet": "Tell them your food habits match.",
  "matchReel.mission.suggestStrength.prefix": "Tell them you liked this about their profile —",
  "matchReel.mission.suggestGeneric": "Tell them what you liked about their profile.",

  // reelData.ts — toCard: compatibility segment labels + fallback name
  "matchReel.segment.preference": "Preferences",
  "matchReel.segment.deepFit": "Mindset Fit",
  "matchReel.segment.trust": "Trust",
  "matchReel.segment.activity": "Activity",
  "matchReel.card.fallbackName": "Profile",

  // reelData.ts — getReelData: empty state when no candidates are left
  "matchReel.reel.empty.title": "No suitable matches right now.",
  "matchReel.reel.empty.description": "Complete your profile and check back soon.",

  // fitBreakdown.ts — "Ye rishta kyun" score breakdown card
  "matchReel.fitBreakdown.preference.label": "Match with your preferences",
  "matchReel.fitBreakdown.preference.hint":
    "How well this matches what you asked for in a partner — city, education, religion/caste preference, and deal breakers.",
  "matchReel.fitBreakdown.trust.label": "Trust",
  "matchReel.fitBreakdown.trust.hint":
    "How verified and complete their profile is. This is their own trust score — it has nothing to do with you.",
  "matchReel.fitBreakdown.activity.label": "How active they are",
  "matchReel.fitBreakdown.activity.hint":
    "How active they have been recently. People who are active right now tend to reply faster.",
  "matchReel.fitBreakdown.soch.label": "Mindset match",
  "matchReel.fitBreakdown.soch.hint": "How similarly you both answered Vibe Hub polls and mindset questions.",

  // contactShare.ts — agreeToShareContact error messages
  "matchReel.contactShare.matchNotFound": "Match not found.",
  "matchReel.contactShare.noMobile": "Add your mobile number first — then you can share it.",

  // withdrawInterest.ts — withdrawInterest error messages
  "matchReel.withdrawInterest.notFound": "Interest not found.",
  "matchReel.withdrawInterest.alreadyWithdrawn": "This interest has already been withdrawn.",
  "matchReel.withdrawInterest.alreadyAnswered": "This has already been answered, so it can no longer be withdrawn.",
  "matchReel.withdrawInterest.tooLate.prefix": "You can withdraw an interest only within",
  "matchReel.withdrawInterest.tooLate.suffix": "hours of sending it.",
};

export default matchReel;
