import { IS_MOCK } from "./config";
import { api } from "./api/client";
import { db, delay } from "~/mocks/mockDb";

/**
 * Privacy controls the member owns — the web's own endpoints:
 *
 *   GET/POST /api/profile/incognito          browse without leaving a "viewed" trace (plan-gated)
 *   GET/POST /api/profile/photo-privacy      MEMBERS (default) | MATCH_ONLY (D-90)
 *   GET/PUT  /api/profile/discovery-consent  which sensitive fields search may match on
 */
export type PhotoPrivacy = "MEMBERS" | "MATCH_ONLY";
export type ConsentKey = "religion" | "caste" | "gotra" | "manglik" | "income";

export interface SettingsService {
  incognito(): Promise<{ enabled: boolean; allowed: boolean }>;
  setIncognito(enabled: boolean): Promise<void>;
  photoPrivacy(): Promise<PhotoPrivacy>;
  setPhotoPrivacy(value: PhotoPrivacy): Promise<void>;
  consent(): Promise<Record<ConsentKey, boolean>>;
  setConsent(patch: Partial<Record<ConsentKey, boolean>>): Promise<void>;
}

const live: SettingsService = {
  async incognito() {
    const res = await api<{ ok: boolean; enabled: boolean; allowed: boolean }>("/api/profile/incognito");
    return { enabled: res.enabled, allowed: res.allowed };
  },
  async setIncognito(enabled) {
    await api("/api/profile/incognito", { body: { enabled } });
  },
  async photoPrivacy() {
    const res = await api<{ ok: boolean; value: PhotoPrivacy }>("/api/profile/photo-privacy");
    return res.value;
  },
  async setPhotoPrivacy(value) {
    await api("/api/profile/photo-privacy", { body: { value } });
  },
  async consent() {
    const res = await api<{ ok: boolean; consent: Record<ConsentKey, boolean> }>("/api/profile/discovery-consent");
    return { ...res.consent };
  },
  async setConsent(patch) {
    await api("/api/profile/discovery-consent", { method: "PUT", body: patch });
  },
};

const mock: SettingsService = {
  async incognito() {
    await delay(150);
    return { enabled: db.settings.incognito, allowed: false };
  },
  async setIncognito(enabled) {
    await delay(150);
    db.settings.incognito = enabled;
  },
  async photoPrivacy() {
    await delay(150);
    return db.settings.photoPrivacy;
  },
  async setPhotoPrivacy(value) {
    await delay(150);
    db.settings.photoPrivacy = value;
  },
  async consent() {
    await delay(150);
    return { ...db.settings.consent };
  },
  async setConsent(patch) {
    await delay(150);
    db.settings.consent = { ...db.settings.consent, ...patch };
  },
};

export const settingsService: SettingsService = IS_MOCK ? mock : live;
