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
    "How well this matches what you asked for in a partner — city, education, religion/community preference, children, living arrangement, relocation and your non-negotiables. Anything you marked \"Must match\" counts for more.",
  "matchReel.fitBreakdown.trust.label": "Trust",
  "matchReel.fitBreakdown.trust.hint":
    "How verified and complete their profile is. This is their own trust score — it has nothing to do with you.",
  "matchReel.fitBreakdown.activity.label": "How active they are",
  "matchReel.fitBreakdown.activity.hint":
    "How active they have been recently. People who are active right now tend to reply faster.",
  "matchReel.fitBreakdown.soch.label": "Mindset match",
  "matchReel.fitBreakdown.soch.hint": "How often the two of you gave the same answer on the life questions, the Vibe Hub polls and the mindset questions.",

  // contactShare.ts — agreeToShareContact error messages
  "matchReel.contactShare.matchNotFound": "Match not found.",
  "matchReel.contactShare.noMobile": "Add your mobile number first — then you can share it.",

  // withdrawInterest.ts — withdrawInterest error messages
  "matchReel.withdrawInterest.notFound": "Interest not found.",
  "matchReel.withdrawInterest.alreadyWithdrawn": "This interest has already been withdrawn.",
  "matchReel.withdrawInterest.alreadyAnswered": "This has already been answered, so it can no longer be withdrawn.",
  "matchReel.withdrawInterest.tooLate.prefix": "You can withdraw an interest only within",
  "matchReel.withdrawInterest.tooLate.suffix": "hours of sending it.",

  // Preference evidence — what a missing preference is allowed to say
  "matchReel.card.preferenceNotProvided": "General suggestion — no preference match was calculated.",
  "matchReel.card.preferencePartial": "There is too little on this profile to compare with your preferences.",
  "matchReel.fitBreakdown.preference.notProvided": "You haven't stated any partner preferences yet, so \"match with your preferences\" is not part of this ranking — it was ranked on the other signals alone.",
  "matchReel.fitBreakdown.preference.partial": "So few of the preferences you stated could be checked on this profile that no reliable comparison is possible — so this part was left out of the ranking rather than guessed at.",
  "matchReel.preferenceNotice.cta": "Tell us 2 preferences",
  "matchReel.preferenceNotice.notProvided.title": "You haven't stated your partner preferences yet.",
  "matchReel.preferenceNotice.notProvided.body": "These are general suggestions — no preference match was calculated. Telling us makes your matches far more relevant.",
  "matchReel.preferenceNotice.partial.title": "We know one of your preferences — a reliable comparison needs one more.",
  "matchReel.preferenceNotice.partial.body": "For now profiles are showing as general suggestions. Add the age and city you are looking for and a preference match can be worked out.",

  // Guna milan on the Reel — shown only when the birth data supports it
  "matchReel.kundli.approximate": "Without a birth time Guna Milan stays approximate — the score is only worked out when both birth times are known.",
  "matchReel.kundli.incomplete": "The birth details aren't complete enough for Guna Milan — no score was worked out.",

  // Why this match — the deterministic reasons
  "matchReel.why.preference": "{score}% match with the partner preferences you stated.",
  "matchReel.why.sochPolls": "Same thinking on {agreed} of {common} Vibe polls.",
  "matchReel.why.sochSignals": "The same answer on {agreed} of {common} questions about life.",
  "matchReel.why.valueMindset": "Thinking: the same answer on {agreed} of {common} mindset questions.",
  "matchReel.why.valueSignal": "{label}: you both think alike here — and you each said so yourselves.",
  "matchReel.why.unclearBoth": "{label} — neither of you has answered this yet.",
  "matchReel.why.unclearClash": "{label} — your answers differ here; worth talking through.",
  "matchReel.why.unclearField": "{label} — this hasn't been shared yet.",
  "matchReel.why.unclearTheirs": "{label} — this hasn't been shared yet.",
  "matchReel.why.starterCity": "You are both in {city} — ask them about a favourite spot there.",
  "matchReel.why.starterHobby": "You both enjoy {hobby} — start there.",
  "matchReel.why.starterQuestion": "Just ask — \"{question}\"",
  "matchReel.why.starterStrength": "Tell them you liked this about them — {strength}",
  "matchReel.why.starterValue": "You think alike on \"{label}\" — ask them why it matters to them.",
  "match.mission.headlinePrefix": "Rank score ",
};

export default matchReel;
