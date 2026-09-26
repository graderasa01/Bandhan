import { IS_MOCK } from "./config";
import { api } from "./api/client";
import { db, delay } from "~/mocks/mockDb";
import type { NavCounts, Notice } from "~/types/api";

/**
 * The member's inbox and the badge counts — the same `createNotice()` rows the
 * web inbox and web push read (lib/services/notice), so a notice is written
 * once and shows up everywhere.
 *
 *   GET  /api/notices              list + unread count
 *   POST /api/notices/:id/read     mark one read
 *   POST /api/notices              mark all read
 *   GET  /api/nav/counts           matches / interests / messages / inbox badges
 */
export interface NoticesService {
  list(): Promise<{ notices: Notice[]; unreadCount: number }>;
  markRead(id: string): Promise<void>;
  markAllRead(): Promise<void>;
  counts(): Promise<NavCounts>;
}

const live: NoticesService = {
  async list() {
    const res = await api<{ ok: boolean; notices: Notice[]; unreadCount: number }>("/api/notices");
    return { notices: res.notices, unreadCount: res.unreadCount };
  },
  async markRead(id) {
    await api(`/api/notices/${encodeURIComponent(id)}/read`, { method: "POST" });
  },
  async markAllRead() {
    await api("/api/notices", { method: "POST" });
  },
  async counts() {
    const res = await api<{ ok: boolean; counts: NavCounts }>("/api/nav/counts");
    return res.counts;
  },
};

const mock: NoticesService = {
  async list() {
    await delay(250);
    return { notices: [...db.notices], unreadCount: db.notices.filter((n) => !n.read).length };
  },
  async markRead(id) {
    await delay(100);
    const n = db.notices.find((x) => x.id === id);
    if (n) n.read = true;
  },
  async markAllRead() {
    await delay(150);
    db.notices.forEach((n) => (n.read = true));
  },
  async counts() {
    await delay(150);
    return {
      matches: db.matches.filter((m) => (db.threads[m.id]?.length ?? 0) === 0).length,
      interests: db.received.filter((i) => i.status === "RECEIVED").length,
      messages: Object.values(db.threads).flat().filter((m) => m.senderId !== "u_me" && !m.readAt).length,
      inbox: db.notices.filter((n) => !n.read).length,
    };
  },
};

export const noticesService: NoticesService = IS_MOCK ? mock : live;
