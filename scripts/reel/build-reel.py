# -*- coding: utf-8 -*-
"""Assemble the six rendered shots into a 20-second 9:16 reel.

Each shot is one still: a slow Ken Burns move on the background (alternating
push-in / pull-out so consecutive cuts don't drift the same way), with each
text line fading up and settling into place at the second the script gives it.
Cuts are hard, as the script asks, so the 20 seconds land exactly.
"""
import os, pathlib, subprocess

HERE = pathlib.Path(__file__).resolve().parent
F = HERE / "frames"
CLIPS = HERE / "clips"
CLIPS.mkdir(exist_ok=True)
def _ffmpeg():
    """A full ffmpeg — the one Playwright bundles is built --disable-everything
    and has no libx264, so `npm i ffmpeg-static` (or $FFMPEG) is required."""
    if os.environ.get("FFMPEG"):
        return os.environ["FFMPEG"]
    r = subprocess.run(["node", "-p", "require('ffmpeg-static')"],
                       cwd=HERE, capture_output=True, text=True)
    if r.returncode == 0 and r.stdout.strip():
        return r.stdout.strip()
    raise SystemExit("No ffmpeg. Run `npm i ffmpeg-static` here, or set $FFMPEG.")

FF = _ffmpeg()
FPS = 30

# n, seconds, when line B arrives, push-in or pull-out
SHOTS = [
    (1, 3.0, 1.60, "in"),
    (2, 3.0, 1.45, "out"),
    (3, 4.0, 2.00, "in"),
    (4, 4.0, 2.20, "out"),
    (5, 3.0, 1.50, "in"),
    (6, 3.0, 1.20, "out"),
]

def rise(st):
    # 26px lift that settles over 0.40s, clamped so it never pushes below home
    return f"max(0\\,26*(1-(t-{st})/0.40))"

for n, dur, tb, move in SHOTS:
    frames = int(round(dur * FPS))
    if move == "in":
        z = f"1+0.085*on/{frames - 1}"
    else:
        z = f"1.085-0.085*on/{frames - 1}"

    fc = (
        f"[0:v]zoompan=z='{z}':d={frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
        f":s=1080x1920:fps={FPS}[bg];"
        f"[1:v]format=rgba,fade=t=in:st=0.15:d=0.40:alpha=1[ta];"
        f"[2:v]format=rgba,fade=t=in:st={tb}:d=0.40:alpha=1[tb];"
        f"[bg][ta]overlay=x=0:y='{rise(0.15)}'[v1];"
        f"[v1][tb]overlay=x=0:y='{rise(tb)}',format=yuv420p[v]"
    )

    out = CLIPS / f"clip{n}.mp4"
    cmd = [FF, "-y", "-loglevel", "error",
           "-loop", "1", "-i", str(F / f"bg{n}.png"),
           "-loop", "1", "-i", str(F / f"t{n}a.png"),
           "-loop", "1", "-i", str(F / f"t{n}b.png"),
           "-filter_complex", fc, "-map", "[v]",
           "-t", f"{dur}", "-r", str(FPS),
           "-c:v", "libx264", "-preset", "slow", "-crf", "18",
           "-pix_fmt", "yuv420p", str(out)]
    r = subprocess.run(cmd, capture_output=True, text=True)
    print(f"clip{n}: {'ok' if r.returncode == 0 else 'FAIL ' + r.stderr[-400:]}",
          out.stat().st_size if out.exists() else "-")

# ---- join, and give it a silent stereo track so Instagram accepts the file ----
lst = CLIPS / "list.txt"
lst.write_text("".join(f"file '{CLIPS / f'clip{n}.mp4'}'\n" for n, *_ in SHOTS))
final = HERE / "bandhantak-reel-20s.mp4"
r = subprocess.run(
    [FF, "-y", "-loglevel", "error",
     "-f", "concat", "-safe", "0", "-i", str(lst),
     "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
     "-map", "0:v", "-map", "1:a", "-shortest",
     "-c:v", "copy", "-c:a", "aac", "-b:a", "128k",
     "-movflags", "+faststart", str(final)],
    capture_output=True, text=True)
print("final:", "ok" if r.returncode == 0 else "FAIL " + r.stderr[-500:])

info = subprocess.run([FF, "-hide_banner", "-i", str(final)], capture_output=True, text=True).stderr
print("\n".join(l for l in info.splitlines() if "Duration" in l or "Stream" in l))
print("size:", final.stat().st_size, "bytes")
