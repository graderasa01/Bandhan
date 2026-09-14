# -*- coding: utf-8 -*-
"""Turn a still portrait into the video a lip-sync model expects, and put the
motion back afterwards.

Wav2Lip, LatentSync and the rest take a VIDEO plus audio, not a still — and
they track a face, so they do their best work on a steady shot. So the order is:
still -> static clip at exactly the audio's length -> lip-sync -> motion.
Adding the drift first makes the model fight the camera for no gain.

    # before lip-sync
    python3 prep-portrait.py prep face.png vo/talk1.mp3 talk/talk1_still.mp4

    # after it, on whatever the lip-sync model wrote
    python3 prep-portrait.py motion talk/talk1_raw.mp4 talk/talk1.mp4
"""
import os, pathlib, subprocess, sys

HERE = pathlib.Path(__file__).resolve().parent
W, H, FPS = 1080, 1920, 25   # 25fps: what most lip-sync checkpoints were trained at

def ffmpeg():
    if os.environ.get("FFMPEG"):
        return os.environ["FFMPEG"]
    r = subprocess.run(["node", "-p", "require('ffmpeg-static')"],
                       cwd=HERE, capture_output=True, text=True)
    if r.returncode == 0 and r.stdout.strip():
        return r.stdout.strip()
    raise SystemExit("No ffmpeg. `npm i ffmpeg-static` here, or set $FFMPEG.")

FF = ffmpeg()

def seconds(path):
    out = subprocess.run([FF, "-hide_banner", "-i", str(path)],
                         capture_output=True, text=True).stderr
    for line in out.splitlines():
        if "Duration:" in line:
            h, m, s = line.split("Duration:")[1].split(",")[0].strip().split(":")
            return int(h) * 3600 + int(m) * 60 + float(s)
    raise SystemExit(f"Could not read a duration from {path}")

def run(args, what):
    r = subprocess.run(args, capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(f"{what} failed:\n{r.stderr[-700:]}")

def prep(image, audio, out):
    # A tail of silence: a shot that ends on the last consonant feels clipped,
    # and the lip-sync model needs frames to close the mouth on.
    dur = seconds(audio) + 0.35
    run([FF, "-y", "-loglevel", "error",
         "-loop", "1", "-i", str(image), "-i", str(audio),
         "-filter_complex",
         f"[0:v]scale={W}:{H}:force_original_aspect_ratio=increase,"
         f"crop={W}:{H},fps={FPS},setsar=1[v];[1:a]apad[a]",
         "-map", "[v]", "-map", "[a]", "-t", f"{dur:.2f}",
         "-c:v", "libx264", "-preset", "slow", "-crf", "16",
         "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ar", "16000",
         str(out)], "prep")
    print(f"{out}  {dur:.2f}s @ {FPS}fps — feed this and {audio} to the lip-sync model")

def motion(src, out):
    dur = seconds(src)
    frames = max(int(round(dur * FPS)) - 1, 1)
    # d=1 is load-bearing. zoompan emits `d` frames per INPUT frame, so the
    # still-image idiom d=<total> turns a 170-frame clip into 170x170 frames
    # and the encode never finishes. On a video it has to be one out per one in.
    # 4% across the shot: enough that the frame is alive, little enough that it
    # never reads as a camera move.
    run([FF, "-y", "-loglevel", "error", "-i", str(src),
         "-filter_complex",
         f"[0:v]fps={FPS},scale={int(W * 1.12)}:-2,"
         f"zoompan=z='min(1+0.04*on/{frames}\\,1.04)':d=1"
         f":x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s={W}x{H}:fps={FPS},"
         f"setsar=1,format=yuv420p[v]",
         "-map", "[v]", "-map", "0:a?", "-c:v", "libx264", "-preset", "medium",
         "-crf", "18", "-c:a", "aac", "-b:a", "192k", str(out)], "motion")
    print(f"{out}  {dur:.2f}s — ready for build-narrator-ad.py")

if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] not in ("prep", "motion"):
        raise SystemExit(__doc__)
    if sys.argv[1] == "prep":
        if len(sys.argv) != 5:
            raise SystemExit(__doc__)
        prep(pathlib.Path(sys.argv[2]), pathlib.Path(sys.argv[3]), pathlib.Path(sys.argv[4]))
    else:
        if len(sys.argv) != 4:
            raise SystemExit(__doc__)
        motion(pathlib.Path(sys.argv[2]), pathlib.Path(sys.argv[3]))
