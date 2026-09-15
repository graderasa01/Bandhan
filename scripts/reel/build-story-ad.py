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
ART, VO, TALK = HERE / "art", HERE / "vo", HERE / "talk"
WORK = HERE / "story"; WORK.mkdir(exist_ok=True)
SHELL = os.environ.get("HEADLESS_SHELL",
    "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell")
W, H, FPS = 1080, 1920, 30
WINE, CREAM = "#4a1119", "#f8f1e6"

# A poster is not a shot — it is a scene with several shots inside it. Showing
# five of them whole, one after another, is a carousel with motion: five
# finished compositions, five endings, no arc. So each one is used twice, wide
# then close, and the close-up is where the argument actually lives (the reason
# rows; the trust badges; the two faces).
#
# Crops are (left, top, right, bottom) fractions to TRIM, measured off the art
# and kept at 9:16 so nothing is re-cropped afterwards. They stop at 60% width:
# tighter than that and a 941px-wide source is being blown up past 2x, which
# reads as softness on a phone — the close-up would cost more than it buys.
#
# Captions are only on the narrator, who carries no type. In the wide shots the
# posters' own headlines do the talking; the close-ups show rather than tell.
# Every edge is placed in clean space. A crop that lands mid-sentence leaves
# half a line hanging at the top of the frame, which reads as a mistake no
# matter how good the shot behind it is — the first pass did exactly that on
# all three close-ups.
NARRATOR_MED  = (0.12, 0.00, 0.12, 0.24)  # head and shoulders, plain kurta below for the line
REASONS_TIGHT = (0.23, 0.30, 0.23, 0.16)  # exactly the phone: below the chips, above the wordmark
TRUST_TIGHT   = (0.22, 0.31, 0.22, 0.13)  # below "Jo verify nahi hua…", above the logo
FAMILY_TIGHT  = (0.20, 0.33, 0.20, 0.07)  # below "Privacy. Clear next step.", both faces in
FULL = (0, 0, 0, 0)

SHOTS = [
    dict(img="narrator", secs=2.6, move="push",  crop=NARRATOR_MED,  join="cut", vo="story0",
         cap="Isme accha<br>kya hai?", cap_top=0.76, cap_size=84, ink=WINE),
    dict(img="reasons",  secs=2.6, move="read",  crop=FULL,          join="cut", vo="story1",
         cap=None, cap_top=0.16, ink=WINE),
    dict(img="reasons",  secs=2.4, move="drift", crop=REASONS_TIGHT, join="cut", vo=None,
         cap=None, cap_top=0.16, ink=WINE),
    dict(img="trust",    secs=2.4, move="pull",  crop=FULL,          join="cut", vo="story2",
         cap=None, cap_top=0.16, ink=WINE),
    dict(img="trust",    secs=2.4, move="push",  crop=TRUST_TIGHT,   join="cut", vo=None,
         cap=None, cap_top=0.16, ink=WINE),
    dict(img="family",   secs=2.2, move="drift", crop=FAMILY_TIGHT,  join="cut", vo="story3",
         cap=None, cap_top=0.16, ink=WINE),
    dict(img="family",   secs=2.2, move="pull",  crop=FULL,          join="cut", vo=None,
         cap=None, cap_top=0.16, ink=WINE),
    dict(img="narrator", secs=2.8, move="hold",  crop=FULL,          join="dissolve", vo="story4",
         cap="bandhantak.com<br>Registration free hai", cap_top=0.75, ink=WINE),
]

# Intermediates get re-encoded by the join anyway, so the time belongs there,
# not eight times over. veryfast at crf 16 is visually free and several times
# quicker — the old medium/crf18 turned a 26s ad into a twenty-minute build.
FAST = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "16"]
FOIL_AFTER = {2, 4}   # only the two act breaks: into trust, and into family
# Every transition closes this far before the end of the footage it leaves; the
# join below says what happens when one runs past it.
MARGIN = 1 / FPS

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

