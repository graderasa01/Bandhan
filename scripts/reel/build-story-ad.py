# -*- coding: utf-8 -*-
"""Build the "Isme accha kya hai?" ad from four supplied stills.

Each shot gets its OWN camera move, chosen for what that frame is doing — push
in to come closer, a downward drift to read, a pull back to show the whole
thing. One zoom applied to everything is the tell of an AI slideshow, and this
is the cheapest way not to look like one.

    mkdir art && put narrator.png family.png reasons.png trust.png in it
    python3 make-vo-clips.py --set story
    python3 build-story-ad.py [music.mp3]

Docs: docs/bandhantak/17_story_ad_isme_accha_kya_hai.md
"""
import base64, os, pathlib, subprocess, sys

HERE = pathlib.Path(__file__).resolve().parent
ART, VO = HERE / "art", HERE / "vo"
WORK = HERE / "story"; WORK.mkdir(exist_ok=True)
SHELL = os.environ.get("HEADLESS_SHELL",
    "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell")
W, H, FPS = 1080, 1920, 30
WINE, CREAM = "#4a1119", "#f8f1e6"

# name, seconds, move, caption (None where the artwork carries its own type),
# where that caption sits as a fraction of frame height, its ink, and how this
# shot joins the previous one.
#
# The three posters are used whole — no crop. They are designed pieces with
# their own headline, and setting another line over them would be saying the
# same thing twice in two typefaces. Only the narrator frames, which carry no
# text, get a caption. That also decides the order: the family image's line
# ("Rishta sirf dekho nahi. Samajhkar aage badho.") is a resolution, not a
# problem, so it lands late rather than early.
SHOTS = [
    dict(img="narrator", secs=5.0, move="push",  cap=None, cap_top=0.16,
         ink=CREAM, crop=(0, 0, 0, 0), join="cut"),
    dict(img="reasons",  secs=5.5, move="read",  cap=None, cap_top=0.16,
         ink=WINE,  crop=(0, 0, 0, 0), join="cut"),
    dict(img="trust",    secs=5.5, move="pull",  cap=None, cap_top=0.16,
         ink=WINE,  crop=(0, 0, 0, 0), join="cut"),
    dict(img="family",   secs=4.5, move="drift", cap=None, cap_top=0.16,
         ink=WINE,  crop=(0, 0, 0, 0), join="dissolve"),
    dict(img="narrator", secs=5.0, move="hold",
         cap="bandhantak.com<br>Registration free hai", cap_top=0.75,
         ink=WINE,  crop=(0, 0, 0, 0), join="dissolve"),
]

# Intermediates get re-encoded by the join anyway, so the time belongs there,
# not five times over. veryfast at crf 16 is visually free and several times
# quicker — the old medium/crf18 turned a 26s ad into a twenty-minute build.
FAST = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "16"]
FOIL_AFTER = {1, 3}   # a gold sweep between acts — twice only, or it turns cheap

def ffmpeg():
    if os.environ.get("FFMPEG"):
        return os.environ["FFMPEG"]
    r = subprocess.run(["node", "-p", "require('ffmpeg-static')"],
                       cwd=HERE, capture_output=True, text=True)
    if r.returncode == 0 and r.stdout.strip():
        return r.stdout.strip()
    raise SystemExit("No ffmpeg. `npm i ffmpeg-static` here, or set $FFMPEG.")

FF = ffmpeg()

