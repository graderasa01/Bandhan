"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import {
  PIN_LENGTH,
  PIN_STRENGTH_MESSAGES,
  validatePinStrength,
} from "@/lib/auth/pinShared";
import { cn } from "@/lib/utils";

type Mode = "set" | "change" | "remove";

/**
 * Set / change / turn off the quick-unlock PIN.
 *
 * Sits next to `IncognitoToggle` on the dashboard rather than in a settings
 * page, because this app has no settings page — the one other privacy control
 * it owns lives here, and inventing a second home for the second control is
 * how a product ends up with two settings screens and neither one complete.
 * The shell below deliberately matches IncognitoToggle's row exactly so the
 * two read as one small privacy shelf.
 *
 * Plain `<input>`s here, not the lock screen's keypad: this is a
 * two-hands-on-the-phone configuration moment, and a change flow needs three
 * separate fields, which a single shared keypad can't address without a
 * wizard.
 */
export default function PinSettingsCard({ initialHasPin }: { initialHasPin: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [hasPin, setHasPin] = useState(initialHasPin);
  const [mode, setMode] = useState<Mode | null>(null);
  const [currentPin, setCurrentPin] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function close() {
    setMode(null);
    setCurrentPin("");
    setPin("");
    setConfirmPin("");
    setError(null);
  }

  function open(next: Mode) {
    close();
    setMode(next);
  }

  async function submit() {
    setError(null);

    if (mode === "remove") {
      if (currentPin.length !== PIN_LENGTH) {
        setError(PIN_STRENGTH_MESSAGES.FORMAT);
        return;
      }
    } else {
      // Same rules the API enforces (lib/auth/pinShared) — run here only so
      // the user hears "1234 nahi chalega" before a round trip, never instead
      // of the server check.
      const strength = validatePinStrength(pin);
      if (strength) {
        setError(PIN_STRENGTH_MESSAGES[strength]);
        return;
      }
      if (pin !== confirmPin) {
        setError("Dono PIN alag hain — dobara daaliye.");
        return;
      }
      if (mode === "change" && currentPin.length !== PIN_LENGTH) {
        setError("Purana PIN daaliye.");
        return;
      }
    }

    setBusy(true);
    try {
      const res = await fetch("/api/auth/pin", {
        method: mode === "remove" ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "remove"
            ? { pin: currentPin }
            : { pin, ...(mode === "change" ? { current_pin: currentPin } : {}) },
        ),
      });
      const json = await res.json();

      if (!res.ok || !json.ok) {
        setError(json.message ?? "Kuchh galat ho gaya — dobara try karein.");
        return;
      }

      setHasPin(json.has_pin);
      close();
      toast({
        title:
          mode === "remove"
            ? "Screen lock off"
            : mode === "change"
              ? "PIN badal gaya"
              : "Screen lock on — ab app khulte hi PIN poochha jayega",
        tone: mode === "remove" ? "info" : "success",
      });
      router.refresh();
    } catch {
      setError("Network error — dobara try karein.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-md border border-line px-3.5 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[0.875rem] font-medium text-ink">
            <KeyRound className="size-3.5 shrink-0" />
            Screen lock PIN
          </p>
          <p className="text-[0.75rem] leading-snug text-muted">
            {hasPin
              ? "On hai — app dobara kholte hi 4-digit PIN maanga jayega. Ghar me phone kisi aur ke haath lag jaye to aapki chats aur shortlist band rahengi."
              : "Phone ghar me share hota hai? Ek 4-digit PIN laga lijiye — app kholte hi PIN maanga jayega, taaki aapki chats aur shortlist sirf aapko dikhein. Login iska alag hai, ye sirf screen ka parda hai."}
          </p>
        </div>

        <div className="flex shrink-0 flex-col gap-1.5">
          {hasPin ? (
            <>
              <PinAction label="Change PIN" onClick={() => open("change")} active={mode === "change"} />
              <PinAction label="Turn Off" onClick={() => open("remove")} active={mode === "remove"} muted />
            </>
          ) : (
            <PinAction label="Set PIN" onClick={() => open("set")} active={mode === "set"} />
          )}
        </div>
      </div>

      {mode && (
        <div className="mt-3 space-y-2 border-t border-line pt-3">
          {(mode === "change" || mode === "remove") && (
            <PinField
              label={mode === "remove" ? "Apna PIN" : "Purana PIN"}
              value={currentPin}
              onChange={setCurrentPin}
              autoFocus
            />
          )}
          {mode !== "remove" && (
            <>
              <PinField label="Naya PIN" value={pin} onChange={setPin} autoFocus={mode === "set"} />
              <PinField label="Naya PIN dobara" value={confirmPin} onChange={setConfirmPin} />
            </>
          )}

          {error && (
            <p className="text-[0.75rem] leading-snug text-danger" role="alert">
              {error}
            </p>
          )}

          {mode !== "remove" && !error && (
            <p className="text-[0.6875rem] leading-snug text-subtle">
              1111 jaise same digits aur 1234 jaise sequence nahi chalenge. PIN bhool
              gaye to lock screen par &ldquo;Forgot PIN?&rdquo; se logout karke password se
              wapas aa sakte hain.
            </p>
          )}

          <div className="flex items-center gap-2 pt-0.5">
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[0.8125rem] font-semibold transition-colors disabled:opacity-60",
                mode === "remove"
                  ? "bg-danger text-white hover:brightness-110"
                  : "bg-primary text-primary-fg hover:bg-primary-hover",
              )}
            >
              {busy && <Loader2 className="size-3.5 animate-spin" />}
              {mode === "remove" ? "Turn Off" : mode === "change" ? "Change PIN" : "Set PIN"}
            </button>
            <button
              type="button"
              onClick={close}
              disabled={busy}
              className="h-9 rounded-full px-3 text-[0.8125rem] font-medium text-muted transition-colors hover:bg-bg-subtle hover:text-ink disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PinAction({
  label,
  onClick,
  active,
  muted = false,
}: {
  label: string;
  onClick: () => void;
  active: boolean;
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={active}
      className={cn(
        "h-8 whitespace-nowrap rounded-full border px-3 text-[0.75rem] font-semibold transition-colors",
        muted
          ? "border-line text-muted hover:border-danger/40 hover:text-danger"
          : "border-line-strong text-ink hover:border-gold-500 hover:bg-gold-50 dark:hover:bg-gold-900/30",
        active && !muted && "border-gold-500 bg-gold-50 dark:bg-gold-900/30",
        active && muted && "border-danger/40 text-danger",
      )}
    >
      {label}
    </button>
  );
}

function PinField({
  label,
  value,
  onChange,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-[0.75rem] text-muted">{label}</span>
      <input
        // `password` rather than a visible field: this card renders on the
        // dashboard, which is exactly the screen somebody might be reading
        // over the user's shoulder. `inputMode` still gets the digit keypad.
        type="password"
        inputMode="numeric"
        autoComplete="off"
        autoFocus={autoFocus}
        maxLength={PIN_LENGTH}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, PIN_LENGTH))}
        placeholder={"•".repeat(PIN_LENGTH)}
        className="h-10 w-24 rounded-md border border-line-strong bg-surface px-3 text-center text-base tracking-[0.35em] text-ink outline-none transition-[border-color,box-shadow] placeholder:tracking-[0.35em] placeholder:text-subtle focus:border-gold-500 focus:shadow-[0_0_0_3px_rgb(201_169_110_/_0.18)]"
      />
    </label>
  );
}
