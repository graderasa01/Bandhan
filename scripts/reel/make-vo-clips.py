# -*- coding: utf-8 -*-
"""Speak each shot's line as its own file, and report how long each one came out.

Two providers. Sarvam (default) is an Indian model whose Hindi is the reason to
pick it, and the app already talks to it — this uses the same request shape as
app/api/speech/tts/route.ts so there is one known-good way to call it in the
repo, not two. ElevenLabs is there if you prefer its read.

Two of these files go to OpenArt as the audio element for a lip-synced shot, so
the shot's video duration has to match the take — that is what the printed
durations are for. The rest are laid under the page shots by build-narrator-ad.py.

Not runnable from the Claude Code web sandbox: its proxy answers 403 to
api.elevenlabs.io. Run locally.

    export SARVAM_API_KEY=...
    python3 make-vo-clips.py --set story                 # default: sarvam, shreya
    python3 make-vo-clips.py --set story --voice priya
    python3 make-vo-clips.py --audition                  # one line in six voices

    export ELEVENLABS_API_KEY=...  ELEVENLABS_VOICE_ID=...
    python3 make-vo-clips.py --set story --provider elevenlabs
"""
import base64, json, os, pathlib, subprocess, sys, urllib.error, urllib.request

HERE = pathlib.Path(__file__).resolve().parent
VO = HERE / "vo"; VO.mkdir(exist_ok=True)

EL_KEY = os.environ.get("ELEVENLABS_API_KEY")
EL_VOICE = os.environ.get("ELEVENLABS_VOICE_ID", "EXAVITQu4vr4xnSDxMaL")
EL_MODEL = os.environ.get("ELEVENLABS_MODEL", "eleven_multilingual_v2")

SARVAM_KEY = os.environ.get("SARVAM_API_KEY")
# "shreya" is not a guess: lib/speech/voiceCatalog.ts records that the team
# listened to priya / neha / kavya / shreya and chose it as the product's
# assistant voice. Using the same one keeps the ad and the app sounding like
# one company. --audition renders the shortlist so a person can still overrule
# it by ear, which is the only way a voice should ever be chosen.
SARVAM_VOICE = os.environ.get("SARVAM_VOICE", "shreya")
AUDITION = ["shreya", "priya", "neha", "kavya", "ritu", "ishita"]

# One entry per shot of the narrator cut. `lipsync` marks the two the narrator
# is on screen for — those are the files the lip-sync model gets.
#
# These lines stay in Devanagari on purpose, and they are the one place in the
# pipeline that does. Nobody ever sees them: they are what the voice model
# READS. Hand a TTS "Baat sirf 2 se hui" and it reasons about English spelling
# and returns an English accent; hand it the same sentence in Devanagari and it
# speaks Hindi. Everything the VIEWER reads — every caption, every frame —
# is Roman Hinglish, matching the site (app/layout.tsx, HomePageView.tsx).
SHOTS = [
    ("talk1", True,
     "दस हज़ार प्रोफाइल देखीं… बात सिर्फ़ दो से हुई। "
     "कमी प्रोफाइल की नहीं थी — कमी वजह की थी।"),
    ("bolo", False,
     "BandhanTak पे फ़ॉर्म नहीं भरते — बस बोलते हैं। दो मिनट में प्रोफाइल तैयार।"),
    ("reel", False,
     "रोज़ कुछ चुने हुए रिश्ते — और हर एक के साथ वजह।"),
    ("talk2", True,
     "सात लेवल वेरिफिकेशन। और जो verify नहीं है, वो भी छुपाया नहीं जाता। "
     "BandhanTak — प्रोफाइल बनाना फ्री है।"),
]

def ffmpeg():
    if os.environ.get("FFMPEG"):
        return os.environ["FFMPEG"]
    r = subprocess.run(["node", "-p", "require('ffmpeg-static')"],
                       cwd=HERE, capture_output=True, text=True)
    if r.returncode == 0 and r.stdout.strip():
        return r.stdout.strip()
    raise SystemExit("No ffmpeg. `npm i ffmpeg-static` here, or set $FFMPEG.")

def speak_sarvam(text, path, voice):
    """Same call the app makes (app/api/speech/tts/route.ts): bulbul:v3 at
    24kHz, answering with base64 WAV in `audios`."""
    req = urllib.request.Request(
        "https://api.sarvam.ai/text-to-speech",
        data=json.dumps({
            "text": text,
            "language_code": "hi-IN",
            "speaker": voice,
            "model": "bulbul:v3",
            "speech_sample_rate": 24000,
        }).encode("utf-8"),
        headers={"api-subscription-key": SARVAM_KEY, "content-type": "application/json"},
        method="POST")
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            audio = json.loads(r.read()).get("audios", [None])[0]
    except urllib.error.HTTPError as e:
        raise SystemExit(f"Sarvam {e.code}: {e.read()[:300].decode('utf-8', 'replace')}")
    except urllib.error.URLError as e:
        raise SystemExit(f"Could not reach api.sarvam.ai ({e.reason}). "
                         f"Run this where that host is reachable — a sandbox "
                         f"behind a proxy will refuse it however good the key is.")
    if not audio:
        raise SystemExit("Sarvam returned no audio.")
    wav = path.with_suffix(".wav")
    wav.write_bytes(base64.b64decode(audio))
    subprocess.run([ffmpeg(), "-y", "-loglevel", "error", "-i", str(wav),
                    "-c:a", "libmp3lame", "-b:a", "192k", str(path)], check=True)
    wav.unlink()

