import type { ReelCard, ReelFact } from "~/types/api";

/**
 * Sample people for `EXPO_PUBLIC_DATA_MODE=mock` — invented, not real
 * members, and without photos on purpose (no stranger's face ships inside the
 * app): cards render the designed placeholder portrait instead.
 */
interface Person {
  id: string;
  userId: string;
  name: string;
  age: number;
  city: string;
  education: string;
  profession: string;
  height: string;
  motherTongue: string;
  diet: string;
  familyType: string;
  about: string;
  hobbies: string[];
  trust: number;
  verified: boolean;
  nearby: boolean;
  seen: boolean;
  lock: ReelCard["photoLock"];
  rank: number;
  reasons: string[];
  starter: string;
  vibe?: string;
}

const PEOPLE: Person[] = [
  {
    id: "p_ananya", userId: "u_ananya", name: "Ananya Mehta", age: 27, city: "Jaipur", education: "MBA",
    profession: "Marketing Manager", height: `5'4"`, motherTongue: "Hindi", diet: "Veg", familyType: "Joint family",
    about: "Main family-oriented aur khush-mizaaj hoon. Weekend par purane Jaipur ki galiyan aur chai.",
    hobbies: ["Ghoomna", "Music", "Cooking"], trust: 86, verified: true, nearby: true, seen: false, lock: "open", rank: 88,
    reasons: ["Dono joint family me pale-badhe hain", "Dono ko ghoomna pasand hai", "Umar aapki preference ke andar hai"],
    starter: "Jaipur me aapki favourite chai ki jagah kaunsi hai?", vibe: "Planner",
  },
  {
    id: "p_priya", userId: "u_priya", name: "Priya Iyer", age: 26, city: "Bengaluru", education: "B.Tech",
    profession: "Software Engineer", height: `5'3"`, motherTongue: "Tamil", diet: "Veg", familyType: "Nuclear family",
    about: "Code, Carnatic music aur weekend treks. Seedhi baat karna pasand hai.",
    hobbies: ["Music", "Padhna", "Ghoomna"], trust: 78, verified: true, nearby: false, seen: false, lock: "open", rank: 81,
    reasons: ["Dono tech field me hain", "Dono ko music pasand hai"],
    starter: "Aapka last trek kaunsa tha?",
  },
  {
    id: "p_kavya", userId: "u_kavya", name: "Kavya Joshi", age: 28, city: "Pune", education: "CA",
    profession: "Chartered Accountant", height: `5'5"`, motherTongue: "Marathi", diet: "Veg", familyType: "Nuclear family",
    about: "Numbers ke saath kaam, logon ke saath dil. Yoga aur Marathi natak.",
    hobbies: ["Yoga", "Padhna"], trust: 82, verified: true, nearby: false, seen: true, lock: "open", rank: 76,
    reasons: ["Dono ki soch paison ko lekar milti hai", "Family values ek jaise"],
    starter: "Kaunsa Marathi natak sabse zyada yaad hai?",
  },
  {
    id: "p_sneha", userId: "u_sneha", name: "Sneha Agarwal", age: 25, city: "Delhi", education: "M.Sc",
    profession: "Teacher", height: `5'2"`, motherTongue: "Hindi", diet: "Veg", familyType: "Joint family",
    about: "Bachchon ko padhana mera sukoon hai. Ghar ke khane aur purani filmon ki shaukeen.",
    hobbies: ["Film", "Cooking", "Padhna"], trust: 74, verified: false, nearby: false, seen: false, lock: "match_only", rank: 72,
    reasons: ["Dono ko purani filmein pasand hain", "Dono joint family chahte hain"],
    starter: "Aapki all-time favourite purani film?",
  },
  {
    id: "p_riya", userId: "u_riya", name: "Dr. Riya Kapoor", age: 29, city: "Mumbai", education: "MBBS",
    profession: "Doctor", height: `5'6"`, motherTongue: "Punjabi", diet: "Egg khate hain", familyType: "Nuclear family",
    about: "Resident doctor, lambi shifts ke baad bhi hansi nahi chhodti. Sea-face walks.",
    hobbies: ["Ghoomna", "Photography"], trust: 90, verified: true, nearby: false, seen: false, lock: "open", rank: 84,
    reasons: ["Dono career ko barabar ahmiyat dete hain", "Trust score dono ka strong hai"],
    starter: "Lambi shift ke baad aap kaise relax karti hain?", vibe: "Straight talker",
  },
  {
    id: "p_neha", userId: "u_neha", name: "Neha Verma", age: 27, city: "Lucknow", education: "B.Com",
    profession: "Bank PO", height: `5'3"`, motherTongue: "Hindi", diet: "Veg", familyType: "Joint family",
    about: "Tehzeeb wala sheher, tehzeeb wali soch. Kitaabein aur kabab dono pasand.",
    hobbies: ["Padhna", "Cooking"], trust: 80, verified: true, nearby: true, seen: false, lock: "add_own_photo", rank: 79,
    reasons: ["Aap dono ek hi sheher se hain", "Dono ko padhna pasand hai"],
    starter: "Lucknow ki kaunsi jagah aapko sabse pyaari hai?",
  },
  {
    id: "p_isha", userId: "u_isha", name: "Isha Patel", age: 26, city: "Ahmedabad", education: "Graduate",
    profession: "UI/UX Designer", height: `5'4"`, motherTongue: "Gujarati", diet: "Jain veg", familyType: "Joint family",
    about: "Design, garba aur family dinners. Choti cheezon me khushi dhoondhti hoon.",
    hobbies: ["Photography", "Music", "Ghoomna"], trust: 77, verified: true, nearby: false, seen: false, lock: "open", rank: 74,
    reasons: ["Dono creative field me hain", "Dono ko photography pasand hai"],
    starter: "Navratri me aapka favourite garba kaunsa hai?",
  },
  {
    id: "p_meera", userId: "u_meera", name: "Meera Nair", age: 28, city: "Hyderabad", education: "M.Tech",
    profession: "Data Scientist", height: `5'5"`, motherTongue: "Malayalam", diet: "Non-veg", familyType: "Nuclear family",
    about: "Data se kahaniyan nikalna mera kaam hai. Monsoon, kaapi aur long drives.",
    hobbies: ["Ghoomna", "Padhna"], trust: 83, verified: true, nearby: false, seen: true, lock: "open", rank: 71,
    reasons: ["Dono data/tech me kaam karte hain"],
    starter: "Monsoon me aapki favourite drive kaunsi hai?",
  },
  {
    id: "p_pooja", userId: "u_pooja", name: "Pooja Singh", age: 27, city: "Noida", education: "LLB",
    profession: "Lawyer", height: `5'4"`, motherTongue: "Hindi", diet: "Non-veg", familyType: "Nuclear family",
    about: "Court me tez, ghar par narm. Badminton aur Sunday brunch.",
    hobbies: ["Sports", "Cooking"], trust: 75, verified: false, nearby: false, seen: false, lock: "open", rank: 69,
    reasons: ["Dono ko sports pasand hai"],
    starter: "Badminton me aapka partner kaun hota hai?",
  },
  {
    id: "p_tanvi", userId: "u_tanvi", name: "Tanvi Deshmukh", age: 25, city: "Nagpur", education: "B.Pharm",
    profession: "Pharmacist", height: `5'2"`, motherTongue: "Marathi", diet: "Veg", familyType: "Joint family",
    about: "Sehat aur sukoon — dono ka khayal rakhti hoon. Gardening meri therapy hai.",
    hobbies: ["Gardening", "Yoga"], trust: 72, verified: true, nearby: false, seen: false, lock: "open", rank: 66,
    reasons: ["Dono ko yoga pasand hai"],
    starter: "Aapke garden me sabse pehle kya ugaya tha?",
  },
];

