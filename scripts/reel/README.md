# Reel builder

Renders `docs/bandhantak/15_instagram_reel_ad_script.md` into a postable
1080×1920 MP4 — the text-animation cut, with no photography needed.

Output: 20.00s, H.264 + silent AAC track, hard cuts on the script's timings,
a slow Ken Burns move per shot, and each line fading up into place at the
second the script gives it.

## Run

```bash
cd scripts/reel
npm i ffmpeg-static @fontsource/mukta     # full ffmpeg (libx264) + Devanagari font
python3 build-frames.py                   # 6 backgrounds + 12 text layers -> frames/
python3 build-reel.py                     # per-shot clips -> clips/, joined -> bandhantak-reel-20s.mp4
```

Needs a headless Chromium for the text rendering. The bundled Playwright one is
used by default; point `$HEADLESS_SHELL` at another binary to override, and
`$FFMPEG` at another ffmpeg.

**The Playwright-bundled ffmpeg will not work.** It is built
`--disable-everything` — no libx264, no audio, no `zoompan`. Hence `ffmpeg-static`.

## Changing the ad

All copy lives in `LAYERS` in `build-frames.py`, keyed by shot number: `top` is
the line's vertical position as a percentage of frame height, `size` its pixel
size at 1080×1920. Shot durations and the second each line arrives live in
`SHOTS` in `build-reel.py`. Keep every line between 13% and 78% of frame
height — Instagram's own UI covers the bands outside that.

Backgrounds render at 1.5× so the Ken Burns move crops into real pixels
instead of upscaling.

## What this does not produce

No voiceover and no music — the script's VO lines are in the doc, to be
recorded or generated elsewhere and laid under the cut. The photographic
version is a separate route: generate the six stills on OpenArt with the
prompts in the doc, then swap them in for the gradient backgrounds.
