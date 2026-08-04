/**
 * Suggested prompts for Parent Voice Blessing. A free-form "record 10
 * seconds" invite tends to produce a vague "sab theek hai, khush raho" clip
 * that says nothing useful — a fixed set of prompts nudges toward something
 * specific without forcing an answer to any one of them. Same "guide, don't
 * gate" discipline as `lib/profile/dailyQuestions.ts`'s gap questions.
 */
export interface BlessingPrompt {
  key: string;
  question: string;
}

export const BLESSING_PROMPTS: BlessingPrompt[] = [
  { key: "best_quality", question: "Iski sabse achhi baat kya hai?" },
  { key: "family_values", question: "Ghar mein iski soch aur values kaisi hain?" },
  { key: "what_makes_special", question: "Kaunsi cheez ise sabse khaas banati hai?" },
  { key: "blessing", question: "Iske liye aapka aashirwad kya hai?" },
];
