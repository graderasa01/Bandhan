# -*- coding: utf-8 -*-
"""Speak each shot's line with ElevenLabs as its own file, and report how long
each one came out.

Two of these files go to OpenArt as the audio element for a lip-synced shot, so
the shot's video duration has to match the take — that is what the printed
durations are for. The rest are laid under the page shots by build-narrator-ad.py.

Not runnable from the Claude Code web sandbox: its proxy answers 403 to
api.elevenlabs.io. Run locally.

    export ELEVENLABS_API_KEY=...
    export ELEVENLABS_VOICE_ID=...        # a Hindi-native voice, ideally
    python3 make-vo-clips.py                  # the narrator cut
    python3 make-vo-clips.py --set story      # the "Isme accha kya hai?" ad
"""
import json, os, pathlib, subprocess, sys, urllib.error, urllib.request

HERE = pathlib.Path(__file__).resolve().parent
VO = HERE / "vo"; VO.mkdir(exist_ok=True)

KEY = os.environ.get("ELEVENLABS_API_KEY")
VOICE = os.environ.get("ELEVENLABS_VOICE_ID", "EXAVITQu4vr4xnSDxMaL")
MODEL = os.environ.get("ELEVENLABS_MODEL", "eleven_multilingual_v2")

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

def speak(text, path):
    req = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE}",
        data=json.dumps({
            "text": text,
            "model_id": MODEL,
            # Some warmth, but not so little stability that four takes stop
            # sounding like the same person.
            "voice_settings": {"stability": 0.45, "similarity_boost": 0.8,
                               "style": 0.2, "use_speaker_boost": True},
        }).encode("utf-8"),
        headers={"xi-api-key": KEY, "Content-Type": "application/json",
                 "Accept": "audio/mpeg"},
        method="POST")
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            path.write_bytes(r.read())
    except urllib.error.HTTPError as e:
        raise SystemExit(f"ElevenLabs {e.code}: {e.read()[:300].decode('utf-8', 'replace')}")

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

def main():
    if not KEY:
        raise SystemExit("Set ELEVENLABS_API_KEY.")
    which = "narrator"
    if "--set" in sys.argv:
        which = sys.argv[sys.argv.index("--set") + 1]
    if which not in SETS:
        raise SystemExit(f"--set must be one of: {', '.join(SETS)}")
    FF = ffmpeg()
    print(f"{which} set\n{'file':16} {'secs':>6}  on screen")
    for name, lipsync, text in SETS[which]:
        p = VO / f"{name}.mp3"
        speak(text, p)
        d = seconds(FF, p)
        note = "LIP-SYNC — upload to OpenArt, set video duration >= this" if lipsync else "voice only"
        print(f"{p.name:16} {d:6.2f}  {note}")
    print("\nRound each lip-sync duration UP to a whole second on OpenArt.\n"
          "A shot shorter than its audio cuts the narrator off mid-word.")

if __name__ == "__main__":
    main()