def speak_elevenlabs(text, path):
    req = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{EL_VOICE}",
        data=json.dumps({
            "text": text,
            "model_id": EL_MODEL,
            # Some warmth, but not so little stability that four takes stop
            # sounding like the same person.
            "voice_settings": {"stability": 0.45, "similarity_boost": 0.8,
                               "style": 0.2, "use_speaker_boost": True},
        }).encode("utf-8"),
        headers={"xi-api-key": EL_KEY, "Content-Type": "application/json",
                 "Accept": "audio/mpeg"},
        method="POST")
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            path.write_bytes(r.read())
    except urllib.error.HTTPError as e:
        raise SystemExit(f"ElevenLabs {e.code}: {e.read()[:300].decode('utf-8', 'replace')}")
    except urllib.error.URLError as e:
        raise SystemExit(f"Could not reach api.elevenlabs.io ({e.reason}). "
                         f"Run this where that host is reachable — a sandbox "
                         f"behind a proxy will refuse it however good the key is.")

def seconds(FF, path):
    out = subprocess.run([FF, "-hide_banner", "-i", str(path)],
                         capture_output=True, text=True).stderr
    for line in out.splitlines():
        if "Duration:" in line:
            h, m, s = line.split("Duration:")[1].split(",")[0].strip().split(":")
            return int(h) * 3600 + int(m) * 60 + float(s)
    return 0.0

# The "Isme accha kya hai?" story ad (docs/…/17_story_ad_isme_accha_kya_hai.md).
# Devanagari for the same reason as above: nobody reads these, the voice does.
STORY = [
    # The posters say their own lines on screen, so the voice does not read them
    # back — it carries the sentence between them instead. Order follows the
    # cut: question, answer, proof, what it means, invitation.
    #
    # These are deliberately short. The first draft ran nearly twice this long,
    # and with the picture cut at 18.9s the film had to stretch to 34s to hold
    # it — the voice was driving, and a reel that long is not a reel. About
    # 2.5 words a second is an unhurried Hindi read; the whole script is ~41
    # words. Lengthen a line and the segment it sits in stretches to fit it,
    # so check the total before adding words.
    ("story0", False, "हर घर में यही सवाल है।"),
    ("story1", False, "रोज़ पाँच रिश्ते। हज़ारों नहीं। और हर एक के साथ — वजह।"),
    ("story2", False, "सात लेवल वेरिफिकेशन। और जो verify नहीं हुआ, वो भी लिखा मिलता है।"),
    ("story3", False, "इसीलिए रिश्ता सिर्फ़ देखा नहीं जाता — समझा जाता है।"),
    ("story4", False, "BandhanTak. प्रोफाइल बनाना फ्री है।"),
]

SETS = {"narrator": SHOTS, "story": STORY}

def arg(flag, default=None):
    return sys.argv[sys.argv.index(flag) + 1] if flag in sys.argv else default

def say(text, path, provider, voice):
    if provider == "sarvam":
        if not SARVAM_KEY:
            raise SystemExit("Set SARVAM_API_KEY.")
        speak_sarvam(text, path, voice)
    else:
        if not EL_KEY:
            raise SystemExit("Set ELEVENLABS_API_KEY.")
        speak_elevenlabs(text, path)

def audition(provider):
    """One line, every shortlisted voice, so the choice is made by ear.

    Which voice is right is not a thing that can be reasoned out from a list of
    names — it has to be heard. This renders the hook into vo/audition/ and
    stops there.
    """
    out = VO / "audition"; out.mkdir(parents=True, exist_ok=True)
    line = STORY[1][2]          # the longest single sentence: most to judge on
    FF = ffmpeg()
    print(f"auditioning on: {line}\n")
    for v in AUDITION:
        p_out = out / f"{v}.mp3"
        say(line, p_out, provider, v)
        print(f"  {p_out}   {seconds(FF, p_out):.2f}s")
    print(f"\nListen, then: python3 make-vo-clips.py --set story --voice <name>")

def main():
    provider = arg("--provider", "sarvam")
    if provider not in ("sarvam", "elevenlabs"):
        raise SystemExit("--provider must be sarvam or elevenlabs")
    voice = arg("--voice", SARVAM_VOICE)
    if provider == "sarvam" and voice not in AUDITION and "--voice" in sys.argv:
        print(f"note: '{voice}' is not in the shortlist; passing it through anyway.")

    if "--audition" in sys.argv:
        audition(provider)
        return

    which = arg("--set", "narrator")
    if which not in SETS:
        raise SystemExit(f"--set must be one of: {', '.join(SETS)}")
    if provider == "sarvam" and not SARVAM_KEY:
        raise SystemExit("Set SARVAM_API_KEY.")
    if provider == "elevenlabs" and not EL_KEY:
        raise SystemExit("Set ELEVENLABS_API_KEY.")
    FF = ffmpeg()
    print(f"{which} set · {provider}" + (f" · {voice}" if provider == "sarvam" else ""))
    print(f"{'file':16} {'secs':>6}  on screen")
    total = 0.0
    for name, lipsync, text in SETS[which]:
        p_out = VO / f"{name}.mp3"
        say(text, p_out, provider, voice)
        d = seconds(FF, p_out)
        total += d
        note = ("LIP-SYNC — feed to the lip-sync model, video duration >= this"
                if lipsync else "voice only")
        print(f"{p_out.name:16} {d:6.2f}  {note}")
    print(f"\n{'total':16} {total:6.2f}s of speech")
    if which == "story":
        print("The picture cut is ~19s. build-story-ad.py stretches a segment "
              "whose line overruns it, so if it reports several stretches the "
              "script has grown rather than the film.")

if __name__ == "__main__":
    main()
