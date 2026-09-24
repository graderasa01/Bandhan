"use client";

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { ArrowRight, Loader2, Mic, MicOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n/LanguageProvider";

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
 * The answer, the mic, Send — and nothing else: no attach, no status line.
 * Whether Grio is live, listening or muted is the voice bar's job, so the bar
 * down here stays one clean floating pill. The mic starts Grio when she is not
 * live and pauses the microphone when she is — it never ends the session (that
 * is the voice bar's Stop), so typing and tapping always happen *inside* the
 * live conversation rather than instead of it.
 */
export default function AnswerComposer({
  inputRef,
  value,
  onChange,
  onSubmit,
  placeholder,
  busy = false,
  disabled = false,
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
      className="bolo-dock pointer-events-none"
      style={{
        transform: keyboardInset ? `translateY(-${keyboardInset}px)` : undefined,
        paddingBottom: keyboardInset ? "0.5rem" : undefined,
      }}
    >
      <div className="bolo-dock__inner">
        <form
          className="bolo-pane bolo-composer pointer-events-auto flex min-h-[68px] items-center pl-[10px] pr-[8px]"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSend) onSubmit();
          }}
        >
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
            className="ml-[11px] min-h-[24px] min-w-0 flex-1 resize-none bg-transparent py-[3px] text-[15px] leading-[1.35] text-primary outline-none placeholder:text-[#b3a79d] disabled:opacity-60"
          />

          {mic && (
            <button
              type="button"
              onClick={mic.onPress}
              disabled={mic.state === "connecting" || disabled}
              aria-label={live ? t("bolo.composer.mute", "Mute Mic") : t("bolo.hero.start", "Start Talking")}
              aria-pressed={live ? mic.state === "muted" : undefined}
              className={cn(
                "bolo-mic touch-target relative ml-[8px] grid size-[45px] shrink-0 place-items-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
                mic.state === "muted" && "bolo-mic--muted",
              )}
            >
              {mic.state === "listening" && (
                <span aria-hidden className="absolute inset-0 animate-pulse-ring rounded-full" />
              )}
              {mic.state === "connecting" ? (
                <Loader2 className="size-[21px] animate-spin" aria-hidden />
              ) : mic.state === "muted" ? (
                <MicOff className="size-[21px]" aria-hidden />
              ) : (
                <Mic className="size-[21px]" strokeWidth={1.9} aria-hidden />
              )}
            </button>
          )}

          <span aria-hidden className="ml-[9px] h-[26px] w-px shrink-0 bg-white/22" />

          <button
            type="submit"
            disabled={!canSend}
            aria-label={t("bolo.typed.send", "Send")}
            className="bolo-send ml-[9px] grid size-[50px] shrink-0 place-items-center rounded-full outline-none transition-[transform,opacity] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-95"
          >
            {busy ? (
              <Loader2 className="size-[24px] animate-spin" aria-hidden />
            ) : (
              <ArrowRight className="size-[26px]" strokeWidth={2.2} aria-hidden />
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
