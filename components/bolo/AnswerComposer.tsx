"use client";

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { ArrowRight, Loader2, Mic, MicOff, Paperclip } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n/LanguageProvider";
import Waveform from "@/components/bolo/Waveform";

/** Past this the field scrolls instead of growing — about four lines. */
const MAX_INPUT_PX = 112;
/** A smaller gap is browser chrome settling, not a keyboard. */
const KEYBOARD_MIN_PX = 100;

/**
 * How far an on-screen keyboard reaches up over the page, in CSS pixels.
 *
 * Phones now shrink only the *visual* viewport when a keyboard opens (iOS
 * always has; Chrome on Android since 108), so a `position: fixed; bottom: 0`
 * bar stays pinned to the layout viewport — behind the keys. Reading the gap
 * off `visualViewport` and lifting the bar by it keeps the composer on top of
 * the keyboard. A pinch-zoomed page is not a keyboard.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => {
      if (Math.abs(viewport.scale - 1) > 0.01) return;
      const gap = Math.round(window.innerHeight - viewport.height - viewport.offsetTop);
      setInset(gap >= KEYBOARD_MIN_PX ? gap : 0);
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);

  return inset;
}

export type ComposerMicState = "idle" | "connecting" | "listening" | "speaking" | "muted";

/**
 * The one place to type — fixed to the bottom of the screen, above the home
 * indicator and, when it is open, above the keyboard.
 *
 * Attach (a biodata), the answer, the mic, Send: the same four things a
 * messaging app puts here, so nothing needs explaining. The mic starts Grio
 * when she is not live and pauses the microphone when she is — it never ends
 * the session (that is the voice bar's Stop), so typing and tapping always
 * happen *inside* the live conversation rather than instead of it.
 */
export default function AnswerComposer({
  inputRef,
  value,
  onChange,
  onSubmit,
  placeholder,
  busy = false,
  disabled = false,
  status,
  onAttach,
  attachBusy = false,
  mic,
  keyboardInset,
  onHeight,
}: {
  inputRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder: string;
  /** Reading a typed answer — Send spins and waits. */
  busy?: boolean;
  disabled?: boolean;
  /** One line above the bar while Grio is live; nothing otherwise. */
  status?: string | null;
  /** Omit where attaching makes no sense (the done screen). */
  onAttach?: () => void;
  attachBusy?: boolean;
  /** Null when this browser has no live voice. */
  mic?: { state: ComposerMicState; onPress: () => void } | null;
  keyboardInset: number;
  /** The bar's own height, so the page can keep its last line clear of it. */
  onHeight?: (px: number) => void;
}) {
  const t = useT();
  const rootRef = useRef<HTMLDivElement>(null);

  // Grow with the text, up to a few lines; `rows={1}` is the floor.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_PX)}px`;
    el.style.overflowY = el.scrollHeight > MAX_INPUT_PX ? "auto" : "hidden";
  }, [inputRef, value]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || !onHeight) return;
    const report = () => onHeight(el.offsetHeight);
    report();
    const observer = new ResizeObserver(report);
    observer.observe(el);
    return () => observer.disconnect();
  }, [onHeight]);

  const canSend = value.trim().length > 0 && !busy && !disabled;
  const live = mic ? mic.state !== "idle" : false;

  return (
    <div
      ref={rootRef}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 bg-gradient-to-t from-bg-subtle from-55% to-transparent pt-6"
      style={{
        transform: keyboardInset ? `translateY(-${keyboardInset}px)` : undefined,
        paddingBottom: keyboardInset ? "0.5rem" : "max(0.75rem, env(safe-area-inset-bottom))",
      }}
    >
      <div className="mx-auto w-full max-w-[34.5rem] px-3 sm:px-4">
        {status && (
          <p role="status" className="mb-2 flex items-center gap-2 px-3 text-[0.8125rem] leading-none text-muted">
            <Waveform mode="still" bars={5} className="h-3.5 w-[18px] shrink-0" />
            <span className="truncate">{status}</span>
          </p>
        )}

        <form
          className="pointer-events-auto flex items-end gap-1 rounded-[28px] border border-line/80 bg-surface p-1 shadow-[0_1px_2px_rgb(74_17_25/0.05),0_16px_36px_-18px_rgb(74_17_25/0.3)]"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSend) onSubmit();
          }}
        >
          {onAttach && (
            <>
              <button
                type="button"
                onClick={onAttach}
                disabled={attachBusy || disabled}
                aria-label={t("bolo.hero.biodata", "Upload Biodata")}
                title={t("bolo.hero.biodata", "Upload Biodata")}
                className="touch-target mb-1 grid size-9 shrink-0 place-items-center rounded-full text-muted outline-none transition-colors hover:bg-bg-subtle hover:text-ink focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                {attachBusy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Paperclip className="size-5" aria-hidden />}
              </button>
              <span aria-hidden className="mb-3 h-5 w-px shrink-0 bg-line" />
            </>
          )}

          <textarea
            ref={inputRef}
            rows={1}
            value={value}
            disabled={disabled}
            placeholder={placeholder}
            aria-label={t("bolo.composer.label", "Jawab likhein")}
            enterKeyHint="send"
            autoComplete="off"
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              // Not mid-composition: a Hindi or Marathi keyboard confirms a word with Enter.
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                if (canSend) onSubmit();
              }
            }}
            className="min-h-11 min-w-0 flex-1 resize-none bg-transparent px-2 py-3 text-[0.9375rem] leading-5 text-ink outline-none placeholder:text-subtle disabled:opacity-60"
          />

          {mic && (
            <button
              type="button"
              onClick={mic.onPress}
              disabled={mic.state === "connecting" || disabled}
              aria-label={live ? t("bolo.composer.mute", "Mute Mic") : t("bolo.hero.start", "Start Talking")}
              aria-pressed={live ? mic.state === "muted" : undefined}
              className={cn(
                "touch-target relative mb-1 grid size-9 shrink-0 place-items-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
                mic.state === "muted"
                  ? "bg-bg-subtle text-muted hover:text-ink"
                  : "bg-wine-50 text-accent-text hover:bg-wine-100 dark:bg-wine-900/40 dark:hover:bg-wine-900/60",
              )}
            >
              {mic.state === "listening" && (
                <span aria-hidden className="absolute inset-0 animate-pulse-ring rounded-full" />
              )}
              {mic.state === "connecting" ? (
                <Loader2 className="size-[18px] animate-spin" aria-hidden />
              ) : mic.state === "muted" ? (
                <MicOff className="size-[18px]" aria-hidden />
              ) : (
                <Mic className="size-[18px]" aria-hidden />
              )}
            </button>
          )}

          <button
            type="submit"
            disabled={!canSend}
            aria-label={t("bolo.typed.send", "Send")}
            className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-accent-fg shadow-sm outline-none transition-[transform,opacity,background-color] hover:bg-accent-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-95 disabled:opacity-60"
          >
            {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <ArrowRight className="size-5" aria-hidden />}
          </button>
        </form>
      </div>
    </div>
  );
}
