/**
 * Quiz Battle's question bank. Code, not database — same reasoning as
 * `MINDSET_QUESTIONS` and `QUESTS`: content is a product decision someone
 * reviewed, not a row an admin can retype at 1am. A battle stores which
 * `key`s it picked (`QuizBattle.questionKeys`), never the question text
 * itself, so editing wording here never rewrites history.
 *
 * Fun and light on purpose — this sits *inside* an already-matched
 * conversation (see quizBattleService's header), so unlike Mindset Arena's
 * public polls these can be playful without needing to double as a public
 * "soch" statement anyone else will see.
 */

export interface QuizBattleQuestion {
  key: string;
  question: string;
  options: string[];
}

export const QUIZ_BATTLE_QUESTIONS: QuizBattleQuestion[] = [
  { key: "weekend", question: "Perfect weekend kaisa hai?", options: ["Ghar par relax", "Ghoomna-phirna", "Dosto ke saath", "Kuch naya seekhna"] },
  { key: "food", question: "Khaane me sabse zyada kya pasand hai?", options: ["Street food", "Ghar ka khana", "Restaurant", "Khud banana"] },
  { key: "movie", question: "Movie night me kya dekhenge?", options: ["Comedy", "Romance", "Thriller", "Documentary"] },
  { key: "travel", question: "Agla trip kahan?", options: ["Pahad", "Beach", "Foreign", "Apna hi sheher explore"] },
  { key: "morning", question: "Subah kaisi hoti hai?", options: ["Jaldi uth jaate hain", "Alarm 5 baar snooze", "Chai/coffee pehle", "Exercise se shuru"] },
  { key: "festival", question: "Sabse pasandida tyohaar?", options: ["Diwali", "Holi", "Eid", "Christmas"] },
  { key: "money", question: "Paise ko lekar approach?", options: ["Save karte hain", "Kharch karte hain", "Invest karte hain", "Plan banate hain"] },
  { key: "petpeeve", question: "Sabse zyada irritate kya karta hai?", options: ["Late aana", "Phone par busy rehna", "Gossip", "Messy jagah"] },
  { key: "music", question: "Gaadi me kya bajega?", options: ["Bollywood", "Punjabi", "English", "Classical/Sufi"] },
  { key: "surprise", question: "Surprise pasand hai ya plan?", options: ["Surprise pasand hai", "Plan pehle se pata ho", "Dono chalega", "Kabhi kabhi surprise"] },
];

export const QUESTIONS_PER_BATTLE = 5;

const QUESTION_BY_KEY = new Map(QUIZ_BATTLE_QUESTIONS.map((q) => [q.key, q]));

export function getQuizQuestion(key: string): QuizBattleQuestion | null {
  return QUESTION_BY_KEY.get(key) ?? null;
}

/** A fresh, random subset — order doesn't need to be stable across reads, only membership does. */
export function pickBattleQuestionKeys(): string[] {
  const shuffled = [...QUIZ_BATTLE_QUESTIONS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, QUESTIONS_PER_BATTLE).map((q) => q.key);
}
