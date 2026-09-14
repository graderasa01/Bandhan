# -*- coding: utf-8 -*-
"""Ad cut from the real site: each shot is an actual BandhanTak page scrolling
inside a phone, captured from the app running locally — not a description of
the product, and not a model's guess at what the product looks like.
"""
import base64, os, pathlib, subprocess

HERE = pathlib.Path(__file__).resolve().parent
P, OUT = HERE / "pages", HERE / "adframes"
OUT.mkdir(exist_ok=True)
SHELL = os.environ.get("HEADLESS_SHELL",
    "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell")
FF = subprocess.run(["node", "-p", "require('ffmpeg-static')"], cwd=HERE,
                    capture_output=True, text=True).stdout.strip()
W, H, FPS = 1080, 1920, 30

# Where the phone sits, and the screen hole inside it.
PX, PY, PW, PH = 140, 402, 800, 1228
SX, SY, SW, SH = PX + 14, PY + 14, PW - 28, PH - 28   # 772 x 1200

# Poppins — the product's own display face (app/layout.tsx, --font-display).
def pkg_file(rel):
    """Find a file inside node_modules, looking here and then upward.

    `npm i` in a folder with no package.json installs into the nearest parent
    that has one — for this folder that is the repo root, two levels up. A
    hard-coded HERE/node_modules path therefore fails on a normal checkout with
    a FileNotFoundError that says nothing about why.
    """
    for base in [HERE, *HERE.parents]:
        p = base / "node_modules" / rel
        if p.exists():
            return p
    raise SystemExit(f"Missing node_modules/{rel}. In scripts/reel run:\n"
                     f"  npm i ffmpeg-static @fontsource/poppins @fontsource/inter")

F8 = base64.b64encode(pkg_file("@fontsource/poppins/files/poppins-latin-700-normal.woff2").read_bytes()).decode()

def shoot(html, name):
    src = OUT / (name + ".html"); src.write_text(html, encoding="utf-8")
    subprocess.run([SHELL, "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
                    "--force-device-scale-factor=1", f"--window-size={W},{H}",
                    "--default-background-color=00000000", "--virtual-time-budget=4000",
                    f"--screenshot={OUT / (name + '.png')}", "file://" + str(src)],
                   capture_output=True)

# ---- phone bezel: a ring, so the page shows through the hole ----
shoot(f"""<!doctype html><meta charset="utf-8"><style>html,body{{margin:0;background:transparent}}</style>
<svg width="{W}" height="{H}" xmlns="http://www.w3.org/2000/svg">
 <defs>
  <mask id="m">
    <rect width="{W}" height="{H}" fill="black"/>
    <rect x="{PX}" y="{PY}" width="{PW}" height="{PH}" rx="54" fill="white"/>
    <rect x="{SX}" y="{SY}" width="{SW}" height="{SH}" rx="42" fill="black"/>
  </mask>
  <filter id="sh" x="-40%" y="-40%" width="180%" height="180%">
    <feDropShadow dx="0" dy="26" stdDeviation="34" flood-color="#120d0a" flood-opacity="0.46"/>
  </filter>
  <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#2a2320"/><stop offset="0.5" stop-color="#14100e"/>
    <stop offset="1" stop-color="#2a2320"/>
  </linearGradient>
 </defs>
 <rect width="{W}" height="{H}" fill="url(#g)" mask="url(#m)" filter="url(#sh)"/>
</svg>""", "phone")

# ---- one headline per shot, above the phone ----
HEADS = {
 "h_home":   ("Har profile verified.<br>Har match ka reason.", "#f6efe6", "rgba(0,0,0,.45)"),
 "h_bolo":   ("Form nahi. Bas boliye.", "#f6efe6", "rgba(0,0,0,.45)"),
 "h_how":    ("Roz 5 rishtey.<br>Hazaaron nahi.", "#4a1119", "rgba(255,255,255,.55)"),
 "h_price":  ("Registration free hai.", "#4a1119", "rgba(255,255,255,.55)"),
}
for name, (text, color, shadow) in HEADS.items():
    shoot(f"""<!doctype html><meta charset="utf-8"><style>
    @font-face{{font-family:'Poppins';font-weight:700;src:url(data:font/woff2;base64,{F8}) format('woff2')}}
    html,body{{margin:0;width:{W}px;height:{H}px;overflow:hidden;background:transparent}}
    .l{{position:absolute;left:0;right:0;top:200px;transform:translateY(-50%);padding:0 70px;
      text-align:center;font-family:'Poppins',system-ui,sans-serif;font-weight:700;font-size:66px;
      line-height:1.18;letter-spacing:-0.02em;color:{color};text-shadow:0 3px 24px {shadow}}}
    </style><div class="l">{text}</div>""", name)

