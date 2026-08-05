/**
 * Dev-only seed data — real rows in the real dev database, not client-side
 * mock JSON. Gives the Rishta Reel matching pipeline something real to score
 * against on a fresh `docker compose up` + `prisma migrate dev`.
 *
 * All accounts share the password printed at the end of the run.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { AI_MODEL_DEFAULTS, type AiFeatureKey } from "../lib/ai/models";
import type { PollTheme } from "@prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set — see .env.example.");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const SEED_PASSWORD = "Bandhan@123";

type SeedProfile = {
  fullName: string;
  gender: "Ladka" | "Ladki";
  dobYear: number;
  maritalStatus: string;
  heightCm: number;
  city: string;
  education: string;
  jobTitle: string;
  companyCity: string;
  income: string;
  motherTongue: string;
  religion: string;
  familyType: string;
  diet: string;
  smoking: string;
  drinking: string;
  hobbies: string[];
  trustScore: number;
  mobileVerified: boolean;
  /** Feeds the gotra/manglik notes — see lib/services/kundli/kundliService.ts. */
  gotra: string;
  manglik: "Nahi" | "Haan" | "Aanshik manglik" | "Pata nahi" | "Hum nahi maante";
};

const SEED_PROFILES: SeedProfile[] = [
  { fullName: "Rohan Sharma", gender: "Ladka", dobYear: 1996, maritalStatus: "Never Married", heightCm: 178, city: "Jaipur", education: "B.Tech", jobTitle: "Software Engineer", companyCity: "Jaipur", income: "10–20 lakh", motherTongue: "Hindi", religion: "Hindu", familyType: "Nuclear family", diet: "Veg", smoking: "Nahi", drinking: "Nahi", hobbies: ["Music", "Sports"], trustScore: 82, mobileVerified: true, gotra: "Kashyap", manglik: "Haan" },
  { fullName: "Arjun Mehta", gender: "Ladka", dobYear: 1994, maritalStatus: "Never Married", heightCm: 182, city: "Delhi NCR", education: "MBA", jobTitle: "Product Manager", companyCity: "Delhi NCR", income: "20–50 lakh", motherTongue: "Punjabi", religion: "Hindu", familyType: "Joint family", diet: "Non-veg", smoking: "Nahi", drinking: "Kabhi-kabhi", hobbies: ["Ghoomna", "Photography"], trustScore: 91, mobileVerified: true, gotra: "Bharadwaj", manglik: "Nahi" },
  { fullName: "Karan Malhotra", gender: "Ladka", dobYear: 1998, maritalStatus: "Never Married", heightCm: 175, city: "Mumbai", education: "B.Com", jobTitle: "Chartered Accountant", companyCity: "Mumbai", income: "10–20 lakh", motherTongue: "Hindi", religion: "Hindu", familyType: "Nuclear family", diet: "Veg", smoking: "Nahi", drinking: "Nahi", hobbies: ["Cooking", "Yoga"], trustScore: 68, mobileVerified: false, gotra: "Vashistha", manglik: "Pata nahi" },
  { fullName: "Vivek Iyer", gender: "Ladka", dobYear: 1993, maritalStatus: "Never Married", heightCm: 172, city: "Bengaluru", education: "M.Tech", jobTitle: "Data Scientist", companyCity: "Bengaluru", income: "20–50 lakh", motherTongue: "Tamil", religion: "Hindu", familyType: "Nuclear family", diet: "Veg", smoking: "Nahi", drinking: "Nahi", hobbies: ["Padhna", "Film"], trustScore: 88, mobileVerified: true, gotra: "Kaushik", manglik: "Hum nahi maante" },
  { fullName: "Aditya Rao", gender: "Ladka", dobYear: 1995, maritalStatus: "Never Married", heightCm: 180, city: "Hyderabad", education: "MBA", jobTitle: "Marketing Manager", companyCity: "Hyderabad", income: "10–20 lakh", motherTongue: "Telugu", religion: "Hindu", familyType: "Joint family", diet: "Non-veg", smoking: "Kabhi-kabhi", drinking: "Kabhi-kabhi", hobbies: ["Sports", "Gardening"], trustScore: 74, mobileVerified: true, gotra: "Gautam", manglik: "Aanshik manglik" },
  { fullName: "Siddharth Joshi", gender: "Ladka", dobYear: 1997, maritalStatus: "Never Married", heightCm: 176, city: "Pune", education: "B.Tech", jobTitle: "Founder — Startup", companyCity: "Pune", income: "5–10 lakh", motherTongue: "Marathi", religion: "Hindu", familyType: "Nuclear family", diet: "Veg", smoking: "Nahi", drinking: "Nahi", hobbies: ["Photography", "Ghoomna"], trustScore: 60, mobileVerified: false, gotra: "Sandilya", manglik: "Nahi" },

  { fullName: "Priya Agarwal", gender: "Ladki", dobYear: 1997, maritalStatus: "Never Married", heightCm: 162, city: "Jaipur", education: "MBA", jobTitle: "Marketing Manager", companyCity: "Jaipur", income: "10–20 lakh", motherTongue: "Hindi", religion: "Hindu", familyType: "Joint family", diet: "Veg", smoking: "Nahi", drinking: "Nahi", hobbies: ["Music", "Cooking"], trustScore: 85, mobileVerified: true, gotra: "Kashyap", manglik: "Nahi" },
  { fullName: "Ananya Kapoor", gender: "Ladki", dobYear: 1995, maritalStatus: "Never Married", heightCm: 165, city: "Delhi NCR", education: "M.Sc", jobTitle: "Research Scientist", companyCity: "Delhi NCR", income: "10–20 lakh", motherTongue: "Punjabi", religion: "Hindu", familyType: "Nuclear family", diet: "Veg", smoking: "Nahi", drinking: "Nahi", hobbies: ["Padhna", "Yoga"], trustScore: 93, mobileVerified: true, gotra: "Bharadwaj", manglik: "Haan" },
  { fullName: "Ishita Verma", gender: "Ladki", dobYear: 1998, maritalStatus: "Never Married", heightCm: 160, city: "Mumbai", education: "B.A.", jobTitle: "UX Designer", companyCity: "Mumbai", income: "5–10 lakh", motherTongue: "Hindi", religion: "Hindu", familyType: "Nuclear family", diet: "Non-veg", smoking: "Nahi", drinking: "Kabhi-kabhi", hobbies: ["Film", "Photography"], trustScore: 71, mobileVerified: true, gotra: "Vashistha", manglik: "Pata nahi" },
  { fullName: "Meera Krishnan", gender: "Ladki", dobYear: 1994, maritalStatus: "Never Married", heightCm: 158, city: "Bengaluru", education: "PhD", jobTitle: "Assistant Professor", companyCity: "Bengaluru", income: "10–20 lakh", motherTongue: "Tamil", religion: "Hindu", familyType: "Nuclear family", diet: "Veg", smoking: "Nahi", drinking: "Nahi", hobbies: ["Padhna", "Music"], trustScore: 89, mobileVerified: true, gotra: "Kaushik", manglik: "Hum nahi maante" },
  { fullName: "Sneha Reddy", gender: "Ladki", dobYear: 1996, maritalStatus: "Never Married", heightCm: 163, city: "Hyderabad", education: "B.Tech", jobTitle: "Software Engineer", companyCity: "Hyderabad", income: "10–20 lakh", motherTongue: "Telugu", religion: "Hindu", familyType: "Joint family", diet: "Non-veg", smoking: "Nahi", drinking: "Nahi", hobbies: ["Sports", "Ghoomna"], trustScore: 78, mobileVerified: false, gotra: "Gautam", manglik: "Aanshik manglik" },
  { fullName: "Kavya Deshpande", gender: "Ladki", dobYear: 1999, maritalStatus: "Never Married", heightCm: 161, city: "Pune", education: "B.Com", jobTitle: "Business Analyst", companyCity: "Pune", income: "5–10 lakh", motherTongue: "Marathi", religion: "Hindu", familyType: "Nuclear family", diet: "Veg", smoking: "Nahi", drinking: "Nahi", hobbies: ["Gardening", "Cooking"], trustScore: 65, mobileVerified: false, gotra: "Sandilya", manglik: "Nahi" },
];

