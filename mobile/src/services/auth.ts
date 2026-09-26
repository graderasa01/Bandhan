import { IS_MOCK } from "./config";
import { ApiError, api } from "./api/client";
import { tokenStore } from "./api/tokenStore";
import { MOCK_EXISTING_MOBILE, MOCK_OTP, db, delay, mockUserDto, signInDemoMember } from "~/mocks/mockDb";
import type {
  CompleteAccountResponse,
  FillingFor,
  LoginResponse,
  OtpChannels,
  OtpSendResponse,
  OtpVerifyResponse,
  SessionResponse,
  UserDto,
} from "~/types/api";

/**
 * Authentication — the web's own endpoints, nothing re-implemented:
 *
 *   /api/auth/otp/status   which channels can deliver a code right now
 *   /api/auth/otp/send     send a code (per-contact and per-IP brakes are server-side)
 *   /api/auth/otp/verify   check it: logs an existing member in, or returns a
 *                          short-lived proof for a new account
 *   /api/bolo/complete     a proven contact (or, where no SMS provider exists,
 *                          a password) becomes an account + session
 *   /api/auth/login        mobile/email + password
 *   /api/auth/register     name + contact + password
 *   /api/auth/session      who is signed in; slides the 180-day session
 *   /api/auth/logout       revokes this device's session
 *
 * The session token each of these returns is stored by the API client.
 */
export interface CreateAccountInput {
  contact: string;
  /** From a verified OTP. */
  proof?: string;
  /** Only when no code could reach the contact (see completeService's rules). */
  password?: string;
  accountName: string;
  fillingFor: FillingFor;
  values: Record<string, string>;
}

export interface AuthService {
  otpChannels(): Promise<OtpChannels>;
  sendOtp(contact: string, intent: "login" | "signup"): Promise<OtpSendResponse>;
  verifyOtp(contact: string, code: string): Promise<OtpVerifyResponse>;
  loginWithPassword(mobileOrEmail: string, password: string): Promise<UserDto>;
  register(input: { fullName: string; contact: string; password: string }): Promise<UserDto>;
  createAccount(input: CreateAccountInput): Promise<{ live: boolean }>;
  session(): Promise<UserDto | null>;
  logout(): Promise<void>;
}

const live: AuthService = {
  async otpChannels() {
    return api<OtpChannels>("/api/auth/otp/status", { auth: false });
  },

  async sendOtp(contact, intent) {
    try {
      return await api<OtpSendResponse>("/api/auth/otp/send", { body: { contact, intent }, auth: false });
    } catch (err) {
      // 404 (no account for a login), 429 (cooldown) and 422 carry a useful body — pass it on as a result.
      if (err instanceof ApiError && err.body && typeof err.body === "object" && "ok" in err.body) {
        return err.body as OtpSendResponse;
      }
      throw err;
    }
  },

  async verifyOtp(contact, code) {
    try {
      // `login: true` either opens the existing member's session or, for a new
      // number, returns the proof the account step needs — one call for both.
      return await api<OtpVerifyResponse>("/api/auth/otp/verify", { body: { contact, code, login: true }, auth: false });
    } catch (err) {
      if (err instanceof ApiError && err.body && typeof err.body === "object" && "ok" in err.body) {
        return err.body as OtpVerifyResponse;
      }
      throw err;
    }
  },

  async loginWithPassword(mobileOrEmail, password) {
    const res = await api<LoginResponse>("/api/auth/login", {
      body: { mobile_or_email: mobileOrEmail.trim(), password, remember_me: true, portal: "member" },
      auth: false,
    });
    return res.user;
  },

  async register({ fullName, contact, password }) {
    const isEmail = contact.includes("@");
    const res = await api<LoginResponse>("/api/auth/register", {
      body: { full_name: fullName.trim(), password, ...(isEmail ? { email: contact.trim() } : { mobile: contact.trim() }) },
      auth: false,
    });
    return res.user;
  },

  async createAccount(input) {
    const res = await api<CompleteAccountResponse>("/api/bolo/complete", {
      body: {
        contact: input.contact,
        proof: input.proof,
        password: input.password,
        accountName: input.accountName,
        fillingFor: input.fillingFor,
        values: input.values,
      },
    });
    if (!res.ok) throw new ApiError(422, res.error, res.message, res);
    return { live: res.live };
  },

  async session() {
    const token = await tokenStore.get();
    if (!token) return null;
    const res = await api<SessionResponse>("/api/auth/session");
    return res.user;
  },

  async logout() {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } finally {
      await tokenStore.clear();
    }
  },
};

const mock: AuthService = {
  async otpChannels() {
    await delay(150);
    return { mobile: true, email: true };
  },
  async sendOtp(contact, intent) {
    await delay();
    const existingUser = contact.replace(/\D/g, "").endsWith(MOCK_EXISTING_MOBILE);
    if (intent === "login" && !existingUser) {
      return { ok: false, error: "no_account", message: "Is mobile/email se koi account nahi hai.", kind: "mobile" };
    }
    const masked = contact.includes("@") ? contact.replace(/^(.).+(@.+)$/, "$1•••$2") : `+91 •••••• ${contact.slice(-4)}`;
    return { ok: true, masked, existingUser, expiresInSeconds: 600, kind: contact.includes("@") ? "email" : "mobile" };
  },
  async verifyOtp(contact, code) {
    await delay();
    if (code.trim() !== MOCK_OTP) return { ok: false, error: "wrong", message: `Code galat hai (demo code: ${MOCK_OTP}).`, attemptsLeft: 4 };
    if (contact.replace(/\D/g, "").endsWith(MOCK_EXISTING_MOBILE)) {
      const user = signInDemoMember(contact);
      await tokenStore.set("mock-session");
      return { ok: true, loggedIn: true, user, landing: "/user/dashboard" };
    }
    return { ok: true, loggedIn: false, proof: "mock-proof", existingUser: false };
  },
  async loginWithPassword(mobileOrEmail) {
    await delay();
    const user = signInDemoMember(mobileOrEmail);
    await tokenStore.set("mock-session");
    return user;
  },
  async register({ fullName, contact }) {
    await delay();
    db.user = mockUserDto(fullName, contact, "INCOMPLETE");
    db.values = { fullName };
    db.meta = { fullName: { source: "user", confirmed: true } };
    await tokenStore.set("mock-session");
    return db.user;
  },
  async createAccount(input) {
    await delay();
    db.user = mockUserDto(input.accountName, input.contact, "INCOMPLETE");
    db.fillingFor = input.fillingFor;
    db.values = { ...input.values };
    db.meta = Object.fromEntries(Object.keys(input.values).map((k) => [k, { source: "user" as const, confirmed: true }]));
    await tokenStore.set("mock-session");
    return { live: false };
  },
  async session() {
    await delay(200);
    const token = await tokenStore.get();
    if (!token) return null;
    // A reload forgets the in-memory mock account; a stored mock token signs the demo member back in.
    return db.user ?? signInDemoMember(MOCK_EXISTING_MOBILE);
  },
  async logout() {
    await delay(150);
    db.user = null;
    await tokenStore.clear();
  },
};

export const authService: AuthService = IS_MOCK ? mock : live;
