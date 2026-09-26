import { Platform } from "react-native";
import { IS_MOCK } from "./config";
import { ApiError, api } from "./api/client";
import { computeMyProfile, db, delay } from "~/mocks/mockDb";
import { MOCK_PEOPLE } from "~/mocks/people";
import type { FieldMeta, FillingFor, MyProfile, PhotoUploadResponse, ProfileView, SaveDraftResponse } from "~/types/api";

/**
 * The member's own profile and other people's, through the web's endpoints:
 *
 *   GET  /api/profile/me            values + provenance + readiness + photos
 *   POST /api/profile/save-draft    autosave; goes live when the minimum is in
 *   POST /api/profile/photo         upload (JPG/PNG/WEBP ≤ 8MB, max 6)
 *   PATCH/DELETE /api/profile/photo/:id
 *   GET  /api/mobile/profile/:id    a profile as this member may see it
 *
 * Every typed value is sent with `source: "user", confirmed: true` — the
 * member vouched for it, which is what the live-readiness rule counts.
 */
export interface SaveInput {
  values: Record<string, string>;
  /** Defaults to "typed and confirmed by the member" for every key. */
  meta?: Record<string, FieldMeta>;
  fillingFor?: FillingFor;
}

export interface ProfileService {
  getMe(): Promise<MyProfile>;
  save(input: SaveInput): Promise<SaveDraftResponse>;
  uploadPhoto(uri: string, mimeType: string): Promise<PhotoUploadResponse>;
  deletePhoto(photoId: string): Promise<void>;
  makePrimary(photoId: string): Promise<void>;
  getProfile(profileId: string): Promise<ProfileView>;
}

function confirmedMeta(values: Record<string, string>): Record<string, FieldMeta> {
  return Object.fromEntries(Object.keys(values).map((key) => [key, { source: "user" as const, confirmed: true }]));
}

async function appendImage(form: FormData, uri: string, mimeType: string) {
  const ext = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
  if (Platform.OS === "web") {
    const blob = await (await fetch(uri)).blob();
    form.append("file", new File([blob], `photo.${ext}`, { type: mimeType }));
  } else {
    // React Native's FormData streams a file straight from its URI.
    form.append("file", { uri, name: `photo.${ext}`, type: mimeType } as unknown as Blob);
  }
}

const live: ProfileService = {
  getMe: () => api<MyProfile>("/api/profile/me"),

  save: ({ values, meta, fillingFor }) =>
    api<SaveDraftResponse>("/api/profile/save-draft", {
      body: { values, meta: meta ?? confirmedMeta(values), ...(fillingFor ? { fillingFor } : {}) },
    }),

  async uploadPhoto(uri, mimeType) {
    const form = new FormData();
    await appendImage(form, uri, mimeType);
    return api<PhotoUploadResponse>("/api/profile/photo", { method: "POST", form, timeoutMs: 60_000 });
  },

  async deletePhoto(photoId) {
    await api(`/api/profile/photo/${encodeURIComponent(photoId)}`, { method: "DELETE" });
  },

  async makePrimary(photoId) {
    await api(`/api/profile/photo/${encodeURIComponent(photoId)}`, { method: "PATCH", body: { isPrimary: true } });
  },

  async getProfile(profileId) {
    const res = await api<{ ok: boolean; profile: ProfileView }>(`/api/mobile/profile/${encodeURIComponent(profileId)}`);
    return res.profile;
  },
};

