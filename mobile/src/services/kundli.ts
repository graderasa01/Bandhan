import { IS_MOCK } from "./config";
import { ApiError, api } from "./api/client";
import { delay } from "~/mocks/mockDb";
import { mockMilan, mockMyKundli } from "~/mocks/kundli";
import type { KundliMilanResponse, MyKundliResponse } from "~/types/api";

/**
 * Kundli — only ever read, never computed, on the phone:
 *
 *   GET /api/kundli/milan/:profileId   the reel's Kundli sheet (`getKundliMatchView`)
 *   GET /api/mobile/kundli             Meri Kundli (`getOwnChart` + `getMatchMilanList`)
 *
 * Milan is information about a profile the member opened; it is never a
 * ranking input, and the app never scores a pair itself.
 */
export interface KundliService {
  /**
   * Resolves `{ ok: false, message }` when the server says this profile is not
   * available (hidden, blocked, yourself) — a state, not an error. Throws on a
   * network or server failure, which the sheet offers to retry.
   */
  milan(profileId: string): Promise<KundliMilanResponse>;
  mine(): Promise<MyKundliResponse>;
}

const live: KundliService = {
  async milan(profileId) {
    try {
      return await api<KundliMilanResponse>(`/api/kundli/milan/${encodeURIComponent(profileId)}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return { ok: false, message: err.message };
      throw err;
    }
  },
  mine: () => api<MyKundliResponse>("/api/mobile/kundli"),
};

const mock: KundliService = {
  async milan(profileId) {
    await delay(500);
    return mockMilan(profileId);
  },
  async mine() {
    await delay(400);
    return mockMyKundli();
  },
};

export const kundliService: KundliService = IS_MOCK ? mock : live;