/**
 * Phase C — Mindset Arena content pool, split into the weekly theme rotation
 * (lib/vibe/pollThemes.ts). `getOrCreateTodayPoll()` picks the next unshown
 * poll *within today's theme*; upserted by `slug` here so re-running seed never
 * duplicates a poll or resets who's already answered it.
 *
 * ## The two rules every question here obeys
 *
 * 1. **No option is the right one.** Every choice below is a stance a
 *    reasonable person actually holds. The moment one reads as correct, users
 *    answer with what they think we want, and `sochFit` starts measuring
 *    performance instead of thinking.
 * 2. **Never caste, dowry, appearance, or income figures.** Answers are public
 *    on the Soch Board under a real name; those four turn a mindset board into
 *    either a legal problem or a ranking of people.
 *
 * Keep the themes roughly balanced. A theme with two polls repeats every
 * fortnight; one with nine lasts about two months.
 */
type SeedPoll = { slug: string; theme: PollTheme; question: string; options: string[] };

const SEED_POLLS: SeedPoll[] = [
  // ── PARIVAAR · Somvaar ────────────────────────────────────────────────
  { slug: "saas-susar-ke-saath", theme: "PARIVAAR", question: "Shaadi ke baad rehna — nuclear ya joint family?", options: ["Nuclear — apna alag ghar", "Joint — sab saath", "Paas-paas, ghar alag", "Jaisa parivaar chahe waisa"] },
  { slug: "in-laws-ke-ghar", theme: "PARIVAAR", question: "In-laws ke ghar mahine me kitni baar jaana theek hai?", options: ["Jab bhi mann kare", "Mahine me ek-do baar", "Sirf occasions par", "Jitna dono comfortable hon utna"] },
  { slug: "rishtedaar-function", theme: "PARIVAAR", question: "Rishtedaaron ke function attend karna kitna zaroori hai?", options: ["Zaroor jaana chahiye, rishta nibhana matter karta hai", "Close relatives ke hi", "Jab waqt ho tab", "Partner ke saath decide karenge"] },
  { slug: "weekend-family-visit", theme: "PARIVAAR", question: "Weekend par family visit — mandatory ya jab mann kare?", options: ["Roz nahi to hafte me ek baar zaroor", "Jab mann kare, koi rule nahi", "Occasions par hi", "Dono families ko barabar time"] },
  { slug: "maa-baap-budhapa", theme: "PARIVAAR", question: "Maa-baap budhape me kiske saath rahenge?", options: ["Hamare saath hi", "Paas me alag ghar lekar", "Jahan wo khud comfortable hon", "Bhai-behno me baari-baari"] },
  { slug: "family-ki-rai", theme: "PARIVAAR", question: "Ghar ke faislon me family ki rai kitni chalti hai?", options: ["Bade jo kahein wahi", "Sunte hain, faisla hamara", "Sirf bade faislon me", "Faisla hamesha hum dono ka"] },
  { slug: "partner-family-anban", theme: "PARIVAAR", question: "Aapke parivaar aur partner ke beech anban ho to?", options: ["Partner ka saath denge, family se baat karenge", "Dono ko samjha kar beech ka raasta", "Family se seedha nahi kehte, dhire se sudharte hain", "Waqt ke saath apne aap theek ho jaata hai"] },
  { slug: "bhai-behen-zimmedari", theme: "PARIVAAR", question: "Bhai-behen ki padhai/shaadi ki zimmedari?", options: ["Poori tarah nibhayenge", "Jitna ho sake utni madad", "Parivaar milkar baante", "Wo apni zimmedari khud lein"] },
  { slug: "bin-bataye-mehmaan", theme: "PARIVAAR", question: "Rishtedaar bina bataye ghar aa jayein to?", options: ["Khushi se swagat, ghar sabka hai", "Achha lagta hai, par bata dein to behtar", "Thoda mushkil ho jaata hai", "Ab ye kam hi hona chahiye"] },

  // ── PAISA · Mangalvaar ────────────────────────────────────────────────
  { slug: "ghar-ka-budget", theme: "PAISA", question: "Ghar ka monthly budget kaun sambhale?", options: ["Dono milkar", "Jiski salary zyada ho", "Jise numbers me interest ho", "Alag-alag kharche, mila kar nahi"] },
  { slug: "financial-decisions", theme: "PAISA", question: "Bade financial decisions kaise lete hain?", options: ["Dono milkar discuss karke", "Jiski expertise ho wo decide kare", "Ek limit tak khud, upar milkar", "Family se bhi poochh lete hain"] },
  { slug: "salary-batana", theme: "PAISA", question: "Ek dusre ko apni salary batana zaroori hai?", options: ["Haan, poori transparency honi chahiye", "Rough idea kaafi hai", "Jab trust build ho jaaye tab", "Personal matter hai, zaroori nahi"] },
  { slug: "bada-purchase", theme: "PAISA", question: "Ghar/car jaisa bada purchase kiske naam par le?", options: ["Dono ke naam par", "Jo legally/tax me aasan ho", "Jiski zyada zaroorat ho uske naam", "Abhi tak socha nahi"] },
  { slug: "bade-faisle-discussion", theme: "PAISA", question: "Bada kharcha karne se pehle kitna soch-vichaar?", options: ["Kai din soch samajh kar", "Ek-do baar baat karke decide", "Jo pehle mann bana le wahi lead kare", "Family se bhi salaah lete hain"] },
  { slug: "bachat-ya-jiyo", theme: "PAISA", question: "Paisa — pehle bachao ya aaj jiyo?", options: ["Pehle bachat, phir kharch", "Aaj jiyo, kal dekha jayega", "Beech ka raasta", "Plan bana kar dono"] },
  { slug: "family-ko-udhaar", theme: "PAISA", question: "Family ko paise udhaar dene par?", options: ["Zaroorat me zaroor, wapas ki umeed nahi", "Denge, par baat saaf rahegi", "Partner se poochh kar", "Jitna afford ho sirf utna"] },
  { slug: "joint-ya-alag-account", theme: "PAISA", question: "Shaadi ke baad bank account?", options: ["Ek joint account, sab usme", "Apna-apna, ghar kharch ke liye ek joint", "Alag-alag hi theek", "Jaise chal raha hai chalega"] },
  { slug: "loan-lena", theme: "PAISA", question: "Ghar ke liye loan lena ya paise jodh kar kharidna?", options: ["Loan lekar jaldi le lo", "Paise jodh kar hi kharido", "Chhota loan theek hai", "Jitni zaroorat ho utna hi"] },

  // ── CAREER · Budhwaar ─────────────────────────────────────────────────
  { slug: "career-priority", theme: "CAREER", question: "Dono ke career me priority kaise decide hogi?", options: ["Dono ki barabar priority", "Jiska growth potential zyada wahi pehle", "Waqt ke saath dekha jayega", "Jo bhi family ke liye better ho"] },
  { slug: "ghar-ke-kaam", theme: "CAREER", question: "Ghar ke roz ke kaam kaise baante?", options: ["Jo jisme achha ho wo kare", "Barabar bant kar", "Dono kamayein to help rakhenge", "Jiske paas zyada waqt ho"] },
  { slug: "city-shift-kisliye", theme: "CAREER", question: "Naye city shift karna ho to kis wajah se?", options: ["Jiski job better ho uske liye", "Jahan dono ki family paas ho", "Jahan bhi opportunity mile", "Dono milkar sabse achha option dhoondhenge"] },
  { slug: "kaam-chhodna-pade", theme: "CAREER", question: "Bachon ke baad kisi ek ko kaam chhodna pade to?", options: ["Dono milkar decide karenge", "Jiski income kam ho wo", "Koi nahi chhodega, help rakhenge", "Jo khud chahe"] },
  { slug: "partner-ka-transfer", theme: "CAREER", question: "Partner ka transfer doosre shehar ho jaye?", options: ["Saath chalenge", "Kuch waqt long distance", "Transfer avoid karne ki koshish", "Jo career ke liye better ho"] },
  { slug: "raat-tak-kaam", theme: "CAREER", question: "Raat tak kaam karna — normal hai ya problem?", options: ["Normal hai, career ka hissa", "Kabhi-kabhi theek", "Ghar ka waqt ghar ka hona chahiye", "Depend karta hai kis phase me hain"] },
  { slug: "job-ya-business", theme: "CAREER", question: "Job ki security ya apna business?", options: ["Job — stability zaroori", "Business — apna kuch banao", "Pehle job, phir business", "Partner jo chahe"] },
  { slug: "partner-zyada-kamaye", theme: "CAREER", question: "Partner aapse zyada kamaye to?", options: ["Bilkul theek, khushi ki baat", "Theek hai, par shuru me thoda ajeeb lagega", "Koi farak nahi padta", "Isse ghar chalane me aasani hogi"] },
  { slug: "saal-me-chhutti", theme: "CAREER", question: "Kaam se chhutti kitni zaroori hai?", options: ["Har 2-3 mahine me ek break", "Saal me ek badi trip", "Jab kaam se waqt mile", "Chhutti se zyada roz ka balance"] },

  // ── RITUALS · Guruvaar ────────────────────────────────────────────────
  { slug: "diwali-alternate", theme: "RITUALS", question: "Shaadi ke baad Diwali kaise manayenge?", options: ["Har saal apni family ke saath", "Alternate — ek saal iske ghar, ek saal uske", "Dono families ek saath bulayenge", "Jahan mann kare, waqt ke saath tay karenge"] },
  { slug: "shaadi-bada-function", theme: "RITUALS", question: "Shaadi — bada function ya chhota intimate?", options: ["Bada function — sab rishtedaar bulao", "Chhota, sirf close family", "Do events — chhota aur ek bada", "Court marriage, function baad me"] },
  { slug: "naam-badalna", theme: "RITUALS", question: "Shaadi ke baad surname change karna zaroori hai?", options: ["Haan, tradition hai", "Nahi, apna naam hi rahega", "Dono naam saath use karenge", "Partner ki marzi par chhod denge"] },
  { slug: "pooja-rituals", theme: "RITUALS", question: "Ghar me pooja/rituals — dono families ke follow karenge ya naya tareeka?", options: ["Dono families ke rituals follow karenge", "Apna naya, simple tareeka banayenge", "Jo bhi comfortable lage wo rakhenge", "Zyada sochte nahi is baare me"] },
  { slug: "vrat-upvaas", theme: "RITUALS", question: "Vrat/upvaas rakhna?", options: ["Haan, shraddha se", "Kabhi-kabhi, parampara ke liye", "Nahi rakhte", "Partner rakhe to saath denge"] },
  { slug: "mandir-jaana", theme: "RITUALS", question: "Mandir ya dharmik jagah jaana kitna?", options: ["Regular", "Tyohaar par", "Kabhi-kabhi, jab mann kare", "Aastha andar hai, jaana zaroori nahi"] },
  { slug: "kundli-milana", theme: "RITUALS", question: "Shaadi se pehle kundli milana?", options: ["Zaroori hai", "Family chahe to mila lenge", "Sirf formality ke liye", "Hum nahi maante"] },
  { slug: "bachon-ke-sanskar", theme: "RITUALS", question: "Bachon ko dharmik sanskar dena?", options: ["Haan, poori tarah", "Basic baatein bata denge", "Bade hokar khud chunein", "Zyada zor nahi denge"] },
  { slug: "shaadi-ki-rasmein", theme: "RITUALS", question: "Shaadi ki rasmein kitni rakhein?", options: ["Saari, jaise hoti aayi hain", "Sirf zaroori wali", "Naya aur purana mila kar", "Kam se kam, simple"] },

  // ── RED FLAGS · Shukravaar ────────────────────────────────────────────
  { slug: "fight-ke-baad", theme: "RED_FLAGS", question: "Jhagde ke baad — turant baat karo ya time lo?", options: ["Turant baat karke suljhao", "Thoda time lekar phir baat karo", "Jo jaldi normal ho jaaye wo shuru kare", "Depend karta hai baat kitni badi thi"] },
  { slug: "long-distance", theme: "RED_FLAGS", question: "Shaadi se pehle long-distance rishta kitne mahine tak theek hai?", options: ["Kuch mahine chalta hai", "6 mahine se zyada mushkil hai", "Jab tak plan clear ho theek hai", "Kabhi comfortable nahi laga"] },
  { slug: "phone-dinner-table", theme: "RED_FLAGS", question: "Dinner table par phone dekhna — allow ya nahi?", options: ["Nahi, dinner ka waqt saath ka hai", "Kabhi-kabhi theek hai", "Emergency ke alawa nahi", "Dono ki apni marzi"] },
  { slug: "emotional-support", theme: "RED_FLAGS", question: "Partner upset ho to kya karte hain?", options: ["Pehle sunte hain, phir advice dete hain", "Seedha solution dhoondhne me help karte hain", "Bas saath baithte hain, kuch bolte nahi", "Depend karta hai baat par"] },
  { slug: "chhota-jhooth", theme: "RED_FLAGS", question: "Chhota jhooth — kitni badi baat hai?", options: ["Koi bhi jhooth problem hai", "Niyat achhi ho to chalega", "Baar-baar ho to problem hai", "Chhoti baaton par dhyan nahi dete"] },
  { slug: "partner-ka-phone", theme: "RED_FLAGS", question: "Partner ka phone bina poochhe dekhna?", options: ["Bilkul nahi, privacy zaroori hai", "Kuch chhupa nahi to koi baat nahi", "Poochh kar dekh sakte hain", "Zaroorat hi nahi padni chahiye"] },
  { slug: "gusse-me-kya", theme: "RED_FLAGS", question: "Gusse me aap kya karte hain?", options: ["Chup ho jaate hain", "Jo mann me hai bol dete hain", "Thodi der ke liye jagah chhod dete hain", "Gussa jaldi aata hi nahi"] },
  { slug: "purane-rishte", theme: "RED_FLAGS", question: "Purane rishton ke baare me batana?", options: ["Sab bata dena chahiye", "Jitna wo comfortable ho utna", "Jaanne ki zaroorat hi nahi", "Sirf agar aaj asar padta ho"] },
  { slug: "maafi-maangna", theme: "RED_FLAGS", question: "Galti par maafi maangna kitna aasan lagta hai?", options: ["Turant maang lete hain", "Waqt lagta hai, par maang lete hain", "Galti maante hain, shabd nahi nikalte", "Aksar humein lagta hai hum galat nahi the"] },

  // ── SAPNE · Shanivaar ─────────────────────────────────────────────────
  { slug: "bada-ya-chhota-shehar", theme: "SAPNE", question: "Settle hone ke liye bada shehar behtar hai ya chhota?", options: ["Bada shehar — opportunities zyada", "Chhota shehar — sukoon zyada", "Dono ka mix — tier-2 city", "Jahan job ho, wahi sahi"] },
  { slug: "bachon-ki-parvarish", theme: "SAPNE", question: "Bachon ki parvarish — strict ya friend jaisi?", options: ["Thodi strict, discipline zaroori hai", "Friend jaisi, khul kar baat ho", "Dono ka mix", "Abhi soch nahi paaye"] },
  { slug: "pehla-saal-shaadi", theme: "SAPNE", question: "Shaadi ke pehle saal me sabse zyada kya matter karta hai?", options: ["Ek dusre ko samajhna", "Family ke saath adjust hona", "Apna space bhi milna", "Saath waqt bitana"] },
  { slug: "paanch-saal-baad", theme: "SAPNE", question: "5 saal baad khud ko kahan dekhte hain?", options: ["Apne ghar me, settled", "Career me kaafi upar", "Ghoomte hue, naye experiences ke saath", "Parivaar bada karte hue"] },
  { slug: "bache-kab", theme: "SAPNE", question: "Bache kab plan karenge?", options: ["Shaadi ke 1-2 saal me", "3-4 saal baad", "Jab dono taiyaar hon", "Abhi tak socha nahi"] },
  { slug: "videsh-settle", theme: "SAPNE", question: "Videsh settle hone ka mauka mile to?", options: ["Zaroor jayenge", "Kuch saal ke liye, phir wapas", "Nahi, apna desh apna hai", "Family ke saath baithkar decide karenge"] },
  { slug: "apna-ghar-kab", theme: "SAPNE", question: "Apna ghar kab tak lena hai?", options: ["Jitna jaldi ho sake", "5-7 saal me", "Rent theek hai, ghar zaroori nahi", "Jahan settle honge, tab"] },
  { slug: "retirement-kahan", theme: "SAPNE", question: "Retirement ke baad kya karna chahenge?", options: ["Gaon ya pahad me shaanti se", "Bachon ke paas", "Ghoomte rehna", "Kuch apna kaam karte rehna"] },
  { slug: "zindagi-ka-maqsad", theme: "SAPNE", question: "Zindagi me sabse zyada kya matter karta hai?", options: ["Parivaar ka saath", "Apna kaam aur pehchaan", "Sukoon aur sehat", "Naye experiences"] },

  // ── HALKA · Ravivaar ──────────────────────────────────────────────────
  { slug: "honeymoon-pahad-ya-beach", theme: "HALKA", question: "Honeymoon — pahad ya beach?", options: ["Pahad — thandak aur shaant", "Beach — dhoop aur masti", "Dono ek hi trip me", "Ghumna nahi, ghar par relax"] },
  { slug: "pet-rakhna", theme: "HALKA", question: "Ghar me pet rakhna — haan ya nahi?", options: ["Haan, zaroor", "Nahi, zimmedari zyada hai", "Dekh kar decide karenge", "Partner ki marzi"] },
  { slug: "shaadi-photos-social-media", theme: "HALKA", question: "Shaadi ki photos social media par?", options: ["Sabko dikhayenge, khushi share karni chahiye", "Kuch select photos hi", "Sirf close logon tak", "Private rakhenge"] },
  { slug: "ghar-ka-decor", theme: "HALKA", question: "Ghar ka decor — modern ya traditional?", options: ["Modern, minimal", "Traditional, apni jadon se juda hua", "Dono ka mix", "Jo bhi practical ho"] },
  { slug: "vacation-planning", theme: "HALKA", question: "Vacation planning — surprise ya dono milkar?", options: ["Surprise plan karna romantic lagta hai", "Dono milkar decide karna behtar", "Alag-alag baari se surprise karenge", "Jahan waqt mile wahi chal denge"] },
  { slug: "dost-circle", theme: "HALKA", question: "Shaadi ke baad dost circle — apna alag ya sab shared?", options: ["Apna alag circle rahega", "Dhire-dhire sab shared ho jayega", "Dono — kuch apna, kuch shared", "Jo bhi naturally ho jaaye"] },
  { slug: "anniversary-celebration", theme: "HALKA", question: "Anniversary kaise celebrate karenge?", options: ["Bada plan — trip ya party", "Simple din, ek dusre ke saath", "Har saal kuch alag try karenge", "Jaisa waqt aur mood ho"] },
  { slug: "naye-shehar-dost", theme: "HALKA", question: "Naye shehar shift hone par dost kaise banayenge?", options: ["Colony/society ke logon se", "Office ya kaam ke through", "Common hobby groups se", "Waqt ke saath ho hi jaata hai"] },
  { slug: "anniversary-gift", theme: "HALKA", question: "Gift — practical ya romantic surprise?", options: ["Practical, kaam ki cheez", "Romantic surprise", "Dono ek saath", "Gift se zyada saath bitaya waqt"] },
  { slug: "khaana-kaun-banaye", theme: "HALKA", question: "Weekend ka khaana kaun banata hai?", options: ["Jo achha banata hai wo", "Dono milkar, saath me maza aata hai", "Bahar se manga lete hain", "Baari-baari"] },
  { slug: "film-ya-series", theme: "HALKA", question: "Shaam free ho to — film, series ya bahar?", options: ["Film — poora experience", "Series — ek ke baad ek", "Bahar ghoomne nikal jayenge", "Kuch nahi, bas aaram"] },
  { slug: "subah-ya-raat", theme: "HALKA", question: "Aap subah wale insaan hain ya raat wale?", options: ["Subah jaldi uthne wale", "Raat ko der tak jaagne wale", "Dono chal jaata hai", "Weekday alag, weekend alag"] },
];