const mock: ProfileService = {
  async getMe() {
    await delay(250);
    return computeMyProfile();
  },
  async save({ values, meta, fillingFor }) {
    await delay(300);
    const wasLive = db.live;
    db.values = { ...db.values, ...values };
    db.meta = { ...db.meta, ...(meta ?? confirmedMeta(values)) };
    if (fillingFor) db.fillingFor = fillingFor;
    const me = computeMyProfile();
    const justActivated = !wasLive && me.readiness.ready;
    if (justActivated) {
      db.live = true;
      if (db.user) db.user = { ...db.user, status: "ACTIVE" };
    }
    const after = computeMyProfile();
    return {
      profileId: after.profileId,
      profileStatus: after.profileStatus,
      values: after.values,
      completionPercent: after.completionPercent,
      missingFields: after.missingFields,
      isLive: after.isLive,
      lifecycle: after.lifecycle,
      readiness: after.readiness,
      reviewQueue: after.reviewQueue,
      justActivated,
    };
  },
  async uploadPhoto(uri) {
    await delay(700);
    if (db.photos.length >= 6) throw new ApiError(422, "LIMIT_REACHED", "Ek profile par zyada se zyada 6 photo allowed hain.");
    const photo = {
      id: `ph_${Date.now()}`,
      fileUrl: uri,
      isPrimary: db.photos.length === 0,
      verificationStatus: "APPROVED" as const,
      note: null,
      slotOrder: db.photos.length + 1,
      focalY: null,
    };
    db.photos = [...db.photos, photo];
    return { photoId: photo.id, fileUrl: photo.fileUrl, isPrimary: photo.isPrimary, verificationStatus: photo.verificationStatus, slotOrder: photo.slotOrder };
  },
  async deletePhoto(photoId) {
    await delay(250);
    const wasPrimary = db.photos.find((p) => p.id === photoId)?.isPrimary;
    db.photos = db.photos.filter((p) => p.id !== photoId);
    if (wasPrimary && db.photos[0]) db.photos[0] = { ...db.photos[0], isPrimary: true };
  },
  async makePrimary(photoId) {
    await delay(200);
    db.photos = db.photos.map((p) => ({ ...p, isPrimary: p.id === photoId }));
  },
  async getProfile(profileId) {
    await delay(300);
    if (profileId === "me" || profileId === "p_me") {
      const v = db.values;
      return {
        profileId: "p_me",
        displayName: v.fullName ?? db.user?.full_name ?? "Aap",
        age: null,
        city: v.currentCity ?? null,
        headline: [v.education, v.profession].filter(Boolean).join(" · ") || null,
        bio: v.aboutMe ?? null,
        photoUrl: db.photos.find((p) => p.isPrimary)?.fileUrl ?? null,
        photoUnlocked: true,
        photoLock: "open",
        photoFocalY: null,
        slides: [],
        photoVerified: db.photos.length > 0,
        mobileVerified: true,
        trustScore: 64,
        trustScoreLabel: "Achha",
        level: "L3",
        isSelf: true,
        sections: [
          { title: "Basic", rows: [["Height", v.height], ["Marital Status", v.maritalStatus], ["Mother Tongue", v.motherTongue]].filter(([, val]) => val).map(([label, value]) => ({ label: label!, value: value! })) },
          { title: "Education & Career", rows: [["Education", v.education], ["Profession", v.profession], ["Work Location", v.workLocation]].filter(([, val]) => val).map(([label, value]) => ({ label: label!, value: value! })) },
          { title: "Family", rows: [["Family Type", v.familyType], ["Family Values", v.familyValues]].filter(([, val]) => val).map(([label, value]) => ({ label: label!, value: value! })) },
        ].filter((s) => s.rows.length > 0),
        kundliNotes: [],
        lockedHint: null,
        interestSent: false,
        interestReceived: false,
        matchId: null,
        shortlisted: false,
        askedStatus: "NONE",
        askBridgeEnabled: false,
      };
    }
    const p = MOCK_PEOPLE.find((x) => x.id === profileId);
    const card = db.cards.find((c) => c.id === profileId);
    if (!p || !card) throw new ApiError(404, "NOT_FOUND", "Profile nahi mila.");
    const matched = Boolean(card.matchId);
    return {
      profileId: p.id,
      displayName: p.name,
      age: p.age,
      city: p.city,
      headline: `${p.education} · ${p.profession}`,
      bio: p.about,
      photoUrl: null,
      photoUnlocked: card.photoUnlocked,
      photoLock: card.photoLock,
      photoFocalY: null,
      slides: [],
      photoVerified: p.verified,
      mobileVerified: p.verified,
      trustScore: p.trust,
      trustScoreLabel: p.trust >= 80 ? "Strong" : "Achha",
      level: matched ? "L3" : card.interestSent ? "L2" : "L1",
      isSelf: false,
      sections: [
        { title: "Basic", rows: [{ label: "Height", value: p.height }, { label: "Mother Tongue", value: p.motherTongue }, { label: "Marital Status", value: "Never Married" }] },
        { title: "Education & Career", rows: [{ label: "Education", value: p.education }, { label: "Profession", value: p.profession }] },
        { title: "Family", rows: [{ label: "Family Type", value: p.familyType }] },
        { title: "Lifestyle", rows: [{ label: "Diet", value: p.diet }, { label: "Hobbies", value: p.hobbies.join(", ") }] },
      ],
      kundliNotes: [],
      lockedHint: matched
        ? null
        : {
            title: card.interestSent ? "Match hone par poori profile khulegi" : "Interest bhejne par aur khulega",
            description: card.interestSent
              ? "Photo, jaati, gotra, manglik aur aay ki range — ye sirf tab dikhte hain jab dono taraf se haan ho jaye."
              : "College, kaam ka sheher, parivaar ki jaankari aur unki apeksha — interest bhejte hi ye sab dikhne lagega.",
          },
      interestSent: card.interestSent,
      interestReceived: db.received.some((i) => i.profileId === p.id),
      matchId: card.matchId,
      shortlisted: card.shortlisted,
      askedStatus: card.askedStatus,
      askBridgeEnabled: true,
    };
  },
};

export const profileService: ProfileService = IS_MOCK ? mock : live;
