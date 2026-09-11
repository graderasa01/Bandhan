"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Mic, Square, Volume2 } from "lucide-react";
import { WebSpeechProvider } from "@/lib/speech/webSpeech";
import { WebSpeechOutputProvider } from "@/lib/speech/webSpeechOutput";
import { cn } from "@/lib/utils";
import Button from "@/components/ui/Button";
import { useT } from "@/components/i18n/LanguageProvider";

type Step = "idle" | "mobile" | "name" | "done";

const DEVANAGARI_DIGITS: Record<string, string> = {
  "०": "0",
  "१": "1",
  "२": "2",
  "३": "3",
  "४": "4",
  "५": "5",
  "६": "6",
  "७": "7",
  "८": "8",
  "९": "9",
};

const SPOKEN_DIGITS: Record<string, string> = {
  zero: "0",
  oh: "0",
  shunya: "0",
  ek: "1",
  one: "1",
  do: "2",
  two: "2",
  teen: "3",
  three: "3",
  char: "4",
  chaar: "4",
  four: "4",
  paanch: "5",
  panch: "5",
  five: "5",
  chhe: "6",
  che: "6",
  six: "6",
  saat: "7",
  sat: "7",
  seven: "7",
  aath: "8",
  ath: "8",
  eight: "8",
  nau: "9",
  nine: "9",
  "शून्य": "0",
  "एक": "1",
  "दो": "2",
  "तीन": "3",
  "चार": "4",
  "पांच": "5",
  "पाँच": "5",
  "छह": "6",
  "सात": "7",
  "आठ": "8",
  "नौ": "9",
};