F7 = base64.b64encode(pkg_file("@fontsource/poppins/files/poppins-latin-700-normal.woff2").read_bytes()).decode()

def caption(text, ink, name, top, size=62):
    glow = "rgba(0,0,0,.5)" if ink == CREAM else "rgba(255,255,255,.6)"
    return shoot(f"""<!doctype html><meta charset="utf-8"><style>
    @font-face{{font-family:'Poppins';font-weight:700;src:url(data:font/woff2;base64,{F7}) format('woff2')}}
    html,body{{margin:0;width:{W}px;height:{H}px;overflow:hidden;background:transparent}}
    .l{{position:absolute;left:0;right:0;top:{top*100:.1f}%;transform:translateY(-50%);padding:0 80px;
      text-align:center;font-family:'Poppins',system-ui,sans-serif;font-weight:700;
      font-size:{size}px;line-height:1.18;letter-spacing:-0.02em;color:{ink};
      text-shadow:0 3px 26px {glow}}}
    </style><div class="l">{text}</div>""", name)

# gold sweep, drawn once and slid across
FOIL = shoot(f"""<!doctype html><meta charset="utf-8"><style>
html,body{{margin:0;width:{W}px;height:{H}px;overflow:hidden;background:transparent}}
.f{{position:absolute;inset:0;background:linear-gradient(103deg,
  rgba(168,136,72,0) 0%, rgba(232,207,154,.42) 32%, rgba(243,227,187,.52) 50%,
  rgba(201,169,110,.42) 68%, rgba(168,136,72,0) 100%)}}
</style><div class="f"></div>""", "foil")

# zoom start, zoom end, and where the move is biased vertically
# (0 = toward the top, 0.5 = centre, 1 = toward the bottom).
#
# Every move starts or ends at 1.0, which is the WHOLE image. These are finished
# posters with a chip at the very top and a CTA button at the very bottom, so
# anything that never shows 1.0 silently crops the brand off both ends.
MOVES = {
    "push":  (1.00, 1.05, 0.50),   # come closer, gently
    "pull":  (1.07, 1.00, 0.45),   # start tight, open out to the full poster
    "drift": (1.00, 1.04, 0.55),
    "read":  (1.00, 1.08, 0.66),   # opens on the whole poster, settles on the reasons
    "hold":  (1.00, 1.02, 0.50),
}

# ---------- let the voice set the lengths ----------
# A line that outruns its pictures leaves the voice talking over nothing at the
# end — which is exactly what the written-in durations did the first time the
# real audio went on. So where voice files exist, each segment (a shot with a
# line, plus the shots after it that carry none) is stretched to fit its take,
# and the extra is shared across those shots in proportion. Shorter takes never
# shrink a shot: the picture timings below are the floor.
def fit_to_voice():
    segs, cur = [], None
    for i, sh in enumerate(SHOTS):
        if sh.get("vo"):
            cur = [i]; segs.append(cur)
        elif cur is not None:
            cur.append(i)
    for seg in segs:
        name = SHOTS[seg[0]]["vo"]
        f = VO / f"{name}.mp3"
        if not f.exists():
            continue
        d = seconds(f)
        if d is None:
            continue
        need = 0.25 + d + 0.35          # a beat in, the take, a beat out
        have_secs = sum(SHOTS[i]["secs"] for i in seg)
        if need <= have_secs:
            continue
        scale = need / have_secs
        for i in seg:
            SHOTS[i]["secs"] = round(SHOTS[i]["secs"] * scale, 2)
        print(f"{name}: take is {d:.2f}s — segment stretched "
              f"{have_secs:.2f}s -> {need:.2f}s")

if any(sh.get("vo") and (VO / f"{sh['vo']}.mp3").exists() for sh in SHOTS):
    fit_to_voice()

