import { FIELDS, FIELD_BY_KEY, MINIMUM_LIVE_KEYS, isAnswered, isValidFieldValue } from "~/catalog";
import type {
  ChatMessage,
  Conversation,
  FieldMeta,
  FillingFor,
  InterestItem,
  MatchCard,
  MyPhoto,
  MyProfile,
  Notice,
  ReadinessBlocker,
  ReelCard,
  UserDto,
} from "~/types/api";
import { MOCK_PEOPLE, mockReelCard } from "./people";

/**
 * The in-memory backend behind `EXPO_PUBLIC_DATA_MODE=mock`.
 *
 * Just enough state for every screen to behave like the real thing — an
 * interest you send shows up under Sent, accepting one makes a match and opens
 * a chat, a profile goes live when its eight minimum fields are in — so the
 * whole journey can be walked (and demoed) with no server. Resets on reload.
 */

export const MOCK_OTP = "123456";
/** A number that "already has an account" in mock mode — logs straight in. */
export const MOCK_EXISTING_MOBILE = "9876543210";

export const delay = (ms = 350) => new Promise<void>((resolve) => setTimeout(resolve, ms + Math.random() * 200));

interface MockState {
  user: UserDto | null;
  values: Record<string, string>;
  meta: Record<string, FieldMeta>;
  fillingFor: FillingFor;
  photos: MyPhoto[];
  live: boolean;
  cards: ReelCard[];
  received: InterestItem[];
  sent: InterestItem[];
  matches: MatchCard[];
  threads: Record<string, ChatMessage[]>;
  notices: Notice[];
  settings: {
    incognito: boolean;
    photoPrivacy: "MEMBERS" | "MATCH_ONLY";
    consent: Record<"religion" | "caste" | "gotra" | "manglik" | "income", boolean>;
    notifications: Record<"interests" | "matches" | "messages" | "reminders", boolean>;
  };
}

const now = Date.now();
const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();

function person(id: string) {
  const p = MOCK_PEOPLE.find((x) => x.id === id);
  if (!p) throw new Error(`mock person ${id}`);
  return p;
}

function matchCardFor(id: string, matchId: string): MatchCard {
  const p = person(id);
  return {
    id: matchId,
    displayName: p.name,
    age: p.age,
    city: p.city,
    education: p.education,
    profession: p.profession,
    trustScore: p.trust,
    verified: p.verified,
    profileId: p.id,
    photoUrl: null,
  };
}

function freshState(): MockState {
  const cards = MOCK_PEOPLE.map(mockReelCard);
  const riya = cards.find((c) => c.id === "p_riya");
  if (riya) riya.matchId = "m_riya";

  return {
    user: null,
    values: {},
    meta: {},
    fillingFor: "self",
    photos: [],
    live: false,
    cards,
    received: [
      {
        id: "i_sneha",
        fromUser: { displayName: "Sneha Agarwal", age: 25, city: "Delhi" },
        toUser: { displayName: "Aap" },
        status: "RECEIVED",
        sentDate: ago(60 * 5).slice(0, 10),
        message: "Aapki profile achhi lagi — family values bahut milte hain.",
        profileId: "p_sneha",
      },
      {
        id: "i_neha",
        fromUser: { displayName: "Neha Verma", age: 27, city: "Lucknow" },
        toUser: { displayName: "Aap" },
        status: "RECEIVED",
        sentDate: ago(60 * 26).slice(0, 10),
        profileId: "p_neha",
      },
    ],
    sent: [
      {
        id: "i_kavya",
        fromUser: { displayName: "Aap" },
        toUser: { displayName: "Kavya Joshi", age: 28, city: "Pune" },
        status: "SENT",
        sentDate: ago(60 * 30).slice(0, 10),
        profileId: "p_kavya",
        canWithdraw: false,
      },
    ],
    matches: [matchCardFor("p_riya", "m_riya")],
    threads: {
      m_riya: [
        { id: "msg1", senderId: "u_riya", body: "Namaste! Aapki profile padhi, bahut achha laga.", createdAt: ago(60 * 20), readAt: ago(60 * 19) },
        { id: "msg2", senderId: "u_me", body: "Namaste Riya ji 🙏 Shukriya! Aapki shifts kaisi chal rahi hain?", createdAt: ago(60 * 19), readAt: ago(60 * 18) },
        { id: "msg3", senderId: "u_riya", body: "Thodi lambi, par weekend par sea-face walk sab theek kar deti hai 😊", createdAt: ago(42), readAt: null },
      ],
    },
    notices: [
      {
        id: "n1", kind: "MATCH_CREATED", title: "Naya match 🎉",
        body: "Aap dono ne ek doosre ko pasand kiya. Ab baat shuru kar sakte hain.",
        href: "/user/messages", actorMasked: false, relatedId: "m_riya", read: false, createdAt: ago(60 * 20),
      },
      {
        id: "n2", kind: "QUESTION_ASKED", title: "Kisi ne aapse ek sawaal poocha",
        body: "Ek rishte ne aapki profile par sawaal bheja hai — jawab dene par hi naam dikhega.",
        href: null, actorMasked: true, relatedId: null, read: false, createdAt: ago(60 * 3),
      },
      {
        id: "n3", kind: "ANNOUNCEMENT", title: "Profile tip",
        body: "Photo wali profiles ko 5 guna zyada interests milte hain. Aaj ek saaf photo lagaiye.",
        href: null, actorMasked: false, relatedId: null, read: true, createdAt: ago(60 * 48),
      },
    ],
    settings: {
      incognito: false,
      photoPrivacy: "MEMBERS",
      consent: { religion: false, caste: false, gotra: false, manglik: false, income: false },
      notifications: { interests: true, matches: true, messages: true, reminders: true },
    },
  };
}