export function mobileFromSpeech(raw: string): string | null {
  const translated = raw.replace(/[०-९]/g, (digit) => DEVANAGARI_DIGITS[digit] ?? "");
  let digits = translated.replace(/\D/g, "");

  // Chrome usually formats a spoken number as digits. On devices that return
  // one word per digit, cover the common Hindi/Hinglish spellings as well.
  if (digits.length < 10) {
    digits = translated
      .toLowerCase()
      .split(/[^\p{L}\d]+/u)
      .map((word) => (/^\d+$/.test(word) ? word : (SPOKEN_DIGITS[word] ?? "")))
      .join("");
  }

  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

function nameFromSpeech(raw: string): string {
  return raw
    .trim()
    .replace(/^(?:mera naam|my name is)\s+/i, "")
    .replace(/^मेरा नाम\s+/u, "")
    .replace(/\s+hai[.!]?$/i, "")
    .replace(/\s+है[।.!]?$/u, "")
    .trim()
    .slice(0, 80);
}

export default function VoiceRegisterAssistant({
  onMobile,
  onFullName,
}: {
  onMobile: (value: string) => void;
  onFullName: (value: string) => void;
}) {
  const t = useT();
  const inputRef = useRef<WebSpeechProvider | null>(null);
  const outputRef = useRef<WebSpeechOutputProvider | null>(null);
  const latestRef = useRef("");
  const failedRef = useRef(false);

  const [step, setStep] = useState<Step>("idle");
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [heard, setHeard] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    inputRef.current = new WebSpeechProvider();
    outputRef.current = new WebSpeechOutputProvider();
    return () => {
      inputRef.current?.stop();
      outputRef.current?.cancel();
    };
  }, []);

  function sayThen(text: string, next: () => void) {
    const output = outputRef.current;
    if (!output?.isAvailable()) {
      next();
      return;
    }
    setSpeaking(true);
    output.speak(text, {
      locale: "hi-IN",
      onEnd: () => {
        setSpeaking(false);
        next();
      },
      onError: () => {
        setSpeaking(false);
        next();
      },
    });
  }

  async function listenFor(field: "mobile" | "name") {
    const provider = inputRef.current;
    if (!provider?.isAvailable()) {
      setError(
        t(
          "register.voice.notSupported",
          "Is browser me voice input nahi chala. Neeche wahi details type kar dijiye.",
        ),
      );
      setStep("idle");
      return;
    }

    latestRef.current = "";
    failedRef.current = false;
    setHeard("");
    setError(null);
    setStep(field);
    setListening(true);

    try {
      await provider.start({
        locale: "hi-IN",
        autoStop: true,
        onResult: (result) => {
          latestRef.current = result.transcript.trim();
          setHeard(latestRef.current);
        },
        onError: (reason) => {
          failedRef.current = true;
          setListening(false);
          setError(
            reason === "permission_denied"
              ? t("register.voice.micDenied", "Mic ki permission nahi mili. Details type karke bhar dijiye.")
              : t("register.voice.notHeard", "Saaf sunai nahi diya. Ek baar phir boliye."),
          );
        },
        onEnd: () => {
          setListening(false);
          if (failedRef.current) return;
          const raw = latestRef.current;

          if (field === "mobile") {
            const mobile = mobileFromSpeech(raw);
            if (!mobile) {
              setError(t("register.voice.mobileAgain", "10 digit mobile number samajh nahi aaya. Dobara boliye."));
              return;
            }
            onMobile(mobile);
            sayThen(
              t("register.voice.askName", "Mobile number mil gaya. Ab apna poora naam bataiye."),
              () => void listenFor("name"),
            );
            return;
          }

          const name = nameFromSpeech(raw);
          if (name.length < 2) {
            setError(t("register.voice.nameAgain", "Poora naam samajh nahi aaya. Dobara boliye."));
            return;
          }
          onFullName(name);
          setStep("done");
          sayThen(
            t(
              "register.voice.doneSpoken",
              "Details bhar gayi hain. Ab password type kijiye, ya majboot password banane wala button dabaiye.",
            ),
            () => {},
          );
        },
      });
    } catch {
      setListening(false);
      setError(t("register.voice.startFailed", "Voice shuru nahi hui. Ek baar phir koshish kijiye."));
    }
  }

  function start() {
    setError(null);
    setStep("mobile");
    sayThen(
      t(
        "register.voice.askMobile",
        "Namaste. Sabse pehle apna 10 digit mobile number ek ek ank karke bataiye.",
      ),
      () => void listenFor("mobile"),
    );
  }

  function stop() {
    inputRef.current?.stop();
    setListening(false);
  }

  const retryField = step === "name" ? "name" : "mobile";

  return (
    <div className="mb-5 rounded-lg border border-gold-300/70 bg-gold-50/70 p-4 dark:bg-gold-900/20">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-primary-fg">
          {step === "done" ? (
            <CheckCircle2 className="size-5" />
          ) : speaking ? (
            <Volume2 className="size-5 animate-pulse" />
          ) : (
            <Mic className="size-5" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">
            {t("register.voice.title", "Bolkar account shuru karein")}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">
            {t(
              "register.voice.subtitle",
              "Pehle mobile, phir naam. Password kabhi mic par nahi liya jayega.",
            )}
          </p>
        </div>
      </div>

      {heard && (
        <p className="mt-3 rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink">
          <span className="mr-1 text-xs text-muted">{t("register.voice.heard", "Suna:")}</span>
          {heard}
        </p>
      )}

      {error && <p className="mt-3 text-xs font-medium text-danger">{error}</p>}

      <div className="mt-3">
        {listening ? (
          <Button type="button" size="sm" variant="secondary" onClick={stop}>
            <Square className="size-3.5 fill-current" />
            {t("register.voice.stop", "Sunna band karein")}
          </Button>
        ) : step === "done" ? (
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-trust">
            <CheckCircle2 className="size-4" />
            {t("register.voice.filled", "Mobile aur naam bhar gaye")}
          </p>
        ) : error ? (
          <Button type="button" size="sm" variant="secondary" onClick={() => void listenFor(retryField)}>
            <Mic className="size-4" />
            {t("register.voice.retry", "Dobara boliye")}
          </Button>
        ) : (
          <Button type="button" size="sm" variant="secondary" disabled={speaking} onClick={start}>
            <Mic className={cn("size-4", speaking && "animate-pulse")} />
            {t("register.voice.start", "Voice se shuru karein")}
          </Button>
        )}
      </div>
    </div>
  );
}