def run(args, what):
    r = subprocess.run(args, capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(f"{what} failed:\n{r.stderr[-700:]}")

def seconds(p):
    out = subprocess.run([FF, "-hide_banner", "-i", str(p)],
                         capture_output=True, text=True).stderr
    for line in out.splitlines():
        if "Duration:" in line:
            h, m, s = line.split("Duration:")[1].split(",")[0].strip().split(":")
            return int(h) * 3600 + int(m) * 60 + float(s)
    return None

def shoot(html, name):
    src = WORK / (name + ".html"); src.write_text(html, encoding="utf-8")
    subprocess.run([SHELL, "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
                    "--force-device-scale-factor=1", f"--window-size={W},{H}",
                    "--default-background-color=00000000", "--virtual-time-budget=4000",
                    f"--screenshot={WORK / (name + '.png')}", "file://" + str(src)],
                   capture_output=True)
    return WORK / (name + ".png")

def art(name):
    for ext in (".png", ".jpg", ".jpeg", ".webp"):
        p = ART / (name + ext)
        if p.exists():
            return p
    raise SystemExit(f"Missing {ART/name}.png — see "
                     f"docs/bandhantak/17_story_ad_isme_accha_kya_hai.md")

# ---------- captions, in the product's own display face ----------
fdir = HERE / "node_modules/@fontsource/poppins/files"
F7 = base64.b64encode((fdir / "poppins-latin-700-normal.woff2").read_bytes()).decode()

def caption(text, ink, name, top):
    glow = "rgba(0,0,0,.5)" if ink == CREAM else "rgba(255,255,255,.6)"
    return shoot(f"""<!doctype html><meta charset="utf-8"><style>
    @font-face{{font-family:'Poppins';font-weight:700;src:url(data:font/woff2;base64,{F7}) format('woff2')}}
    html,body{{margin:0;width:{W}px;height:{H}px;overflow:hidden;background:transparent}}
    .l{{position:absolute;left:0;right:0;top:{top*100:.1f}%;transform:translateY(-50%);padding:0 80px;
      text-align:center;font-family:'Poppins',system-ui,sans-serif;font-weight:700;
      font-size:62px;line-height:1.2;letter-spacing:-0.02em;color:{ink};
      text-shadow:0 3px 26px {glow}}}
    </style><div class="l">{text}</div>""", name)

# gold sweep, drawn once and slid across
FOIL = shoot(f"""<!doctype html><meta charset="utf-8"><style>
html,body{{margin:0;width:{W}px;height:{H}px;overflow:hidden;background:transparent}}
.f{{position:absolute;inset:0;background:linear-gradient(103deg,
  rgba(168,136,72,0) 0%, rgba(232,207,154,.78) 32%, rgba(243,227,187,.85) 50%,
  rgba(201,169,110,.78) 68%, rgba(168,136,72,0) 100%)}}
</style><div class="f"></div>""", "foil")

MOVES = {   # zoom start, zoom end, y drift as a fraction of the overscan
    "push":  (1.00, 1.09, 0.0),
    "pull":  (1.09, 1.00, 0.0),
    "drift": (1.02, 1.07, 0.0),
    "read":  (1.06, 1.06, 1.0),   # no zoom, travels down — the eye reading
    "hold":  (1.01, 1.04, 0.0),
}

clips = []
for i, sh in enumerate(SHOTS):
    src = art(sh["img"])
    n = int(round(sh["secs"] * FPS))
    z0, z1, dy = MOVES[sh["move"]]
    l, t, r, b = sh["crop"]

    # Trim, then fill the 9:16 frame with overscan so the move never hits an edge.
    OS = 1.16
    pre = (f"[0:v]crop=iw*{1-l-r}:ih*{1-t-b}:iw*{l}:ih*{t},"
           f"scale={int(W*OS)}:{int(H*OS)}:force_original_aspect_ratio=increase,"
           f"crop={int(W*OS)}:{int(H*OS)},setsar=1[src];")

    z = f"{z0}+({z1}-{z0})*on/{max(n-1,1)}"
    # `read` walks down the frame; the others stay centred.
    y = (f"(ih-ih/zoom)*(0.12+0.70*on/{max(n-1,1)})" if dy else "ih/2-(ih/zoom/2)")
    zp = (f"[src]zoompan=z='{z}':d={n}:x='iw/2-(iw/zoom/2)':y='{y}'"
          f":s={W}x{H}:fps={FPS}[bg];")

    if sh["cap"]:
        cap = caption(sh["cap"], sh["ink"], f"cap{i}", sh["cap_top"])
        fc = (pre + zp +
              f"[1:v]format=rgba,fade=t=in:st=0.35:d=0.5:alpha=1[cp];"
              f"[bg][cp]overlay=x=0:y='max(0\\,24*(1-(t-0.35)/0.55))',format=yuv420p[v]")
        ins = ["-loop", "1", "-i", str(src), "-loop", "1", "-i", str(cap)]
    else:
        fc = pre + zp + "[bg]format=yuv420p[v]"
        ins = ["-loop", "1", "-i", str(src)]

    out = WORK / f"s{i}.mp4"
    run([FF, "-y", "-loglevel", "error", *ins, "-filter_complex", fc,
         "-map", "[v]", "-t", str(sh["secs"]), "-r", str(FPS),
         *FAST, "-pix_fmt", "yuv420p", str(out)], f"shot {i} ({sh['img']})")
    clips.append(out)
    print(f"shot {i}: {sh['img']:9} {sh['secs']:.1f}s  {sh['move']}")

    if i in FOIL_AFTER:
        fo = WORK / f"foil{i}.mp4"
        run([FF, "-y", "-loglevel", "error", "-i", str(out),
             "-loop", "1", "-i", str(FOIL),
             "-filter_complex",
             # the sweep crosses the last 0.4s, so it reads as a wipe into the cut
             f"[1:v]format=rgba[f];"
             f"[0:v][f]overlay=x='(t-{sh['secs']-0.4})/0.4*{W*2}-{W}':y=0"
             f":enable='gte(t,{sh['secs']-0.4})',format=yuv420p[v]",
             "-map", "[v]", *FAST, "-pix_fmt", "yuv420p", str(fo)], f"foil {i}")
        clips[-1] = fo

# ---------- join, dissolving where the script asks ----------
joined = WORK / "joined.mp4"
chain = [f"[{i}:v]settb=AVTB,fps={FPS}[c{i}]" for i in range(len(clips))]
cur, off = "[c0]", SHOTS[0]["secs"]
# xfade's offset is measured on the FIRST input's timeline and each transition
# shortens the result by its own duration, so the running length must lose `d`
# BEFORE the offset is used — every time, cut and dissolve alike. Subtracting
# after (as the cut branch first did) puts the transition at the very end of
# the incoming clip, which is out of range and fails the join.
for i in range(1, len(clips)):
    d = 0.45 if SHOTS[i]["join"] == "dissolve" else 0.04
    off -= d
    chain.append(f"{cur}[c{i}]xfade=transition=fade:duration={d}:offset={off:.3f}[x{i}]")
    cur = f"[x{i}]"
    off += SHOTS[i]["secs"]
chain.append(f"{cur}format=yuv420p[v]")
run([FF, "-y", "-loglevel", "error", *sum([["-i", str(c)] for c in clips], []),
     "-filter_complex", ";".join(chain), "-map", "[v]",
     "-c:v", "libx264", "-preset", "medium", "-crf", "18",
     "-pix_fmt", "yuv420p", str(joined)], "join")

# ---------- voice, laid at each shot's cue ----------
final = HERE / "bandhantak-story-ad.mp4"
lines = [VO / f"story{i}.mp3" for i in range(len(SHOTS))]
have = [p for p in lines if p.exists()]
music = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else None

if not have:
    print("\nNo vo/story*.mp3 — writing picture only. Run make-vo-clips.py --set story.")
    run([FF, "-y", "-loglevel", "error", "-i", str(joined),
         "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
         "-map", "0:v", "-map", "1:a", "-shortest", "-c:v", "copy", "-c:a", "aac",
         "-movflags", "+faststart", str(final)], "finalise")
else:
    cues, t = [], 0.0
    for i, sh in enumerate(SHOTS):
        cues.append(t + 0.25)
        t += sh["secs"] - (0.45 if i + 1 < len(SHOTS) and SHOTS[i+1]["join"] == "dissolve" else 0.04)
    ins, mix, labels = [], [], []
    for i, p in enumerate(lines):
        if not p.exists():
            continue
        ins += ["-i", str(p)]
        idx = len(ins) // 2
        ms = int(cues[i] * 1000)
        mix.append(f"[{idx}:a]adelay={ms}|{ms}[v{i}]")
        labels.append(f"[v{i}]")
    if music and music.exists():
        ins += ["-i", str(music)]
        mix.append(f"[{len(ins)//2}:a]volume=0.10,afade=t=out:st={max(0,t-2):.2f}:d=2[mus]")
        labels.append("[mus]")
    mix.append(f"{''.join(labels)}amix=inputs={len(labels)}:normalize=0:"
               f"dropout_transition=0[m];[m]alimiter=limit=0.95,aresample=44100[a]")
    run([FF, "-y", "-loglevel", "error", "-i", str(joined), *ins,
         "-filter_complex", ";".join(mix), "-map", "0:v", "-map", "[a]",
         "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
         "-movflags", "+faststart", str(final)], "voice mix")

print(f"\n{final}  ({seconds(final):.2f}s)")
