"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Delete, Loader2, Lock } from "lucide-react";
import BrandMark from "@/components/layout/BrandMark";
import { PIN_LENGTH } from "@/lib/auth/pinShared";
import { haptic } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * The household-privacy curtain.
 *
 * Rendered *instead of* the page by app/user/layout.tsx, never on top of it —
 * an overlay would still ship the page's chats and shortlists inside the HTML,
 * which is exactly the thing being hidden. See lib/auth/pin.ts for why the
 * gate lives at the render layer rather than the API layer.
 *
 * Keypad first, keyboard second: this screen's whole job happens in the two
 * seconds after a phone is unlocked, one-handed, usually with a thumb. The
 * digits sit low on the screen for that reason, and a hardware keyboard is
 * wired up as a courtesy for the desktop case rather than as the primary path.
 */
export default function PinLockScreen({
  userName,
  initialLockedSeconds = 0,
}: {
  userName: string;
  /** Server-rendered so a page refresh can't wish an active lockout away. */
  initialLockedSeconds?: number;
}) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [lockedSeconds, setLockedSeconds] = useState(initialLockedSeconds);
  const [shake, setShake] = useState(false);
  const submitting = useRef(false);

  const locked = lockedSeconds > 0;

  // One ticking clock rather than a re-render per second from the server.
  useEffect(() => {
    if (lockedSeconds <= 0) return;
    const id = setInterval(() => setLockedSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [lockedSeconds]);

  const submit = useCallback(
    async (value: string) => {
      // Guarded with a ref, not just `busy`: the auto-submit below fires from
      // inside a state update, so a fast double-tap on the fourth digit can
      // otherwise queue two requests and burn two of the five attempts.
      if (submitting.current) return;
      submitting.current = true;
      setBusy(true);
      setError(null);

      try {
        const res = await fetch("/api/auth/pin/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pin: value }),
        });
        const json = await res.json();

        if (res.ok && json.ok) {
          haptic("success");
          // `replace`, not `push` — a back tap should not return to a lock
          // screen that is now satisfied. Always to the dashboard rather than
          // the page they originally asked for: recovering that path would
          // mean plumbing the request URL from middleware into a server
          // component, and landing on your own home after unlocking is what
          // every phone lock screen already does.
          router.replace("/user/dashboard");
          router.refresh();
          return;
        }

        haptic("error");
        setShake(true);
        setTimeout(() => setShake(false), 400);
        setPin("");
        setError(
          json.attempts_left !== undefined
            ? `${json.message} ${json.attempts_left} koshish baaki hai.`
            : (json.message ?? "PIN galat hai."),
        );
        if (json.locked_for_seconds) setLockedSeconds(json.locked_for_seconds);
      } catch {
        setError("Network error — dobara try karein.");
        setPin("");
      } finally {
        submitting.current = false;
        setBusy(false);
      }
    },
    [router],
  );

  const press = useCallback(
    (digit: string) => {
      if (locked || busy) return;
      haptic("tap");
      setPin((prev) => {
        if (prev.length >= PIN_LENGTH) return prev;
        const next = prev + digit;
        // Auto-submit on the last digit — a 4-digit PIN with a separate
        // "OK" button is one tap of pure ceremony, every single unlock.
        if (next.length === PIN_LENGTH) void submit(next);
        return next;
      });
    },
    [locked, busy, submit],
  );

  const backspace = useCallback(() => {
    if (locked || busy) return;
    haptic("tap");
    setError(null);
    setPin((prev) => prev.slice(0, -1));
  }, [locked, busy]);

  // Desktop courtesy path. There is no focusable input on this screen (a
  // real <input> on mobile would summon the OS keyboard over the keypad),
  // so the listener sits on the document.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") backspace();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [press, backspace]);

  /**
   * The escape hatch, and deliberately the *only* one. This app has no SMS
   * OTP, and a PIN reset that emailed a code would be a second account
   * recovery path to attack for something that was never protecting the
   * account in the first place. Logging out costs the user one password
   * entry and resolves every case: forgotten PIN, borrowed phone, or a
   * relative who wants their own account back.
   */
  async function forgotPin() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.push("/login");
    router.refresh();
  }

  const lockMinutes = Math.floor(lockedSeconds / 60);
  const lockSecs = lockedSeconds % 60;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col overflow-y-auto bg-bg px-6 py-8">
      <div className="mx-auto flex w-full max-w-xs flex-1 flex-col items-center">
        <BrandMark showWordmark={false} className="mb-6 mt-4" />

        <span className="grid size-12 place-items-center rounded-full border border-line bg-surface text-primary-text">
          <Lock className="size-5" />
        </span>

        <h1 className="mt-4 text-center font-[family-name:var(--font-display)] text-xl font-bold text-accent-text">
          Namaste, {userName}
        </h1>
        <p className="mt-1.5 text-center text-[0.8125rem] leading-snug text-muted">
          Aapki chats aur shortlist private hain. Aage badhne ke liye apna
          4-digit PIN daaliye.
        </p>

        {/* The 4 dots — the entire state of the screen, big enough to read at
            arm's length while somebody else is in the room. */}
        <motion.div
          className="mt-8 flex items-center gap-4"
          animate={shake ? { x: [0, -9, 9, -6, 6, 0] } : { x: 0 }}
          transition={{ duration: 0.36 }}
          role="status"
          aria-label={`${pin.length} of ${PIN_LENGTH} digits entered`}
        >
          {Array.from({ length: PIN_LENGTH }).map((_, i) => (
            <span
              key={i}
              className={cn(
                "size-4 rounded-full border-2 transition-all duration-200",
                i < pin.length
                  ? "scale-110 border-primary bg-primary"
                  : "border-line-strong bg-transparent",
                error && "border-danger",
              )}
            />
          ))}
        </motion.div>

        <p
          className="mt-4 min-h-10 max-w-[17rem] text-center text-[0.8125rem] leading-snug text-danger"
          role="alert"
        >
          {locked
            ? `Bahut zyada galat koshish. ${lockMinutes}:${String(lockSecs).padStart(2, "0")} baad dobara try karein.`
            : error}
        </p>

        {/* Pushed to the bottom of the viewport on tall phones — thumb reach,
            not visual balance. */}
        <div className="mt-auto w-full pt-4">
          <div className="grid grid-cols-3 gap-3">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
              <PinKey key={d} label={d} onPress={() => press(d)} disabled={locked || busy} />
            ))}
            <span aria-hidden />
            <PinKey label="0" onPress={() => press("0")} disabled={locked || busy} />
            <PinKey
              label={<Delete className="size-5" />}
              ariaLabel="Delete"
              muted
              onPress={backspace}
              disabled={locked || busy || pin.length === 0}
            />
          </div>

          <div className="mt-6 flex h-6 items-center justify-center">
            {busy ? (
              <Loader2 className="size-4 animate-spin text-muted" aria-label="Checking" />
            ) : (
              <button
                type="button"
                onClick={forgotPin}
                disabled={loggingOut}
                className="text-[0.8125rem] font-semibold text-primary-text underline-offset-4 hover:underline disabled:opacity-60"
              >
                {loggingOut ? "Logging out…" : "Forgot PIN?"}
              </button>
            )}
          </div>
          <p className="mt-2 text-center text-[0.6875rem] leading-snug text-subtle">
            PIN bhool gaye? Logout karke password se wapas login kar lijiye —
            aapka data waise ka waisa rahega.
          </p>
        </div>
      </div>
    </div>
  );
}

function PinKey({
  label,
  ariaLabel,
  onPress,
  disabled,
  muted = false,
}: {
  label: ReactNode;
  ariaLabel?: string;
  onPress: () => void;
  disabled?: boolean;
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onPress}
      disabled={disabled}
      className={cn(
        "grid h-16 place-items-center rounded-full text-2xl font-semibold tabular-nums",
        "transition-[transform,background-color] duration-150 active:scale-95",
        "disabled:opacity-40 disabled:active:scale-100",
        muted
          ? "text-muted hover:bg-bg-subtle"
          : "border border-line bg-surface text-ink hover:border-gold-500 hover:bg-gold-50 dark:hover:bg-gold-900/30",
      )}
    >
      {label}
    </button>
  );
}
