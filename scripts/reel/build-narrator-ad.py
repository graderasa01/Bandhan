# -*- coding: utf-8 -*-
"""Assemble the narrator cut: she opens and closes on camera, and talks over
the real product in between.

Inputs, all produced by the other scripts in this folder plus OpenArt:
  talk/talk1.mp4, talk/talk2.mp4   lip-synced narrator shots from OpenArt
  vo/bolo.mp3, vo/reel.mp3         voice for the two page shots
  pages/tall_bolo.png              from capture-pages.py
  frames/card4.png, frames/bg4.png from build-ui-card.py / build-frames.py

The narrator shots keep their own audio — it is the take the lips were synced
to, so re-laying the mp3 over them would drift. The page shots get their voice
laid on here.

    python3 build-narrator-ad.py [music.mp3]
"""
import base64, os, pathlib, subprocess, sys

HERE = pathlib.Path(__file__).resolve().parent
TALK, VO, PAGES, FRAMES = HERE / "talk", HERE / "vo", HERE / "pages", HERE / "frames"
WORK = HERE / "narrator"; WORK.mkdir(exist_ok=True)
SHELL = os.environ.get("HEADLESS_SHELL",
    "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell")
W, H, FPS = 1080, 1920, 30
PX, PY, PW, PH = 140, 402, 800, 1228
SX, SY, SW, SH = PX + 14, PY + 14, PW - 28, PH - 28

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

def shoot(html, name):
    src = WORK / (name + ".html"); src.write_text(html, encoding="utf-8")
    subprocess.run([SHELL, "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
                    "--force-device-scale-factor=1", f"--window-size={W},{H}",
                    "--default-background-color=00000000", "--virtual-time-budget=4000",
                    f"--screenshot={WORK / (name + '.png')}", "file://" + str(src)],
                   capture_output=True)

def need(p):
    if not p.exists():
        raise SystemExit(f"Missing {p}. See the narrator runbook in README.md.")
    return p

# ---------- captions over the page shots ----------
# Poppins — the product's own display face (app/layout.tsx, --font-display).
fdir = HERE / "node_modules/@fontsource/poppins/files"
F8 = base64.b64encode(need(fdir / "poppins-latin-700-normal.woff2").read_bytes()).decode()

def caption(name, text, color, glow):
    shoot(f"""<!doctype html><meta charset="utf-8"><style>
    @font-face{{font-family:'Poppins';font-weight:700;src:url(data:font/woff2;base64,{F8}) format('woff2')}}
    html,body{{margin:0;width:{W}px;height:{H}px;overflow:hidden;background:transparent}}
    .l{{position:absolute;left:0;right:0;top:200px;transform:translateY(-50%);padding:0 70px;
      text-align:center;font-family:'Poppins',system-ui,sans-serif;font-weight:700;font-size:66px;
      line-height:1.18;letter-spacing:-0.02em;color:{color};text-shadow:0 3px 24px {glow}}}
    </style><div class="l">{text}</div>""", name)

caption("cap_bolo", "Form nahi. Bas boliye.", "#f6efe6", "rgba(0,0,0,.45)")
caption("cap_reel", "Roz kuch chune hue rishtey.<br>Hazaaron nahi.", "#4a1119", "rgba(255,255,255,.55)")

for name, grad in [("bg_bolo", "168deg,#2e2015 0%,#4d3622 52%,#1d130c 100%"),
                   ("bg_reel", "168deg,#fdf3e2 0%,#f7dcae 55%,#edbf7d 100%")]:
    shoot(f"""<!doctype html><meta charset="utf-8"><style>
    html,body{{margin:0;width:{W}px;height:{H}px;overflow:hidden}}
    .g{{position:absolute;inset:0;background:linear-gradient({grad})}}
    .v{{position:absolute;inset:0;background:radial-gradient(ellipse 80% 60% at 50% 44%,transparent 42%,rgba(0,0,0,.34) 100%)}}
    </style><div class="g"></div><div class="v"></div>""", name)

rise = lambda st, px: f"max(0\\,{px}*(1-(t-{st})/0.45))"
V = ["-c:v", "libx264", "-preset", "slow", "-crf", "19", "-pix_fmt", "yuv420p"]
A = ["-c:a", "aac", "-b:a", "192k", "-ar", "44100", "-ac", "2"]