# page, seconds, pixels scrolled, background gradient, headline
SHOTS = [
    ("home",    4.0, 900,  "168deg,#1b2b3e 0%,#2a4058 48%,#131e2b 100%", "h_home"),
    ("bolo",    4.0, 620,  "168deg,#2e2015 0%,#4d3622 52%,#1d130c 100%", "h_bolo"),
    ("how",     4.0, 1000, "168deg,#fdf3e2 0%,#f6dcae 55%,#eec384 100%", "h_how"),
]

# Deliberately not a pricing shot: that page's visible card is BASIC at Rs999
# with "Roz 5 rishtey" on it, which argues against the free-profile line the ad
# closes on. The cut ends on the brand plate build-reel.py already renders.
TAIL = HERE / "clips" / "clip6.mp4"

CLIPS = HERE / "adclips"; CLIPS.mkdir(exist_ok=True)
for page, dur, scroll, grad, head in SHOTS:
    shoot(f"""<!doctype html><meta charset="utf-8"><style>
    html,body{{margin:0;width:{W}px;height:{H}px;overflow:hidden}}
    .g{{position:absolute;inset:0;background:linear-gradient({grad})}}
    .v{{position:absolute;inset:0;background:radial-gradient(ellipse 80% 60% at 50% 44%,transparent 42%,rgba(0,0,0,.34) 100%)}}
    </style><div class="g"></div><div class="v"></div>""", f"bg_{page}")

    frames = int(round(dur * FPS))
    fc = (
        # page scrolls inside the hole, easing to a stop rather than cutting mid-glide
        f"[1:v]crop={SW}:{SH}:0:'{scroll}*sin(1.5708*min(t/{dur}\\,1))',setsar=1[pg];"
        f"[0:v][pg]overlay={SX}:{SY}[s];"
        f"[s][2:v]overlay=0:0[s2];"
        f"[3:v]format=rgba,fade=t=in:st=0.2:d=0.4:alpha=1[hd];"
        f"[s2][hd]overlay=x=0:y='max(0\\,22*(1-(t-0.2)/0.45))',format=yuv420p[v]"
    )
    r = subprocess.run([FF, "-y", "-loglevel", "error",
        "-loop", "1", "-i", str(OUT / f"bg_{page}.png"),
        "-loop", "1", "-i", str(P / f"tall_{page}.png"),
        "-loop", "1", "-i", str(OUT / "phone.png"),
        "-loop", "1", "-i", str(OUT / f"{head}.png"),
        "-filter_complex", fc, "-map", "[v]", "-t", str(dur), "-r", str(FPS),
        "-c:v", "libx264", "-preset", "slow", "-crf", "19", "-pix_fmt", "yuv420p",
        str(CLIPS / f"{page}.mp4")], capture_output=True, text=True)
    print(f"{page}: {'ok' if r.returncode==0 else 'FAIL ' + r.stderr[-300:]}")

lst = CLIPS / "list.txt"
order = [CLIPS / (p + ".mp4") for p, *_ in SHOTS] + [TAIL]
lst.write_text("".join(f"file '{c}'\n" for c in order))
final = HERE / "bandhantak-pages-ad.mp4"
r = subprocess.run([FF, "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(lst),
    "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
    "-map", "0:v", "-map", "1:a", "-shortest", "-c:v", "copy", "-c:a", "aac",
    "-movflags", "+faststart", str(final)], capture_output=True, text=True)
print("final:", "ok" if r.returncode == 0 else "FAIL " + r.stderr[-300:])
info = subprocess.run([FF, "-hide_banner", "-i", str(final)], capture_output=True, text=True).stderr
print("\n".join(l for l in info.splitlines() if "Duration" in l or "Video:" in l))