/**
 * Views and shortlists so the dashboard's activity panel has something real to
 * show on a fresh database.
 *
 * No RIGHT swipes here on purpose: in the app a RIGHT swipe also creates an
 * Interest and can create a Match, and a seed that fabricates those would put
 * matches in front of a user that nobody actually sent. DOWN rows are paired
 * with a Shortlist row exactly as `api/reel/swipe` does it.
 */
async function seedDemoActivity() {
  const ACTIVITY: { actor: string; target: string; direction: "LEFT" | "UP" | "DOWN" }[] = [
    { actor: "Priya Agarwal", target: "Rohan Sharma", direction: "DOWN" },
    { actor: "Ananya Kapoor", target: "Rohan Sharma", direction: "DOWN" },
    { actor: "Ishita Verma", target: "Rohan Sharma", direction: "LEFT" },
    { actor: "Meera Krishnan", target: "Rohan Sharma", direction: "UP" },
    { actor: "Kavya Deshpande", target: "Rohan Sharma", direction: "LEFT" },
    { actor: "Arjun Mehta", target: "Priya Agarwal", direction: "DOWN" },
    { actor: "Vivek Iyer", target: "Priya Agarwal", direction: "LEFT" },
  ];

  const emailFor = (name: string) => `${name.toLowerCase().replace(/\s+/g, ".")}@seed.bandhantak.dev`;

  for (const row of ACTIVITY) {
    const actor = await prisma.user.findUnique({ where: { email: emailFor(row.actor) }, select: { id: true } });
    const target = await prisma.profile.findFirst({
      where: { user: { email: emailFor(row.target) } },
      select: { id: true },
    });
    if (!actor || !target) continue;

    // SwipeAction has no unique constraint (a real user can swipe many cards),
    // so idempotency has to be checked rather than upserted.
    const already = await prisma.swipeAction.findFirst({
      where: { actorUserId: actor.id, targetProfileId: target.id },
      select: { id: true },
    });
    if (!already) {
      await prisma.swipeAction.create({
        data: { actorUserId: actor.id, targetProfileId: target.id, direction: row.direction, wasButton: true },
      });
    }

    if (row.direction === "DOWN") {
      await prisma.shortlist.upsert({
        where: { userId_targetProfileId: { userId: actor.id, targetProfileId: target.id } },
        create: { userId: actor.id, targetProfileId: target.id },
        update: {},
      });
    }
  }
}