clips = []
for i, sh in enumerate(SHOTS):
    src = art(sh["img"])
    n = int(round(sh["secs"] * FPS))
    z0, z1, bias = MOVES[sh["move"]]
    l, t, r, b = sh["crop"]

    # A narrator shot whose line has a lip-synced take in talk/<vo>.mp4 moves on
    # that clip instead of the still. The take is rendered from the same art at
    # 1080x1920 and opens on the same 0.25s beat the voice cue leaves, so the
    # mouth lands on the words; the clip's own audio is ignored. A take shorter
    # than the shot holds its last frame, which is the mouth closed.
    talk = TALK / f"{sh['vo']}.mp4" if sh.get("vo") and sh["img"] == "narrator" else None
    talk = talk if talk and talk.exists() else None

    # No overscan: the art is already 9:16, so it is scaled to the frame exactly
    # and zoom alone does the moving. Cropping first would cost the top chip and
    # the bottom CTA before the shot even starts.
    pre = ("[0:v]" + (f"fps={FPS},tpad=stop_mode=clone:stop_duration=2," if talk else "") +
           f"crop=iw*{1-l-r}:ih*{1-t-b}:iw*{l}:ih*{t},"
           f"scale={W}:{H}:force_original_aspect_ratio=increase,"
           f"crop={W}:{H},setsar=1[src];")

    z = f"{z0}+({z1}-{z0})*on/{max(n-1,1)}"
    # `bias` picks which part of the frame the zoom closes on: 0.5 holds centre,
    # higher settles lower. At zoom 1.0 the expression is 0 either way, so the
    # whole poster is on screen at the end of a pull and the start of a push.
    y = f"(ih-ih/zoom)*{bias}"
    # zoompan emits `d` frames per INPUT frame: the whole shot from one still,
    # but one out per one in on a clip (prep-portrait.py learnt that the hard way).
    zp = (f"[src]zoompan=z='{z}':d={1 if talk else n}:x='iw/2-(iw/zoom/2)':y='{y}'"
          f":s={W}x{H}:fps={FPS}[bg];")
    source = ["-i", str(talk)] if talk else ["-loop", "1", "-i", str(src)]

    if sh["cap"]:
        cap = caption(sh["cap"], sh["ink"], f"cap{i}", sh["cap_top"],
                      sh.get("cap_size", 62))
        fc = (pre + zp +
              f"[1:v]format=rgba,fade=t=in:st=0.35:d=0.5:alpha=1[cp];"
              f"[bg][cp]overlay=x=0:y='max(0\\,24*(1-(t-0.35)/0.55))',format=yuv420p[v]")
        ins = [*source, "-loop", "1", "-i", str(cap)]
    else:
        fc = pre + zp + "[bg]format=yuv420p[v]"
        ins = source

    out = WORK / f"s{i}.mp4"
    sh["secs"] = n / FPS    # what is really rendered; every timing below reads it
    run([FF, "-y", "-loglevel", "error", *ins, "-filter_complex", fc,
         "-map", "[v]", "-frames:v", str(n), "-r", str(FPS),
         *FAST, "-pix_fmt", "yuv420p", str(out)], f"shot {i} ({sh['img']})")
    clips.append(out)
    print(f"shot {i}: {sh['img']:9} {sh['secs']:.1f}s  {sh['move']}" + ("  lip-sync" if talk else ""))

    if i in FOIL_AFTER:
        fo = WORK / f"foil{i}.mp4"
        end = sh["secs"] - MARGIN      # where the cut out of this shot completes
        run([FF, "-y", "-loglevel", "error", "-i", str(out),
             "-loop", "1", "-i", str(FOIL),
             "-filter_complex",
             # the sweep crosses the last 0.4s, so it reads as a wipe into the cut
             f"[1:v]format=rgba[f];"
             f"[0:v][f]overlay=x='(t-{end-0.4:.4f})/0.4*{W*2}-{W}':y=0"
             f":enable='gte(t,{end-0.4:.4f})',format=yuv420p[v]",
             # -frames:v is load-bearing: the sweep comes in on `-loop 1`, an
             # infinite stream, so without a length this never reaches EOF — it
             # ran for minutes writing a file that only grew.
             "-map", "[v]", "-frames:v", str(n),
             *FAST, "-pix_fmt", "yuv420p", str(fo)], f"foil {i}")
        clips[-1] = fo

