import { IS_MOCK } from "./config";
import { ApiError, api } from "./api/client";
import { tokenStore } from "./api/tokenStore";
import { MOCK_EXISTING_MOBILE, MOCK_OTP, db, delay, mockUserDto, signInDemoMember } from "~/mocks/mockDb";
import { acceptAnswers, BOLO_FIELD_KEYS, isFillingFor, type BoloMember, type BoloValues } from "~/shared/bolo/draft";
import { isAcceptablePassword } from "~/shared/passwordPolicy";
import { MINIMUM_LIVE_FIELDS, isValidFieldValue } from "~/shared/readiness";
import type { CompleteAccountResponse, FieldMeta, FillingFor, OtpChannels } from "~/types/api";

/**
 * The native app's spoken front door (Bolo) — the web `/bolo` page's own
 * server calls, nothing re-implemented:
 *
 *   GET  /api/mobile/bolo         who is here (a visitor, or a member whose
 *                                 profile is not live) + voice + OTP channels
 *   POST /api/bolo/complete       the confirmed card → account/profile/live
 *   POST /api/profile/save-draft  a member's answers as they are given, with
 *                                 `activate: false` — live only from the review
 *   POST /api/auth/otp/send       a code to the visitor's contact
 *   POST /api/auth/otp/verify     the code → a short-lived proof (never a login)
 *   POST /api/auth/password       the done screen's optional password
 *   GET  /api/bolo/live-token     (voice/liveSession.ts) Grio's live credential
 */

export interface BoloBoot {
  member: BoloMember | null;
  voiceAvailable: boolean;
  channels: OtpChannels;
}

export type BoloBootResult = { kind: "ok"; boot: BoloBoot } | { kind: "notIncomplete" };

export interface CompleteBody {
  fillingFor: FillingFor;
  values: BoloValues;
  contact?: string;
  accountName?: string;
  proof?: string;
  password?: string;
}

export type SendOutcome =
  | { status: "sent"; masked: string; existingUser: boolean }
  | { status: "skipped"; existingUser: boolean }
  | { status: "invalid"; message: string }
  | { status: "rate_limited"; message: string; retryAfterSeconds: number }
  | { status: "error"; message: string };

export type VerifyOutcome =
  | { status: "verified"; proof: string; existingUser: boolean }
  | { status: "expired"; message: string }
  | { status: "wrong"; message: string; attemptsLeft: number | null }
  | { status: "error"; message: string };

export interface BoloService {
  boot(): Promise<BoloBootResult>;
  /** Never throws for a refusal the page words itself (PASSWORD_REQUIRED, ALREADY_EXISTS…) — those come back as `ok: false`. */
  complete(body: CompleteBody): Promise<CompleteAccountResponse>;
  /** A member's answers onto their profile as they are given — never goes live (that is the review's job). */
  autosave(values: BoloValues, meta: Record<string, FieldMeta>, fillingFor: FillingFor | null): Promise<void>;
  sendOtp(contact: string): Promise<SendOutcome>;
  verifyOtp(contact: string, code: string): Promise<VerifyOutcome>;
  setPassword(password: string): Promise<{ ok: true } | { ok: false; message: string }>;
}

const NETWORK = "Network error — dobara try karein.";

function bodyOf(err: unknown): Record<string, unknown> | null {
  return err instanceof ApiError && err.body && typeof err.body === "object" ? (err.body as Record<string, unknown>) : null;
}

