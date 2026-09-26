/**
 * The words Grio's chips send — the web panel's own (components/grio/
 * GrioChatCore.tsx: GENERAL_STARTERS, SCOPED_STARTERS, CANDIDATE_STARTERS,
 * SHORTCUTS, the walkthrough's question). A chip is a question the member
 * would have typed; it goes through the same turn as typing. Labels on the
 * fixed rail are English (the app's CTA rule), the question stays Hinglish.
 */

export interface GrioChip {
  id: string;
  label: string;
  ask: string;
}

export const GENERAL_STARTERS: GrioChip[] = [
  { id: "bio", label: "Achhi bio kaise likhun?", ask: "Achhi bio kaise likhun?" },
  { id: "first-talk", label: "Pehli baat-cheet me kya poochun?", ask: "Pehli baat-cheet me kya poochun?" },
  { id: "family", label: "Family ko kaise convince karun?", ask: "Family ko kaise convince karun?" },
];

/** A match: helping write to someone who already said yes. `{name}` is theirs. */
export const MATCH_STARTERS: GrioChip[] = [
  { id: "first-message", label: "{name} ko pehla message kya likhun?", ask: "{name} ko pehla message kya likhun?" },
  { id: "icebreaker", label: "Ek achha icebreaker line do", ask: "Ek achha icebreaker line do" },
  { id: "reply", label: "Inke last message ka reply likhne me madad karo", ask: "Inke last message ka reply likhne me madad karo" },
  { id: "sweet", label: "Ek pyari line ya quote suggest karo", ask: "Ek pyari line ya quote suggest karo" },
];

/**
 * A profile: none of these asks Grio to decide — a starter the model must
 * refuse teaches the member the feature is broken. Stand-ins until the
 * profile's own chips arrive (`/api/grio/profile/:id`).
 */
export const CANDIDATE_STARTERS: GrioChip[] = [
  { id: "how", label: "Ye rishta mere liye kaisa hai?", ask: "Ye rishta mere liye kaisa hai?" },
  { id: "what-if", label: "Interest bhejun to kya hoga?", ask: "Interest bhejun to kya hoga?" },
  { id: "fits", label: "Kya cheezein match kar rahi hain?", ask: "Kya cheezein match kar rahi hain?" },
  { id: "question", label: "{name} se ek sawaal poochhna hai", ask: "{name} se ek sawaal poochhna hai" },
];

/** The fixed rail — same four, same order, every session, so the thumb learns where they are. */
export const SHORTCUTS: GrioChip[] = [
  { id: "pending", label: "My pending", ask: "Mera abhi kya pending hai?" },
  { id: "today", label: "Today's matches", ask: "Aaj ke rishtey kaise chal rahe hain?" },
  { id: "write", label: "Write a message", ask: "Kisi ko message likhne me meri madad karo" },
  { id: "improve", label: "Improve profile", ask: "Meri profile me kya sudhaar kar sakta hoon?" },
];

/** Asked at every stop of "Walk me through today" — identical each time, so no stop is compared to the last. */
export const WALK_ASK = "Is rishtey ko 3-4 line me bataiye, phir mujhe agla kadam sujhaiye.";

/** A card's "Ask Grio" — the same as saying the person's name. */
export const ASK_ABOUT = "{name} ke baare me batao";

export function fill(chip: GrioChip, name: string): GrioChip {
  return { ...chip, label: chip.label.replace("{name}", name), ask: chip.ask.replace("{name}", name) };
}
