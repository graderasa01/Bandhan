import { create } from "zustand";
import { authService } from "~/services/auth";
import { ApiError, onUnauthenticated } from "~/services/api/client";
import { memberCache, tokenStore } from "~/services/api/tokenStore";
import type { UserDto } from "~/types/api";

/**
 * Who is signed in. The token itself lives in the keychain (`tokenStore`);
 * this store holds what the UI needs to route: unknown → signed out / in, and
 * the member's status (INCOMPLETE members are sent to profile setup — the
 * same rule `landingPathForRole` applies on the web).
 *
 *   loading    launch, before the keychain has been read — the navigator is
 *              not mounted yet, so the URL the app was opened with (a
 *              notification, a link) survives until the guards can judge it
 *   offline    a token, but no network and no remembered member — the boot
 *              screen offers a retry instead of guessing where to send them
 *   signedOut / signedIn
 */
type Status = "loading" | "offline" | "signedOut" | "signedIn";

interface SessionState {
  status: Status;
  user: UserDto | null;
  /** Reads the stored token and asks the server who it belongs to. */
  hydrate(): Promise<void>;
  /** After any successful login / OTP / account creation (the token is already stored). */
  signedIn(user: UserDto): void;
  /** Re-read the member (status changes when a profile goes live). */
  refresh(): Promise<UserDto | null>;
  markActive(): void;
  signOut(): Promise<void>;
}

export const useSession = create<SessionState>((set, get) => ({
  status: "loading",
  user: null,

  async hydrate() {
    const token = await tokenStore.get();
    if (!token) {
      set({ status: "signedOut", user: null });
      return;
    }

    // Open on the right screen at once — the server's answer follows.
    const known = await memberCache.get();
    if (known) set({ status: "signedIn", user: known });

    try {
      const user = await authService.session();
      if (user) {
        set({ status: "signedIn", user });
        void memberCache.set(user);
      } else {
        await tokenStore.clear();
        set({ status: "signedOut", user: null });
      }
    } catch (err) {
      // A 401 is a real sign-out. Anything else (no signal) keeps the member
      // signed in as last known; with nothing known, the boot screen asks to retry.
      if (err instanceof ApiError && err.status === 401) {
        await tokenStore.clear();
        set({ status: "signedOut", user: null });
      } else if (!known) {
        set({ status: "offline", user: null });
      }
    }
  },

  signedIn(user) {
    set({ status: "signedIn", user });
    void memberCache.set(user);
  },

  async refresh() {
    try {
      const user = await authService.session();
      if (user) {
        set({ user });
        void memberCache.set(user);
      }
      return user;
    } catch {
      return get().user;
    }
  },

  markActive() {
    const user = get().user;
    if (user && user.status !== "ACTIVE") {
      const active: UserDto = { ...user, status: "ACTIVE" };
      set({ user: active });
      void memberCache.set(active);
    }
  },

  async signOut() {
    try {
      await authService.logout();
    } catch {
      await tokenStore.clear();
    }
    set({ status: "signedOut", user: null });
  },
}));

// A revoked or expired session anywhere in the app lands back on login.
onUnauthenticated(() => {
  void tokenStore.clear();
  useSession.setState({ status: "signedOut", user: null });
});