const live: BoloService = {
  async boot() {
    try {
      const res = await api<{ ok: boolean; member: BoloMember | null; voiceAvailable: boolean; channels: OtpChannels }>("/api/mobile/bolo");
      return { kind: "ok", boot: { member: res.member, voiceAvailable: Boolean(res.voiceAvailable), channels: res.channels } };
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) return { kind: "notIncomplete" };
      throw err;
    }
  },

  async complete(body) {
    try {
      return await api<CompleteAccountResponse>("/api/bolo/complete", { body, timeoutMs: 40_000 });
    } catch (err) {
      const b = bodyOf(err);
      if (b && b.ok === false) return b as CompleteAccountResponse;
      throw err;
    }
  },

  async autosave(values, meta, fillingFor) {
    await api("/api/profile/save-draft", {
      body: { values, meta, ...(fillingFor ? { fillingFor } : {}), activate: false },
    });
  },

  async sendOtp(contact) {
    let body: Record<string, unknown>;
    try {
      body = await api<Record<string, unknown>>("/api/auth/otp/send", { body: { contact }, auth: false });
    } catch (err) {
      const b = bodyOf(err);
      if (!b) return { status: "error", message: err instanceof ApiError && err.isNetwork ? NETWORK : "OTP nahi bheja ja saka." };
      body = b;
    }
    const message = typeof body.message === "string" ? body.message : "";
    if (body.ok) return { status: "sent", masked: String(body.masked ?? ""), existingUser: Boolean(body.existingUser) };
    if (body.error === "not_configured") return { status: "skipped", existingUser: Boolean(body.existingUser) };
    if (body.error === "invalid") return { status: "invalid", message };
    if (body.error === "cooldown" || body.error === "rate_limited") {
      return { status: "rate_limited", message, retryAfterSeconds: Number(body.retryAfterSeconds ?? 60) };
    }
    return { status: "error", message: message || "OTP nahi bheja ja saka." };
  },

  async verifyOtp(contact, code) {
    let body: Record<string, unknown>;
    try {
      // No `login`: the web's /bolo takes a proof and lets /api/bolo/complete
      // decide — a returning number only fills what its profile still lacks.
      body = await api<Record<string, unknown>>("/api/auth/otp/verify", { body: { contact, code }, auth: false });
    } catch (err) {
      const b = bodyOf(err);
      if (!b) return { status: "error", message: err instanceof ApiError && err.isNetwork ? NETWORK : "Code check nahi ho paya." };
      body = b;
    }
    if (body.ok && typeof body.proof === "string") {
      return { status: "verified", proof: body.proof, existingUser: Boolean(body.existingUser) };
    }
    const message = typeof body.message === "string" ? body.message : "Code galat hai.";
    if (body.error === "expired" || body.error === "no_challenge" || body.error === "too_many_attempts") {
      return { status: "expired", message };
    }
    return { status: "wrong", message, attemptsLeft: typeof body.attemptsLeft === "number" ? body.attemptsLeft : null };
  },

  async setPassword(password) {
    try {
      await api("/api/auth/password", { body: { new_password: password } });
      return { ok: true };
    } catch (err) {
      const b = bodyOf(err);
      return { ok: false, message: typeof b?.message === "string" ? b.message : "Password save nahi ho paya." };
    }
  },
};

/* ------------------------------------------------------------------ */
/* Mock — the same rules against the in-memory backend                 */
/* ------------------------------------------------------------------ */

const MOCK_PROOF = "mock-proof";

/** `loadBoloMember`, against the mock profile. */
function mockMember(): BoloMember {
  const values: BoloValues = {};
  for (const key of BOLO_FIELD_KEYS) {
    const stored = db.values[key];
    if (!stored) continue;
    const read = acceptAnswers({}, { [key]: stored });
    if (read.saved.includes(key)) values[key] = read.values[key]!;
  }
  const hasAnswers = Object.keys(values).length > 0;
  const name = db.user?.full_name ?? "";
  return {
    userId: db.user?.id ?? "u_me",
    firstName: name.trim().split(/\s+/)[0] ?? "",
    fullName: name,
    values,
    fillingFor: hasAnswers ? db.fillingFor : null,
    needsReview: Object.entries(db.meta)
      .filter(([key, m]) => values[key] && m.source !== "user" && !m.confirmed)
      .map(([key]) => key),
    hasPassword: false,
  };
}

function mockReady(): boolean {
  return MINIMUM_LIVE_FIELDS.every((f) => {
    if (!isValidFieldValue(f, db.values[f.key])) return false;
    const m = db.meta[f.key];
    return !(m && !m.confirmed && m.source !== "user");
  });
}

