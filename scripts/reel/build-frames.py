# -*- coding: utf-8 -*-
"""Render the reel's backgrounds and text layers as PNGs with headless Chromium.

Backgrounds render at 1.5x so ffmpeg's Ken Burns zoom has real pixels to crop
into instead of upscaling. Text layers render at final size with alpha, one
layer per line, each already in its final position, so ffmpeg only has to fade
them in at the right second.
"""
import base64, os, subprocess, pathlib

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE / "frames"
OUT.mkdir(exist_ok=True)
SHELL = os.environ.get("HEADLESS_SHELL",
    "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell")

W, H = 1080, 1920
BGW, BGH = 1620, 2880

fdir = HERE / "node_modules/@fontsource/mukta/files"
FONT800 = base64.b64encode((fdir / "mukta-devanagari-800-normal.woff2").read_bytes()).decode()
FONT700 = base64.b64encode((fdir / "mukta-devanagari-700-normal.woff2").read_bytes()).decode()

FONTCSS = """
@font-face{font-family:'Mukta';font-style:normal;font-weight:800;src:url(data:font/woff2;base64,%s) format('woff2');}
@font-face{font-family:'Mukta';font-style:normal;font-weight:700;src:url(data:font/woff2;base64,%s) format('woff2');}
""" % (FONT800, FONT700)

# Six shots: gradient ground, a warm/cool light blob, and the ink the text takes.
SHOTS = [
    dict(n=1, grad="168deg, #10243a 0%, #16344f 46%, #0b1725 100%",
         blob="radial-gradient(circle at 62% 34%, rgba(120,180,240,.30), transparent 58%)",
         ink="#e4eef8", dim="#9fbcd8"),
    dict(n=2, grad="168deg, #2c1d13 0%, #4a3320 52%, #1c120b 100%",
         blob="radial-gradient(circle at 38% 40%, rgba(255,196,110,.26), transparent 60%)",
         ink="#f3e4cc", dim="#c6ab84"),
    dict(n=3, grad="168deg, #f7dcab 0%, #eaba79 48%, #c98e4e 100%",
         blob="radial-gradient(circle at 70% 26%, rgba(255,248,225,.72), transparent 55%)",
         ink="#33200b", dim="#5e4120"),
    dict(n=4, grad="168deg, #fdf3e2 0%, #f7dcae 55%, #edbf7d 100%",
         blob="radial-gradient(circle at 32% 30%, rgba(255,255,255,.80), transparent 58%)",
         ink="#4a1119", dim="#7d3b2c"),
    dict(n=5, grad="168deg, #3a1a1e 0%, #5c2a24 50%, #2a1214 100%",
         blob="radial-gradient(circle at 56% 36%, rgba(255,178,140,.24), transparent 58%)",
         ink="#f8e9d3", dim="#d3ac8d"),
    dict(n=6, grad="168deg, #fffdf8 0%, #f6ecd8 58%, #e6d2a8 100%",
         blob="radial-gradient(circle at 50% 30%, rgba(255,255,255,.9), transparent 55%)",
         ink="#4a1119", dim="#806634"),
]

# Text layers. top = where the block sits, as a % of frame height.
# size/weight tuned so the longest line still fits inside the side gutters.
LAYERS = {
  1: [dict(id="a", top=40, size=104, lh=1.14, text="10,000<br>प्रोफाइल देखीं।", tone="ink"),
      dict(id="b", top=58, size=88,  lh=1.16, text="बात 2 से हुई।", tone="dim")],
  2: [dict(id="a", top=39, size=86, lh=1.18, text="प्रोफाइल की<br>कमी नहीं थी।", tone="dim"),
      dict(id="b", top=58, size=100, lh=1.16, text="वजह की<br>कमी थी।", tone="ink")],
  3: [dict(id="a", top=38, size=98, lh=1.16, text="फ़ॉर्म नहीं।<br>बस बोलिए।", tone="ink"),
      dict(id="b", top=58, size=72, lh=1.2,  text="2 मिनट में प्रोफाइल।", tone="dim")],
  4: [dict(id="a", top=36, size=112, lh=1.1, text="रोज़ 5 रिश्ते।<br>हज़ारों नहीं।", tone="ink"),
      dict(id="b", top=59, size=68,  lh=1.25, text="हर एक के साथ — क्यों।", tone="dim")],
  5: [dict(id="a", top=39, size=96, lh=1.14, text="7 लेवल<br>वेरिफिकेशन", tone="ink"),
      dict(id="b", top=59, size=62, lh=1.3,  text="जो verify नहीं —<br>वो भी साफ़ लिखा।", tone="dim")],
  6: [dict(id="a", top=38, size=118, lh=1.1, text="BandhanTak", tone="ink", brand=True),
      dict(id="b", top=57, size=60,  lh=1.45, text="bandhantak.com<br>प्रोफाइल बनाना फ्री है", tone="dim")],
}

def shoot(html, path, w, h, transparent):
    src = OUT / (path.stem + ".html")
    src.write_text(html, encoding="utf-8")
    cmd = [SHELL, "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
           "--force-device-scale-factor=1", f"--window-size={w},{h}",
           "--virtual-time-budget=4000", f"--screenshot={path}"]
    if transparent:
        cmd.append("--default-background-color=00000000")
    cmd.append("file://" + str(src))
    subprocess.run(cmd, capture_output=True)

for s in SHOTS:
    # ---- background: gradient + light blob + grain + vignette, no text ----
    bg = f"""<!doctype html><meta charset="utf-8"><style>
    html,body{{margin:0;padding:0;width:{BGW}px;height:{BGH}px;overflow:hidden}}
    .g{{position:absolute;inset:0;background:linear-gradient({s['grad']})}}
    .b{{position:absolute;inset:0;background:{s['blob']}}}
    .v{{position:absolute;inset:0;background:radial-gradient(ellipse 78% 58% at 50% 46%,transparent 40%,rgba(0,0,0,.30) 100%)}}
    </style><div class="g"></div><div class="b"></div><div class="v"></div>"""
    shoot(bg, OUT / f"bg{s['n']}.png", BGW, BGH, False)

    # ---- text layers: transparent, each line already in final position ----
    for L in LAYERS[s["n"]]:
        color = s["ink"] if L["tone"] == "ink" else s["dim"]
        fam = "'Mukta',sans-serif"
        weight = 800
        ls = "-0.01em"
        if L.get("brand"):
            fam = "Georgia,'Times New Roman',serif"
            ls = "-0.02em"
        shadow = "0 4px 28px rgba(0,0,0,.34)" if s["n"] in (1, 2, 5) else "0 3px 20px rgba(255,255,255,.45)"
        txt = f"""<!doctype html><meta charset="utf-8"><style>{FONTCSS}
        html,body{{margin:0;padding:0;width:{W}px;height:{H}px;overflow:hidden;background:transparent}}
        .l{{position:absolute;left:0;right:0;top:{L['top']}%;transform:translateY(-50%);
           padding:0 88px;text-align:center;
           font-family:{fam};font-weight:{weight};font-size:{L['size']}px;line-height:{L['lh']};
           letter-spacing:{ls};color:{color};text-shadow:{shadow};}}
        </style><div class="l">{L['text']}</div>"""
        shoot(txt, OUT / f"t{s['n']}{L['id']}.png", W, H, True)

print("rendered:", len(sorted(OUT.glob("*.png"))), "pngs")
for p in sorted(OUT.glob("*.png")):
    print(" ", p.name, p.stat().st_size)
