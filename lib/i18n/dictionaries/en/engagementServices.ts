/**
 * Group E's service/data-layer copy — messaging nudges, voice notes, push,
 * safety (block/report), shared links, Soch Board/polls, quiz battles,
 * quests, rewards/celebrations, and Ask Bridge questions.
 *
 * These strings are generated inside plain TypeScript functions in
 * lib/services/*, not JSX, so they are threaded through an optional
 * `t: Translate` parameter rather than a component-level `useT()`/`getT()`
 * call. See each service file for the exact call site.
 */
const engagementServices: Record<string, string> = {
  // Ghosting Shield (lib/services/messages/ghostingShieldService.ts)
  "ghosting.notice.title": "You have a reply pending",
  "ghosting.notice.bodySuffix": " sent you a message — a quick reply can move things forward.",

  // Voice notes — masked teaser fragments (lib/services/voice/voiceNoteService.ts)
  // English doesn't need a gendered "ki"/"ke" article, so these translate to nothing.
  "voice.teaser.suffixKi": "",
  "voice.teaser.suffixKe": "",
  "voice.teaser.citySuffix": ",",
  "voice.teaser.yearsSuffix": " years old",
  "voice.teaser.someone": "Someone",
  "voice.teaser.questionAnswer": "Answer to your question",

  // Voice notes — notices
  "voice.notice.answered.fallbackName": "They",
  "voice.notice.answered.title": "Your question has an answer",
  "voice.notice.answered.bodySuffix": " answered your question with a voice note.",
  "voice.notice.received.title": "Someone sent you a voice note",
  "voice.notice.received.bodyMiddle": " saw your profile and recorded ",
  "voice.notice.received.bodySuffix": " seconds for you.",

  // Voice notes — send/unlock errors
  "voice.send.error.featureOff": "Voice notes are not available right now.",
  "voice.send.error.self": "You cannot send a voice note to yourself.",
  "voice.send.error.notFound": "This profile is not available right now.",
  "voice.send.error.recordingMissing": "Recording not found — please record again.",
  "voice.send.error.rejected": "This recording cannot be sent.",
  "voice.send.error.alreadySentAsset": "This recording has already been sent.",
  "voice.send.error.alreadySentPair": "You have already sent this person a voice note.",
  "voice.unlock.error.notFound": "This voice note is not available.",
  "voice.unlock.error.locked": "Upgrade your plan to open voice notes, or complete a mission to win an unlock.",

  // Safety — block (lib/services/safety/blockService.ts)
  "safety.block.error.self": "You cannot block yourself.",
  "safety.block.error.userNotFound": "User not found.",

  // Safety — report (lib/services/safety/reportService.ts)
  "safety.report.error.self": "You cannot report yourself.",
  "safety.report.error.notFound": "Report not found.",

  // Shared links (lib/services/share/shareLinkService.ts)
  "share.error.profileNotFound": "Profile not found.",
  "share.rishtaCard.error.self": "Use the Biodata page to share your own profile.",
  "share.rishtaCard.error.notMatched": "Only a matched profile's Rishta Card can be shared.",
  "share.error.linkNotFound": "Link not found.",

  // Vibe — polls / Mindset Arena (lib/services/vibe/pollService.ts)
  "vibe.poll.error.notFound": "Poll not found.",
  "vibe.poll.error.invalidOption": "This option is not valid.",
  "vibe.sameVoteLead.fallbackName": "Profile",

  // Vibe — Soch Board answer notes (lib/services/vibe/sochBoardService.ts)
  "vibe.answerNote.error.noVoteYet": "Please answer this poll first.",
  "vibe.answerNote.error.recordingMissing": "Recording not found — please record again.",
  "vibe.answerNote.error.rejected": "This recording cannot be used.",
  "vibe.answerNote.error.alreadyUsed": "This recording has already been used.",

  // Quiz Battle (lib/services/quiz/quizBattleService.ts)
  "quiz.battle.error.matchNotFound": "Match not found.",
  "quiz.battle.error.alreadyActive": "A battle is already running.",
  "quiz.battle.error.notFound": "Battle not found.",
  "quiz.battle.error.selfInvite": "You already sent this invite.",
  "quiz.battle.error.invalidInvite": "This invite is no longer valid.",
  "quiz.battle.error.notActive": "This battle is not active right now.",
  "quiz.battle.error.invalidAnswer": "Invalid question or answer.",
  "quiz.battle.fallbackOtherName": "Their",

  // Quests (lib/services/quests/questService.ts)
  "quest.notice.titleSuffix": " — completed",
  "quest.notice.rewardGrantedSuffix": " received.",
  "quest.notice.alreadyHeldTooMuch": "You already have too many of these rewards to add more — use them first.",
  "quest.notice.dailyCapReached": "Today's rewards are done — one more tomorrow.",

  // Celebrations — lifetime firsts (lib/services/rewards/celebrationService.ts)
  "celebration.first.profile_live.title": "Your profile is live",
  "celebration.first.profile_live.subtitle": "You will now start appearing in the Rishta Reel.",
  "celebration.first.photo_verified.title": "Photo verified",
  "celebration.first.photo_verified.subtitle": "A verified photo raises your trust score.",
  "celebration.first.first_voice_note_sent.title": "Your first voice note is on its way",
  "celebration.first.first_voice_note_sent.subtitle": "A voice reply gets more responses than a written message.",
  "celebration.first.first_voice_note_received.title": "Someone sent you a voice note",
  "celebration.first.first_voice_note_received.subtitle": "They saw your profile and felt like talking.",
  "celebration.first.first_mutual_match.title": "Your first mutual match",
  "celebration.first.first_mutual_match.subtitle": "Both sides said yes — you can chat now.",
  "celebration.first.first_badge.title": "Your first Vibe Badge",
  "celebration.first.first_badge.subtitle": "This came from your own answers, not a guess.",
  "celebration.first.first_contact_shared.title": "Number shared",
  "celebration.first.first_contact_shared.subtitle": "This only happens after both sides say yes.",
  "celebration.first.first_question_asked.title": "Your first question",
  "celebration.first.first_question_asked.subtitle": "You will know as soon as it is answered.",
  "celebration.first.first_question_answered.title": "You answered your first question",
  "celebration.first.first_question_answered.subtitle": "Along with your answer, they now see who you are.",
  "celebration.first.first_parent_blessing.title": "Your family's blessing has arrived",
  "celebration.first.first_parent_blessing.subtitle":
    "This will now show on your profile — a real voice from a verified family member.",

  // Celebrations — repeatable rewards
  "celebration.reward.titleSuffixPlural": " received",
  "celebration.reward.titleSuffixSingular": " received",

  // Reward labels (lib/services/rewards/rewardService.ts)
  "reward.label.REEL_UNLOCK": "Extra match card",
  "reward.label.AI_ASK": "One AI question",
  "reward.label.VOICE_UNLOCK": "Open one voice note",
  "reward.label.BOOST": "24-hour profile boost",
  "reward.label.KUNDLI_UNLOCK": "One instant kundli",
  "reward.label.MATCH_EXPLAIN": "One question to Grio about a match",

  // Ask Bridge (lib/services/askBridge/profileQuestionService.ts)
  "askBridge.notice.asked.title": "Someone asked you a question",
  "askBridge.notice.asked.bodySuffix": " — answer with a voice note to find out who.",
  "askBridge.ask.error.length": "Your question must be between 1 and 300 characters.",
  "askBridge.ask.error.featureOff": "Ask Bridge is not available right now.",
  "askBridge.ask.error.self": "You cannot ask yourself a question.",
  "askBridge.ask.error.notFound": "This profile is not available right now.",
  "askBridge.ask.error.rejected": "This question cannot be sent.",
  "askBridge.answer.error.notFound": "This question is not available.",
  "askBridge.answer.error.expired": "This question has expired.",
  "askBridge.answer.error.recordingMissing": "Recording not found — please record again.",
  "askBridge.answer.error.rejected": "This recording cannot be sent.",
  "askBridge.answer.error.alreadyUsed": "This recording has already been used.",
};

export default engagementServices;
