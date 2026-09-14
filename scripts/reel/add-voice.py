# -*- coding: utf-8 -*-
"""Speak the script's VO lines with ElevenLabs and lay them under a cut.

Not runnable from the Claude Code web sandbox — its proxy passes package
registries only and answers 403 to api.elevenlabs.io. Run it locally.

    export ELEVENLABS_API_KEY=...
    python3 add-voice.py bandhantak-pages-ad.mp4 out.mp4 [music.mp3]

Each line is placed at its own start time rather than concatenated, so the
voice stays locked to the picture even when a take runs long or short.
"""
import json, os, pathlib, subprocess, sys, urllib.request

HERE = pathlib.Path(__file__).resolve().parent
VO = HERE / "vo"; VO.mkdir(exist_ok=True)

KEY = os.environ.get("ELEVENLABS_API_KEY")
# Any multilingual voice; this is ElevenLabs' "Sarah". Pick a Hindi-native one
# from the voice library and paste its id here — it matters more than the model.
VOICE = os.environ.get("ELEVENLABS_VOICE_ID", "EXAVITQu4vr4xnSDxMaL")
MODEL = os.environ.get("ELEVENLABS_MODEL", "eleven_multilingual_v2")

# (start second, line). Timings match the 20s script in
# docs/bandhantak/15_instagram_reel_ad_script.md — edit both together.
LINES = [
    (0.25, "दस हज़ार प्रोफाइल देखीं… बात सिर्फ़ दो से हुई।"),
    (3.20, "कमी प्रोफाइल की नहीं थी — कमी वजह की थी।"),
    (6.20, "BandhanTak पे फ़ॉर्म नहीं भरते — बस बोलते हैं। दो मिनट में प्रोफाइल तैयार।"),
    (10.20, "AI रात भर काम करता है। सुबह कुछ चुने हुए रिश्ते — और हर एक के साथ वजह।"),
    (14.20, "सात लेवल वेरिफिकेशन। और जो verify नहीं है, वो भी छुपाया नहीं जाता।"),
    (17.20, "BandhanTak — भारत का AI-guided matrimony. प्रोफाइल बनाना फ्री है।"),
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
            # Lower stability lets the read carry some feeling; too low and the
            # takes stop matching each other across a six-line script.
            "voice_settings": {"stability": 0.45, "similarity_boost": 0.8,
                               "style": 0.2, "use_speaker_boost": True},
        }).encode("utf-8"),
        headers={"xi-api-key": KEY, "Content-Type": "application/json",
                 "Accept": "audio/mpeg"},
        method="POST")
    with urllib.request.urlopen(req, timeout=120) as r:
        path.write_bytes(r.read())

def main():
    if not KEY:
        raise SystemExit("Set ELEVENLABS_API_KEY.")
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    video, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
    music = pathlib.Path(sys.argv[3]) if len(sys.argv) > 3 else None
    FF = ffmpeg()

    for i, (_, text) in enumerate(LINES):
        speak(text, VO / f"line{i}.mp3")
        print(f"line {i}: spoken")

    args = [FF, "-y", "-i", str(video)]
    for i, _ in enumerate(LINES):
        args += ["-i", str(VO / f"line{i}.mp3")]
    if music:
        args += ["-i", str(music)]

    # Delay each take to its cue, then sum. Music sits under the voice and
    # ducks nowhere else — at -19 dB it does not need to.
    parts, labels = [], []
    for i, (start, _) in enumerate(LINES):
        ms = int(start * 1000)
        parts.append(f"[{i+1}:a]adelay={ms}|{ms},volume=1.0[v{i}]")
        labels.append(f"[v{i}]")
    n = len(LINES)
    if music:
        parts.append(f"[{n+1}:a]volume=0.11,afade=t=out:st=18:d=2[mus]")
        labels.append("[mus]")
    parts.append(f"{''.join(labels)}amix=inputs={len(labels)}:normalize=0:"
                 f"dropout_transition=0[mixed]")
    parts.append("[mixed]alimiter=limit=0.95,aresample=44100[a]")

    args += ["-filter_complex", ";".join(parts),
             "-map", "0:v", "-map", "[a]", "-shortest",
             "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
             "-movflags", "+faststart", str(out)]
    r = subprocess.run(args, capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(r.stderr[-800:])
    print("wrote", out)

if __name__ == "__main__":
    main()