# ---------- shot 2: /bolo scrolling, her voice over it ----------
d_bolo = seconds(need(VO / "bolo.mp3")) + 0.5
run([FF, "-y", "-loglevel", "error",
     "-loop", "1", "-i", str(WORK / "bg_bolo.png"),
     "-loop", "1", "-i", str(need(PAGES / "tall_bolo.png")),
     "-loop", "1", "-i", str(need(HERE / "adframes" / "phone.png")),
     "-loop", "1", "-i", str(WORK / "cap_bolo.png"),
     "-i", str(VO / "bolo.mp3"),
     "-filter_complex",
     f"[1:v]crop={SW}:{SH}:0:'620*sin(1.5708*min(t/{d_bolo}\\,1))',setsar=1[pg];"
     f"[0:v][pg]overlay={SX}:{SY}[s];[s][2:v]overlay=0:0[s2];"
     f"[3:v]format=rgba,fade=t=in:st=0.2:d=0.4:alpha=1[cp];"
     f"[s2][cp]overlay=x=0:y='{rise(0.2,22)}',format=yuv420p[v];"
     f"[4:a]adelay=250|250,apad[a]",
     "-map", "[v]", "-map", "[a]", "-t", str(d_bolo), "-r", str(FPS),
     *V, *A, str(WORK / "shot_bolo.mp4")], "bolo shot")

# ---------- shot 3: the product's own Reel card ----------
d_reel = seconds(need(VO / "reel.mp3")) + 0.5
f_reel = int(round(d_reel * FPS))
run([FF, "-y", "-loglevel", "error",
     "-loop", "1", "-i", str(need(FRAMES / "bg4.png")),
     "-loop", "1", "-i", str(WORK / "cap_reel.png"),
     "-loop", "1", "-i", str(need(FRAMES / "card4.png")),
     "-i", str(VO / "reel.mp3"),
     "-filter_complex",
     f"[0:v]zoompan=z='1.085-0.085*on/{f_reel-1}':d={f_reel}:x='iw/2-(iw/zoom/2)'"
     f":y='ih/2-(ih/zoom/2)':s={W}x{H}:fps={FPS}[bg];"
     f"[1:v]format=rgba,fade=t=in:st=0.15:d=0.40:alpha=1[cp];"
     f"[2:v]format=rgba,fade=t=in:st=0.85:d=0.45:alpha=1[cd];"
     f"[bg][cp]overlay=x=0:y='{rise(0.15,26)}'[v1];"
     f"[v1][cd]overlay=x=0:y='{rise(0.85,46)}',format=yuv420p[v];"
     f"[3:a]adelay=250|250,apad[a]",
     "-map", "[v]", "-map", "[a]", "-t", str(d_reel), "-r", str(FPS),
     *V, *A, str(WORK / "shot_reel.mp4")], "reel shot")

# ---------- narrator shots: re-encode to match, keep their own audio ----------
for name in ("talk1", "talk2"):
    src = need(TALK / f"{name}.mp4")
    run([FF, "-y", "-loglevel", "error", "-i", str(src),
         "-vf", f"scale={W}:{H}:force_original_aspect_ratio=increase,"
                f"crop={W}:{H},fps={FPS},setsar=1",
         *V, *A, str(WORK / f"shot_{name}.mp4")], f"{name} conform")

order = ["shot_talk1", "shot_bolo", "shot_reel", "shot_talk2"]
lst = WORK / "list.txt"
lst.write_text("".join(f"file '{WORK / (s + '.mp4')}'\n" for s in order))

joined = WORK / "joined.mp4"
run([FF, "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(lst),
     "-c", "copy", str(joined)], "concat")

final = HERE / "bandhantak-narrator-ad.mp4"
music = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else None
if music and music.exists():
    total = seconds(joined)
    run([FF, "-y", "-loglevel", "error", "-i", str(joined), "-i", str(music),
         "-filter_complex",
         f"[1:a]volume=0.11,afade=t=out:st={max(0, total-2):.2f}:d=2[mus];"
         f"[0:a][mus]amix=inputs=2:normalize=0:dropout_transition=0[m];"
         f"[m]alimiter=limit=0.95,aresample=44100[a]",
         "-map", "0:v", "-map", "[a]", "-shortest", "-c:v", "copy", *A,
         "-movflags", "+faststart", str(final)], "music mix")
else:
    run([FF, "-y", "-loglevel", "error", "-i", str(joined),
         "-c", "copy", "-movflags", "+faststart", str(final)], "finalise")

print("wrote", final, f"({seconds(final):.2f}s)")
