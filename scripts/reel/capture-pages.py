# -*- coding: utf-8 -*-
"""Capture real BandhanTak pages from a locally running app, for ads that show
the product instead of describing it.

Needs the app up (`npm run dev`) with a seeded database. Writes two sizes per
page: a phone-viewport still, and a tall capture the ad scrolls through.

    python3 capture-pages.py                      # localhost:3000
    BASE=http://localhost:4000 python3 capture-pages.py
"""
import os, pathlib, subprocess, sys

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE / "pages"; OUT.mkdir(exist_ok=True)
BASE = os.environ.get("BASE", "http://localhost:3000")
SHELL = os.environ.get("HEADLESS_SHELL",
    "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell")

# Public pages only. Anything behind a login needs a seeded session, and an ad
# must never show one real member's data.
PAGES = {
    "home": "/", "bolo": "/bolo", "how": "/how-it-works",
    "pricing": "/pricing", "safety": "/safety", "partners": "/partners",
}

def shoot(url, path, w, h):
    # scale 2 so the phone screen gets real pixels, not an upscale
    subprocess.run([SHELL, "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
                    "--force-device-scale-factor=2", f"--window-size={w},{h}",
                    "--virtual-time-budget=9000", f"--screenshot={path}", url],
                   capture_output=True, timeout=90)
    return path.exists() and path.stat().st_size > 0

ok = True
for name, route in PAGES.items():
    url = BASE + route
    a = shoot(url, OUT / f"{name}.png", 540, 960)          # 1080x1920 viewport
    b = shoot(url, OUT / f"tall_{name}.png", 386, 1500)    # 772x3000 to scroll
    print(f"{name:9} {'ok' if a and b else 'FAILED'}  {url}")
    ok = ok and a and b

if not ok:
    print("\nSome captures failed. Is the app up at " + BASE + "?", file=sys.stderr)
    sys.exit(1)