function finishMock(values: BoloValues, fillingFor: FillingFor) {
  const accepted = acceptAnswers({}, values);
  db.values = { ...db.values, ...accepted.values };
  db.meta = { ...db.meta, ...Object.fromEntries(Object.keys(accepted.values).map((k) => [k, { source: "user" as const, confirmed: true }])) };
  db.fillingFor = fillingFor;
  const live = mockReady();
  if (live) {
    db.live = true;
    if (db.user) db.user = { ...db.user, status: "ACTIVE" };
  }
  return {
    ok: true as const,
    live,
    landing: live ? "/user/dashboard?profile=live" : "/bolo",
    existingAccount: false,
    verified: true,
    missing: MINIMUM_LIVE_FIELDS.filter((f) => !isValidFieldValue(f, db.values[f.key])).map((f) => f.key),
    hasPassword: false,
  };
}

const mock: BoloService = {
  async boot() {
    await delay(200);
    const token = await tokenStore.get();
    if (token && !db.user) signInDemoMember(MOCK_EXISTING_MOBILE);
    if (token && db.user && db.user.status !== "INCOMPLETE") return { kind: "notIncomplete" };
    return {
      kind: "ok",
      // No Gemini in the sample backend: the conversation runs on chips and typing.
      boot: { member: token && db.user ? mockMember() : null, voiceAvailable: false, channels: { mobile: true, email: true } },
    };
  },

  async complete(body) {
    await delay(500);
    const fillingFor = isFillingFor(body.fillingFor) ? body.fillingFor : "self";
    const accepted = acceptAnswers({}, body.values);
    const invalid = accepted.rejected.filter((r) => r.reason === "invalid");
    if (invalid.length > 0) {
      return { ok: false, error: "VALIDATION_FAILED", message: "Kuch values sahi nahi hain — review card me theek kar lijiye.", rejected: invalid.map((r) => ({ field: r.field, heard: r.heard })) };
    }
    if (await tokenStore.get()) return finishMock(accepted.values, fillingFor);
    const contact = (body.contact ?? "").trim();
    if (!contact) return { ok: false, error: "CONTACT_REQUIRED", message: "Valid 10-digit mobile number ya email daaliye." };
    if (body.proof !== MOCK_PROOF && !isAcceptablePassword(body.password)) {
      return { ok: false, error: "VERIFICATION_REQUIRED", message: "Pehle OTP se number confirm kijiye." };
    }
    db.user = mockUserDto(body.accountName?.trim() || accepted.values.fullName || "Member", contact, "INCOMPLETE");
    db.values = {};
    db.meta = {};
    await tokenStore.set("mock-session");
    return finishMock(accepted.values, fillingFor);
  },

  async autosave(values, meta, fillingFor) {
    await delay(150);
    db.values = { ...db.values, ...values };
    db.meta = { ...db.meta, ...meta };
    if (fillingFor) db.fillingFor = fillingFor;
  },

  async sendOtp(contact) {
    await delay();
    const digits = contact.replace(/\D/g, "");
    if (!contact.includes("@") && digits.length < 10) return { status: "invalid", message: "Valid 10-digit mobile number daaliye." };
    const masked = contact.includes("@") ? contact.replace(/^(.).+(@.+)$/, "$1•••$2") : `+91 •••••• ${digits.slice(-4)}`;
    return { status: "sent", masked, existingUser: digits.endsWith(MOCK_EXISTING_MOBILE) };
  },

  async verifyOtp(_contact, code) {
    await delay();
    if (code.trim() !== MOCK_OTP) return { status: "wrong", message: `Code galat hai (demo code: ${MOCK_OTP}).`, attemptsLeft: 4 };
    return { status: "verified", proof: MOCK_PROOF, existingUser: false };
  },

  async setPassword(password) {
    await delay(300);
    return isAcceptablePassword(password) ? { ok: true } : { ok: false, message: "Kam se kam 8 characters ka password chahiye." };
  },
};

export const boloService: BoloService = IS_MOCK ? mock : live;