function factsFor(p: Person): ReelFact[] {
  return [
    { group: "family", label: "Family Type", value: p.familyType },
    { group: "lifestyle", label: "Diet", value: p.diet },
    { group: "lifestyle", label: "Hobbies", value: p.hobbies.join(", ") },
    { group: "basic", label: "Mother Tongue", value: p.motherTongue },
    { group: "basic", label: "Height", value: p.height },
  ];
}

export function mockReelCard(p: Person): ReelCard {
  return {
    id: p.id,
    displayName: p.name,
    age: p.age,
    city: p.city,
    education: p.education,
    profession: p.profession,
    verified: p.verified,
    mobileVerified: p.verified,
    trustScore: p.trust,
    photoUrl: null,
    photoUnlocked: p.lock === "open",
    photoLock: p.lock,
    spotlight: false,
    photoFocalY: null,
    slides: [],
    bioNote: p.lock === "open" ? p.about : null,
    voiceNote: null,
    nearby: p.nearby,
    seenBefore: p.seen,
    lastDecision: null,
    matchId: null,
    rankScore: p.rank,
    segments: [
      { key: "preference", label: "Preferences", value: Math.min(100, p.rank + 6), color: "#e8cf7a" },
      { key: "soch", label: "Soch", value: Math.max(40, p.rank - 8), color: "#cf6e7d" },
      { key: "trust", label: "Trust", value: p.trust, color: "#37db96" },
    ],
    preference: { state: "COMPARABLE", score: Math.min(100, p.rank + 6), note: null },
    strengths: p.reasons.slice(0, 2),
    concern: null,
    sharedTags: p.hobbies.slice(0, 2),
    liked: false,
    shortlisted: false,
    interestSent: false,
    completeness: { percent: 70 + ((p.trust * 3) % 28), gaps: p.id === "p_pooja" ? ["family"] : [] },
    kundli: { milan: null, note: "Kundli milan ke liye dono taraf birth time chahiye.", notes: [] },
    mission: null,
    vibeBadge: p.vibe ? { label: p.vibe, description: "Mindset Arena ke jawabon se bana badge." } : null,
    askedStatus: "NONE",
    whyThisMatch: {
      reasons: p.reasons.map((text) => ({ text, kind: "fact" as const })),
      valueConnection: p.familyType === "Joint family" ? "Dono ke liye parivaar pehle aata hai." : null,
      unclear: p.id === "p_pooja" ? "Family ke baare me abhi zyada jaankari nahi hai." : null,
      starter: p.starter,
    },
    facts: factsFor(p),
  };
}

export const MOCK_PEOPLE = PEOPLE;

export function mockPerson(profileId: string): Person | undefined {
  return PEOPLE.find((p) => p.id === profileId);
}