# ---------- join, dissolving where the script asks ----------
joined = WORK / "joined.mp4"
chain = [f"[{i}:v]settb=AVTB,fps={FPS}[c{i}]" for i in range(len(clips))]
cur, off = "[c0]", SHOTS[0]["secs"]
starts = [0.0]
# xfade's offset is measured on the FIRST input's timeline and each transition
# shortens the result by its own duration, so the running length must lose `d`
# BEFORE the offset is used — every time, cut and dissolve alike. Subtracting
# after (as the cut branch first did) puts the transition at the very end of
# the incoming clip, which is out of range and fails the join.
#
# It also loses MARGIN. A transition whose window runs even a few ms past the
# end of the footage before it does not fail: xfade (ffmpeg 6.1) quietly ends
# the whole output there. Once the voice stretched shots to lengths that are
# not whole frames, each clip came out a few ms short of its `secs`, the second
# cut overran by 13ms, and the film stopped at 5.3s under 20.9s of voice. Clips
# are now exactly `secs` long, so MARGIN is only a guard against rounding.
for i in range(1, len(clips)):
    d = 0.45 if SHOTS[i]["join"] == "dissolve" else 0.04
    off -= d + MARGIN
    starts.append(off)
    chain.append(f"{cur}[c{i}]xfade=transition=fade:duration={d}:offset={off:.4f}[x{i}]")
    cur = f"[x{i}]"
    off += SHOTS[i]["secs"]
chain.append(f"{cur}format=yuv420p[v]")
run([FF, "-y", "-loglevel", "error", *sum([["-i", str(c)] for c in clips], []),
     "-filter_complex", ";".join(chain), "-map", "[v]",
     "-c:v", "libx264", "-preset", "medium", "-crf", "18",
     "-pix_fmt", "yuv420p", str(joined)], "join")

# A file's Duration is its LONGEST stream, so a short picture under a full voice
# track reports the voice's length. Check the picture on its own.
picture = seconds(joined)
if picture is None or picture < off - 1.5 / FPS:
    raise SystemExit(f"join came out {picture}s, planned {off:.2f}s — a transition "
                     f"ran past the footage before it and xfade stopped there.")

# ---------- voice, laid at each shot's cue ----------
final = HERE / "bandhantak-story-ad.mp4"
have = [VO / f"{sh['vo']}.mp3" for sh in SHOTS
        if sh.get("vo") and (VO / f"{sh['vo']}.mp3").exists()]
music = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else None

if not have:
    print("\nNo vo/story*.mp3 — writing picture only. Run make-vo-clips.py --set story.")
    run([FF, "-y", "-loglevel", "error", "-i", str(joined),
         "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
         "-map", "0:v", "-map", "1:a", "-shortest", "-c:v", "copy", "-c:a", "aac",
         "-movflags", "+faststart", str(final)], "finalise")
else:
    # A line starts a beat after its shot does, at the very offsets the xfade
    # chain above used, so picture and voice cannot drift apart. `t` is where
    # the last shot begins, as before (the music fade keys off it).
    t = starts[-1]
    ins, mix, labels = [], [], []
    for i, sh in enumerate(SHOTS):
        name = sh.get("vo")
        if not name:
            continue
        p_vo = VO / f"{name}.mp3"
        if not p_vo.exists():
            continue
        ins += ["-i", str(p_vo)]
        ms = int((starts[i] + 0.25) * 1000)
        mix.append(f"[{len(ins)//2}:a]adelay={ms}|{ms}[v{i}]")
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

print(f"\n{final}  (picture {picture:.2f}s, file {seconds(final):.2f}s)")