async function main() {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 12);

  for (const [index, p] of SEED_PROFILES.entries()) {
    const email = `${p.fullName.toLowerCase().replace(/\s+/g, ".")}@seed.bandhantak.dev`;
    // Seeded rows carried `mobileVerifiedAt` with a null `mobile`, so every
    // demo profile wore a "Mobile verified" badge for a number that did not
    // exist — and mutual contact share had nothing to reveal. Reserved 98765xxxxx
    // range, distinct per profile.
    const mobile = p.mobileVerified ? `98765${String(10000 + index).slice(-5)}` : null;

    const user = await prisma.user.upsert({
      where: { email },
      create: {
        fullName: p.fullName,
        email,
        passwordHash,
        role: "USER",
        status: "ACTIVE",
        mobile,
        mobileVerifiedAt: p.mobileVerified ? new Date() : null,
      },
      update: {},
    });

    // Backfills databases seeded before mobiles existed — `update: {}` above
    // deliberately never touches an existing row.
    if (mobile && !user.mobile) {
      await prisma.user.update({ where: { id: user.id }, data: { mobile } });
    }

    const [firstName, ...rest] = p.fullName.split(" ");
    const lookingForGender = p.gender === "Ladka" ? "Ladki" : "Ladka";

    await prisma.profile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        profileStatus: "SUBMITTED",
        displayName: p.fullName,
        gender: p.gender,
        dateOfBirth: new Date(Date.UTC(p.dobYear, 5, 15)),
        maritalStatus: p.maritalStatus,
        heightCm: p.heightCm,
        currentCity: p.city,
        currentCountry: "India",
        bioText: `${p.jobTitle} — ${p.city} me based hu. Family-oriented hu aur genuine rishta dhoondh raha/rahi hu.`,
        profileCompletionScore: 100,
        trustScore: p.trustScore,
        trustScoreLabel: p.trustScore >= 85 ? "STRONG" : p.trustScore >= 65 ? "GOOD" : p.trustScore >= 40 ? "MODERATE" : "LOW",
        isVisible: true,
        submittedAt: new Date(),
        basicDetails: {
          create: {
            firstName,
            lastName: rest.join(" "),
            motherTongue: p.motherTongue,
            religion: p.religion,
            gotra: p.gotra,
            manglikStatus: p.manglik,
          },
        },
        education: { create: { highestEducation: p.education } },
        profession: { create: { jobTitle: p.jobTitle, workCity: p.companyCity, annualIncomeRange: p.income } },
        family: { create: { familyType: p.familyType, siblingsCount: "1" } },
        lifestyle: { create: { diet: p.diet, smoking: p.smoking, drinking: p.drinking, hobbies: p.hobbies } },
        partnerPreferences: {
          create: { lookingForGender, minAge: 24, maxAge: 34, preferredCities: ["Kahin bhi"], educationPreference: "Graduate ya upar" },
        },
      },
      update: {},
    });

    // `update: {}` above deliberately leaves an existing profile alone, but
    // gotra/manglik were added to the seed after these rows first existed —
    // so a database seeded earlier would never get them. Setting them here
    // keeps re-runs useful without the upsert clobbering hand-edited data.
    await prisma.profileBasicDetails.updateMany({
      where: { profile: { userId: user.id }, gotra: null },
      data: { gotra: p.gotra, manglikStatus: p.manglik },
    });
  }

  await seedDemoActivity();

  // Without an ADMIN there is nobody who can approve a partner application,
  // and partner approval has no automatic path by design (D-32).
  const adminEmail = "admin@seed.bandhantak.dev";
  await prisma.user.upsert({
    where: { email: adminEmail },
    create: { fullName: "Seed Admin", email: adminEmail, passwordHash, role: "ADMIN", status: "ACTIVE" },
    update: { role: "ADMIN", status: "ACTIVE" },
  });

  // One already-approved partner so the dashboard has real data on a fresh DB.
  const partnerEmail = "pandit.sharma@seed.bandhantak.dev";
  const partnerUser = await prisma.user.upsert({
    where: { email: partnerEmail },
    create: { fullName: "Pandit Ramesh Sharma", email: partnerEmail, passwordHash, role: "PARTNER", status: "ACTIVE" },
    update: { role: "PARTNER", status: "ACTIVE" },
  });

  const partner = await prisma.partner.upsert({
    where: { userId: partnerUser.id },
    create: {
      userId: partnerUser.id,
      fullName: "Pandit Ramesh Sharma",
      mobileNumber: "9812345612",
      email: partnerEmail,
      city: "Jaipur",
      state: "Rajasthan",
      partnerType: "PANDIT",
      organizationName: "Sharma Ji Vivah Seva",
      experienceYears: 12,
      expectedMonthlyReferrals: 10,
      knownCommunityOrArea: "Jaipur — Malviya Nagar aur aas-paas",
      status: "APPROVED",
      approvedAt: new Date(),
    },
    update: {},
  });

  const existingCode = await prisma.referralCode.findFirst({ where: { partnerId: partner.id, active: true } });
  if (!existingCode) {
    await prisma.referralCode.create({
      data: { partnerId: partner.id, code: "BTRAM24", type: "AUTO", active: true },
    });
  }

  // D-10 locked defaults. Prices are editable from /admin/pricing after this —
  // the seed only sets the starting point, upsert leaves an already-changed
  // price alone on subsequent seed runs.
  const PLAN_DEFAULTS: { code: "FREE" | "BASIC" | "STANDARD" | "PREMIUM"; priceInPaise: number; displayOrder: number }[] = [
    { code: "FREE", priceInPaise: 0, displayOrder: 0 },
    { code: "BASIC", priceInPaise: 99900, displayOrder: 1 },
    { code: "STANDARD", priceInPaise: 199900, displayOrder: 2 },
    { code: "PREMIUM", priceInPaise: 299900, displayOrder: 3 },
  ];
  for (const p of PLAN_DEFAULTS) {
    await prisma.plan.upsert({
      where: { code: p.code },
      create: { code: p.code, priceInPaise: p.priceInPaise, displayOrder: p.displayOrder },
      update: {},
    });
  }

  // D-12 locked default: ₹100 flat. Single row, id fixed as "default".
  await prisma.partnerCommissionConfig.upsert({
    where: { id: "default" },
    create: { id: "default", flatAmountPaise: 10000 },
    update: {},
  });

  // Same singleton pattern. Default true — verification stays mandatory
  // until an admin explicitly flips it off from /admin/verification.
  await prisma.verificationSettings.upsert({
    where: { id: "default" },
    create: { id: "default", photoVerificationRequired: true },
    update: {},
  });

  // Same singleton pattern. Default KUNDAN — the app's existing look, so a
  // fresh environment renders exactly as before until an admin visits
  // /admin/theme and changes it.
  await prisma.siteTheme.upsert({
    where: { id: "default" },
    create: { id: "default", pack: "KUNDAN" },
    update: {},
  });

  // Seeds one row per AI feature so /admin/ai-settings has something to show
  // and edit from day one. `update: {}` leaves an admin's already-saved
  // provider/model choice alone on re-seed.
  for (const feature of Object.keys(AI_MODEL_DEFAULTS) as AiFeatureKey[]) {
    const { provider, model } = AI_MODEL_DEFAULTS[feature];
    await prisma.aiFeatureConfig.upsert({
      where: { feature },
      create: { feature, provider, modelId: model },
      update: {},
    });
  }

  for (const [index, poll] of SEED_POLLS.entries()) {
    await prisma.poll.upsert({
      where: { slug: poll.slug },
      create: { slug: poll.slug, theme: poll.theme, question: poll.question, options: poll.options, sortOrder: index },
      // `publishedOn` is deliberately never touched here — re-running seed must
      // not un-publish today's poll or hand a second poll to the same day.
      update: { theme: poll.theme, question: poll.question, options: poll.options, sortOrder: index },
    });
  }

  console.info(`Seeded ${SEED_PROFILES.length} demo accounts. Password for all: ${SEED_PASSWORD}`);
  const perTheme = SEED_POLLS.reduce<Record<string, number>>((acc, p) => {
    acc[p.theme] = (acc[p.theme] ?? 0) + 1;
    return acc;
  }, {});
  const spread = Object.entries(perTheme)
    .map(([t, n]) => `${t}=${n}`)
    .join(" ");
  console.info(`Seeded ${SEED_POLLS.length} Mindset Arena polls (${spread}).`);
  console.info("Example login: rohan.sharma@seed.bandhantak.dev");
  console.info(`Admin login: ${adminEmail}`);
  console.info(`Partner login: ${partnerEmail} (code BTRAM24)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
