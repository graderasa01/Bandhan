"use client";

import { Mic, MicOff } from "lucide-react";
import type { LiveStatus } from "@/lib/bolo/liveClient";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n/LanguageProvider";
import Waveform from "@/components/bolo/Waveform";

/**
 * What the bar is reporting:
 *
 *   live    — a session is open: connecting, listening or speaking
 *   idle    — voice works here and nothing is running (not started, or stopped)
 *   retry   — the last session ended on its own: the network, a long silence, a limit
 *   off     — voice is switched off, or this browser cannot do live audio
 *   leaving — `go_next` has run and the page is on its way out
 */
export type VoiceBarMode = "live" | "idle" | "retry" | "off" | "leaving";

/** Past this, only the latest words of what is being heard — or said — are shown. */
const HEARD_TAIL = 44;

/** The tail of a live transcript, so a long sentence reads from its newest end. */
function tail(text: string): string | null {
  const said = text.trim();
  if (!said) return null;
  return said.length > HEARD_TAIL ? `…${said.slice(-HEARD_TAIL)}` : said;
}

/**
 * The live voice, as one slim line under the header.
 *
 * It replaced a large mic orb. A family on a phone needs two facts about the
 * voice — is it on, and whose turn is it — and a sentence beside a small
 * waveform says both without taking the room the question needs. It stays up
 * for the whole conversation, and nothing tapped or typed below it restarts
 * what it reports: only Stop ends a session, only Start or Reconnect begins one.
 *
 * ## The caption
 *
 * The second line is the words themselves: what Grio is saying while she has
 * the turn, what the visitor is saying while she is listening. It persists —
 * Grio's last line stays up through the silence after it rather than blinking
 * back to a hint, because a caption that only exists mid-sentence is a caption
 * nobody on a noisy bus can read. `Beech mein bol sakte hain` is the fallback
 * for the moment before any words exist.
 *
 * ## The rim
 *
 * `.bolo-live` is the light's hook (globals.css): champagne on the left, mint
 * at the right, with the bloom behind a frosted bar so it shows at the edges
 * and never under the words. Nothing here decides when it lights up —
 * `data-voice-state` upstream does.
 */
export default function LiveVoiceBar({
  mode,
  status,
  level,
  muted,
  heard,
  said = "",
  noMic = false,
  onStart,
  onStop,
}: {
  mode: VoiceBarMode;
  status: LiveStatus;
  level: number;
  /** The mic is paused from the composer — the session itself is still open. */
  muted: boolean;
  /** What the visitor is saying right now, as Gemini hears it. */
  heard: string;
  /** What Grio is saying — or last said — as Gemini transcribes her. */
  said?: string;
  /** "off" because this browser has no live audio, rather than because voice is switched off. */
  noMic?: boolean;
  onStart: () => void;
  onStop: () => void;
}) {
  const t = useT();
  const connecting = mode === "live" && status === "connecting";
  const speaking = mode === "live" && status === "speaking";
  const heardLine = tail(heard);
  const grioLine = tail(said);
  const caption = t("bolo.bar.speakingSub", "Beech mein bol sakte hain");

  let title: string;
  let sub: string | null;
  if (mode === "leaving") {
    title = t("bolo.status.leaving", "Chaliye — rishte khul rahe hain…");
    sub = grioLine;
  } else if (mode === "live") {
    if (connecting) {
      title = t("bolo.bar.connecting", "Grio connect ho rahi hai…");
      sub = t("bolo.bar.connectingSub", "Bas ek second");
    } else if (muted) {
      title = t("bolo.bar.muted", "Mic band hai");
      sub = t("bolo.bar.mutedSub", "Mic dabakar phir bol sakte hain");
    } else if (speaking) {
      title = t("bolo.bar.speaking", "Grio bol rahi hai");
      // Her own words while she has the turn; the hint only until there are any.
      sub = grioLine ?? caption;
    } else {
      title = t("bolo.bar.listening", "Grio sun rahi hai");
      // The visitor's words win here — it is their turn — and her last line
      // stays up in the pause before they start.
      sub = (heardLine ? `“${heardLine}”` : null) ?? grioLine ?? caption;
    }
  } else if (mode === "retry") {
    title = t("bolo.bar.retry", "Grio ruk gayi");
    sub = t("bolo.bar.retrySub", "Jawab safe hain");
  } else if (mode === "off") {
    title = noMic ? t("bolo.bar.noMic", "Is browser me live voice nahi chalti") : t("bolo.bar.off", "Voice abhi band hai");
    sub = t("bolo.bar.offSub", "Tap karke ya likh kar jawab dein");
  } else {
    title = t("bolo.bar.idle", "Grio se baat karein");
    sub = t("bolo.bar.idleSub", "Awaaz se jawab dein");
  }

  const wave = mode !== "live" || connecting || muted ? "rest" : speaking ? "speaking" : "listening";

  return (
    <div className="bolo-live">
      <section
        aria-label={t("bolo.bar.label", "Grio live voice")}
        className="bolo-pane bolo-live__bar flex min-h-[62px] items-center pl-[8px] pr-[9px]"
      >
        {mode === "off" ? (
          <span className="glass-inner-bubble grid size-[46px] shrink-0 place-items-center">
            <MicOff className="size-5 text-secondary" aria-hidden />
          </span>
        ) : (
          <span className="glass-inner-bubble grid size-[46px] shrink-0 place-items-center">
            <Waveform mode={wave} level={level} className="h-[30px] w-[36px]" />
          </span>
        )}
        {mode === "live" && (
          <span
            aria-hidden
            className={cn(
              "ml-[11px] size-[13px] shrink-0 rounded-full",
              connecting
                ? "animate-pulse-soft bg-[#f0c060] shadow-[0_0_10px_rgb(240_192_96/0.7)]"
                : muted
                  ? "bg-white/30"
                  : "bg-[#37db96] shadow-[0_0_11px_rgb(55_219_150/0.72)]",
            )}
          />
        )}
        <div className="ml-[14px] min-w-0 flex-1 py-[2px]">
          {mode === "live" && (
            <p className="text-[9.5px] font-bold uppercase leading-none tracking-[0.07em] text-gold">
              {t("bolo.bar.liveLabel", "Live voice")}
            </p>
          )}
          <p
            className={cn("truncate text-[14px] font-semibold leading-[1.2] text-primary", mode === "live" && "mt-[5px]")}
            aria-live="polite"
          >
            {title}
          </p>
          {sub && <p className="mt-[3px] truncate text-[12.5px] leading-[1.2] text-secondary">{sub}</p>}
        </div>
        {mode === "live" && (
          <>
            <span aria-hidden className="ml-[10px] h-[31px] w-px shrink-0 bg-white/20" />
            <button
              type="button"
              onClick={onStop}
              aria-label={t("bolo.voice.stop", "Stop")}
              title={t("bolo.voice.stop", "Stop")}
              className="bolo-stop touch-target ml-[10px] grid size-[42px] shrink-0 place-items-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="bolo-stop__square size-[15px] rounded-[4px]" />
            </button>
          </>
        )}
        {(mode === "idle" || mode === "retry") && (
          <button
            type="button"
            onClick={onStart}
            className="bolo-start touch-target ml-[10px] inline-flex h-[36px] shrink-0 items-center gap-1.5 rounded-full px-[14px] text-[13.5px] font-semibold outline-none transition-transform focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.97]"
          >
            <Mic className="size-4" aria-hidden />
            {mode === "retry" ? t("bolo.bar.reconnect", "Reconnect") : t("bolo.bar.start", "Start")}
          </button>
        )}
      </section>
    </div>
  );
}