export const db: MockState = freshState();

export function mockUserDto(name: string, contact: string, status: UserDto["status"]): UserDto {
  const isEmail = contact.includes("@");
  return {
    id: "u_me",
    role: "USER",
    status,
    full_name: name,
    mobile: isEmail ? null : contact,
    email: isEmail ? contact : null,
    mobile_verified_at: isEmail ? null : new Date().toISOString(),
    email_verified_at: isEmail ? new Date().toISOString() : null,
    last_login_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };
}

/** Signs in as the ready-made demo member (a complete, live profile). */
export function signInDemoMember(contact: string): UserDto {
  db.user = mockUserDto("Aarav Sharma", contact, "ACTIVE");
  db.values = {
    fullName: "Aarav Sharma",
    gender: "Ladka",
    dateOfBirth: "14/02/1996",
    height: `5'10"`,
    currentCity: "Jaipur",
    maritalStatus: "Never Married",
    education: "B.Tech",
    profession: "Software Engineer",
    motherTongue: "Hindi",
    diet: "Veg",
    familyType: "Joint family",
    partnerAgeRange: "25–29",
    hobbies: "Ghoomna,Music",
    aboutMe: "Main family-oriented aur practical hoon. Free time ghoomne aur music me nikalta hai.",
  };
  db.meta = Object.fromEntries(Object.keys(db.values).map((k) => [k, { source: "user" as const, confirmed: true }]));
  db.live = true;
  return db.user;
}

/* ------------------------------------------------------------------ */
/* Profile maths — the same rules the server applies                   */
/* ------------------------------------------------------------------ */

const FILLABLE = FIELDS.filter((f) => f.type !== "photo");

export function computeMyProfile(): MyProfile {
  // A reload forgets the in-memory account while the stored mock token still
  // says "signed in" — as the demo member, the same rule as the mock
  // `session()`. The app now opens on its remembered member before that call
  // returns, so the first screen can ask for the profile first.
  if (!db.user) signInDemoMember(MOCK_EXISTING_MOBILE);
  const values = db.values;
  const answered = FILLABLE.filter((f) => isAnswered(f, values));
  const completionPercent = Math.round((answered.length / FILLABLE.length) * 100);
  const blockers = MINIMUM_LIVE_KEYS.flatMap((key): ReadinessBlocker[] => {
    const def = FIELD_BY_KEY[key];
    if (!def) return [];
    const raw = values[key];
    if (!raw?.trim()) return [{ key, label: def.label, reason: "missing" }];
    if (!isValidFieldValue(def, raw)) return [{ key, label: def.label, reason: "invalid" }];
    const m = db.meta[key];
    if (m && !m.confirmed && m.source !== "user") return [{ key, label: def.label, reason: "unconfirmed" }];
    return [];
  });
  const ready = blockers.length === 0;
  const lifecycle = db.live ? "live" : ready ? "ready" : answered.length === 0 ? "empty" : "draft";

  return {
    profileId: "p_me",
    profileStatus: db.live ? "SUBMITTED" : "DRAFT",
    values: { ...values },
    meta: { ...db.meta },
    fillingFor: db.fillingFor,
    completionPercent,
    missingFields: FILLABLE.filter((f) => f.required && !isAnswered(f, values)).map((f) => f.key),
    isLive: db.live,
    lifecycle,
    readiness: {
      ready,
      done: MINIMUM_LIVE_KEYS.length - blockers.length,
      total: MINIMUM_LIVE_KEYS.length,
      blockers,
      needsReview: blockers.filter((b) => b.reason === "unconfirmed").map((b) => b.key),
    },
    reviewQueue: [],
    photos: db.photos,
    canPhotoEnhance: true,
    canPhotoUltraEnhance: false,
  };
}

export function mockConversations(): Conversation[] {
  return db.matches.map((m) => {
    const thread = db.threads[m.id] ?? [];
    const last = thread[thread.length - 1] ?? null;
    const p = person(m.profileId);
    return {
      matchId: m.id,
      other: { userId: p.userId, profileId: p.id, displayName: p.name, photoUrl: null, verified: p.verified },
      lastMessage: last ? { body: last.body, senderId: last.senderId, createdAt: last.createdAt } : null,
      unreadCount: thread.filter((msg) => msg.senderId !== "u_me" && !msg.readAt).length,
      updatedAt: last?.createdAt ?? ago(60),
      chatOpen: true,
    };
  });
}

export function makeMatch(profileId: string): string {
  const existing = db.matches.find((m) => m.profileId === profileId);
  if (existing) return existing.id;
  const matchId = `m_${profileId.replace(/^p_/, "")}`;
  db.matches.unshift(matchCardFor(profileId, matchId));
  db.threads[matchId] = [];
  const card = db.cards.find((c) => c.id === profileId);
  if (card) {
    card.matchId = matchId;
    card.photoUnlocked = true;
    card.photoLock = "open";
  }
  db.notices.unshift({
    id: `n_${matchId}`,
    kind: "MATCH_CREATED",
    title: "Naya match 🎉",
    body: "Aap dono ne ek doosre ko pasand kiya. Ab baat shuru kar sakte hain.",
    href: "/user/messages",
    actorMasked: false,
    relatedId: matchId,
    read: false,
    createdAt: new Date().toISOString(),
  });
  return matchId;
}
