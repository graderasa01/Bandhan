# -*- coding: utf-8 -*-
"""Shot 4 v2: the headline moves to the top and the product's own Reel card
takes the frame. Only clip 4 is rebuilt; the other five are reused as-is.
"""
import base64, os, pathlib, subprocess

HERE = pathlib.Path(__file__).resolve().parent
F, CLIPS = HERE / "frames", HERE / "clips"
SHELL = os.environ.get("HEADLESS_SHELL",
    "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell")
FF = subprocess.run(["node", "-p", "require('ffmpeg-static')"], cwd=HERE,
                    capture_output=True, text=True).stdout.strip()
FPS, W, H = 30, 1080, 1920

fdir = HERE / "node_modules/@fontsource/mukta/files"
F8 = base64.b64encode((fdir / "mukta-devanagari-800-normal.woff2").read_bytes()).decode()

# Headline rides high so the card below it never fights for the same band.
head = f"""<!doctype html><meta charset="utf-8"><style>
@font-face{{font-family:'Mukta';font-weight:800;src:url(data:font/woff2;base64,{F8}) format('woff2')}}
html,body{{margin:0;width:{W}px;height:{H}px;overflow:hidden;background:transparent}}
.l{{position:absolute;left:0;right:0;top:18%;transform:translateY(-50%);padding:0 80px;
 text-align:center;font-family:'Mukta',sans-serif;font-weight:800;font-size:96px;line-height:1.1;
 letter-spacing:-0.01em;color:#4a1119;text-shadow:0 3px 22px rgba(255,255,255,.6)}}
</style><div class="l">रोज़ 5 रिश्ते।<br>हज़ारों नहीं।</div>"""
(F / "t4head.html").write_text(head, encoding="utf-8")
subprocess.run([SHELL, "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
                "--force-device-scale-factor=1", f"--window-size={W},{H}",
                "--default-background-color=00000000", "--virtual-time-budget=4000",
                f"--screenshot={F / 't4head.png'}", "file://" + str(F / "t4head.html")],
               capture_output=True)

dur, frames, tb = 4.0, 120, 0.85
rise = lambda st, px: f"max(0\\,{px}*(1-(t-{st})/0.45))"
fc = (
    f"[0:v]zoompan=z='1.085-0.085*on/{frames-1}':d={frames}:x='iw/2-(iw/zoom/2)'"
    f":y='ih/2-(ih/zoom/2)':s={W}x{H}:fps={FPS}[bg];"
    f"[1:v]format=rgba,fade=t=in:st=0.15:d=0.40:alpha=1[hd];"
    f"[2:v]format=rgba,fade=t=in:st={tb}:d=0.45:alpha=1[cd];"
    f"[bg][hd]overlay=x=0:y='{rise(0.15,26)}'[v1];"
    f"[v1][cd]overlay=x=0:y='{rise(tb,46)}',format=yuv420p[v]"
)
r = subprocess.run([FF, "-y", "-loglevel", "error",
    "-loop", "1", "-i", str(F / "bg4.png"),
    "-loop", "1", "-i", str(F / "t4head.png"),
    "-loop", "1", "-i", str(F / "card4.png"),
    "-filter_complex", fc, "-map", "[v]", "-t", str(dur), "-r", str(FPS),
    "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p",
    str(CLIPS / "clip4.mp4")], capture_output=True, text=True)
print("clip4 v2:", "ok" if r.returncode == 0 else "FAIL " + r.stderr[-400:])

lst = CLIPS / "list.txt"
lst.write_text("".join(f"file '{CLIPS / f'clip{n}.mp4'}'\n" for n in range(1, 7)))
final = HERE / "bandhantak-reel-20s.mp4"
r = subprocess.run([FF, "-y", "-loglevel", "error",
    "-f", "concat", "-safe", "0", "-i", str(lst),
    "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
    "-map", "0:v", "-map", "1:a", "-shortest",
    "-c:v", "copy", "-c:a", "aac", "-b:a", "128k",
    "-movflags", "+faststart", str(final)], capture_output=True, text=True)
info = subprocess.run([FF, "-hide_banner", "-i", str(final)], capture_output=True, text=True).stderr
print("final:", "ok" if r.returncode == 0 else "FAIL " + r.stderr[-400:])
print("\n".join(l for l in info.splitlines() if "Duration" in l or "Video:" in l))
