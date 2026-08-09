/** Grio, Vibe Hub, Serious Circle, family, kundli, boost and notice components. */
const featureComponents: Record<string, string> = {
  // components/grio/SuggestedMessageCard.tsx

  // components/grio/GrioBubble.tsx

  // components/grio/GrioMatchPicker.tsx

  // components/grio/GrioMemoryPanel.tsx (grio.actionFailed, tryAgain, networkError are also
  // used by GrioActionChips.tsx and GrioChatCore.tsx)

  // components/grio/GrioActionChips.tsx

  // components/grio/GrioDeck.tsx

  // components/grio/GrioChatCore.tsx
  "grio.starterBio": "How do I write a good bio?",
  "grio.starterFirstTalk": "What should I ask in the first conversation?",
  "grio.starterFamily": "How do I convince my family?",
  "grio.starterFirstMessageTo": "What should I write as my first message to {name}?",
  "grio.starterIcebreaker": "Give me a good icebreaker line",
  "grio.starterReplyHelp": "Help me reply to their last message",
  "grio.starterSweetLine": "Suggest a sweet line or quote",
  "grio.starterHowIsThisMatch": "How good is this match for me?",
  "grio.starterWhatFits": "What's matching well between us?",
  "grio.starterWhatToWatch": "What should I pay attention to?",
  "grio.starterFirstQuestionTo": "What should I ask {name} first?",

  // components/grio/useGrioVoice.ts
  "voice.micNotSupported": "This browser doesn't support the mic — please type your question instead.",
  "voice.micDenied": "Mic permission wasn't granted. Allow it in your browser settings and try again.",
  "voice.micNoSpeech": "Didn't catch that — please try speaking again.",
  "voice.micNetwork": "A network issue stopped us from hearing you.",
  "voice.micUnknown": "The mic didn't work — please type your question instead.",

  // components/concierge/ConciergeChat.tsx
  "grio.conciergeSubtitle": "General guidance — not for deciding on any one profile",

  // components/vibe/ShareSochBoardCard.tsx (vibe.networkError is also used by the other vibe/ files below)

  // components/vibe/SameVoteLeadVoiceSheet.tsx (vibe.tenSecondHint is also used by AnswerNoteSheet.tsx)

  // components/vibe/PollCard.tsx

  // components/vibe/AnswerNoteSheet.tsx
};

export default featureComponents;
