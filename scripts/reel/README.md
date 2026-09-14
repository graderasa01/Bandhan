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
python3 build-ui-card.py                  # the product's Rishta Reel card -> frames/card4.png
python3 build-shot4-ui.py                 # rebuilds clip 4 around that card, re-joins the reel
```

Run the first two for the all-type cut; add the last two for the cut whose
fourth shot shows the product instead of describing it.

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

## The product shot

`build-ui-card.py` renders the Rishta Reel card from
`components/public/home/ReelPreview.tsx` — counter, consent-gated photo, trust
pills, score ring, and the three reasons under the match including the orange
one naming what is *not* known. It is drawn at final size and never zoomed, so
its small type stays legible; only the background moves under it. When that
component changes, this mockup is what goes stale — re-read it before reusing
this for a new ad.

## The cut that shows the real site

The stronger ad is not type over a gradient — it is BandhanTak's own pages
scrolling inside a phone, captured from the app actually running. Nothing is
mocked and nothing is a model's guess at what the product looks like.

```bash
npm run dev                               # in the repo root, with a seeded db
cd scripts/reel
python3 capture-pages.py                  # real pages -> pages/
python3 build-pages-ad.py                 # -> bandhantak-pages-ad.mp4
```

`capture-pages.py` takes public pages only. Anything behind a login would need
a seeded session, and an ad must never put one real member's data on screen.

Two things to keep straight when picking pages. The capture is of whatever the
app is serving, so a stale seed or a half-built page goes straight into the ad —
look at `pages/` before building. And a page can contradict the line you put
over it: the pricing page's visible card is BASIC at Rs999 carrying
"Roz 5 rishtey", which is why the cut ends on the brand plate rather than there.

## Voice

`add-voice.py` speaks the script's lines with ElevenLabs and lays each one at
its own cue under the video, so the voice stays locked to the picture even when
a take runs long.

```bash
export ELEVENLABS_API_KEY=...
python3 add-voice.py bandhantak-pages-ad.mp4 final.mp4 music.mp3
```

It cannot run from the Claude Code web sandbox — that proxy passes package
registries and answers 403 to api.elevenlabs.io, as it does to every other
hosted TTS. It is written to run on your own machine, and has not been executed
anywhere yet.

## The narrator cut, lip-synced on your own GPU

The narrator opens and closes on camera and talks over the product in between.
That shape is deliberate: a face on screen for all 20 seconds costs three to
four generations, and cutting away to the thing being sold is better anyway.

**OpenArt's lip-sync models cannot be run locally.** Seedance 2.0 is ByteDance's
and MiniMax H3 is MiniMax's — both are closed weights behind an API, so on
OpenArt a talking shot costs 560 credits at 720p/8s and 1600 at 1080p/8s.
On a GPU you own, open-source lip-sync costs nothing per shot. **LatentSync** is
the pick, and is also ByteDance's — the same lab, published openly. Wav2Lip is
the fallback: older and softer around the mouth, but light and forgiving.

### Order of operations, and why

Lip-sync models take a **video** plus audio, not a still, and they track a face —
so they do their best work on a steady shot. Give them the drift and they fight
the camera for nothing. So: still to static clip, lip-sync, then motion.

```bash
# once: see what the machine has and which backend fits its VRAM
python3 lipsync.py doctor
./lipsync-setup.sh musetalk          # or latentsync / wav2lip
#   -> clones it, builds a venv, installs it, registers it in lipsync.json
#   -> then fetch that repo's weights the way it documents, and re-run doctor

# per ad
export ELEVENLABS_API_KEY=...  ELEVENLABS_VOICE_ID=...
python3 make-vo-clips.py                                   # voice, one file per shot
python3 lipsync.py run --image face.png --audio vo/talk1.mp3 --out talk/talk1.mp4
python3 lipsync.py run --image face.png --audio vo/talk2.mp3 --out talk/talk2.mp4
python3 build-narrator-ad.py music.mp3                     # -> bandhantak-narrator-ad.mp4
```

`lipsync.py run` does prep, the backend call, and the motion pass in one go, so
the order above never has to be remembered.

### Which backend

| | VRAM | |
|---|---|---|
| **musetalk** | ~8 GB | Fastest. Good mouth detail. Start here unless the card is small. |
| **latentsync** | ~20 GB | Best quality. ByteDance's own — the lab behind Seedance. |
| **wav2lip** | ~4 GB | Lightest, most forgiving. Softer mouth; pair with a face restorer. |

`doctor` reads the actual VRAM and says which fit.

### When a backend's flags have moved

These repos rename entrypoints between releases, and this file cannot chase
them. Each backend's command lives in one place — `lipsync.json`, written by
the setup script — and `lipsync.py` reads it there. Fix it once when a run
fails; nothing else in the pipeline has the command baked in.

`prep-portrait.py` writes 25fps and 16kHz mono because that is what these
checkpoints were trained on; hand one 30fps and 44.1kHz and the mouth drifts.
It also pads 0.35s of silence, so the shot does not end on a consonant and the
model has frames to close the mouth on.

**What was actually run, and what was not.** `prep-portrait.py`,
`build-narrator-ad.py` and `lipsync.py doctor` were built and exercised here —
the assembly end to end against stand-ins (espeak for the voice, a synthetic
clip for the narrator), producing a correct 1080x1920 H.264 + AAC file with
every shot's audio in place, and the config round-trip from setup through
backend detection. The ElevenLabs call, the setup script's clone/pip, and the
lip-sync itself have not been run anywhere: this sandbox answers 403 to
api.elevenlabs.io and to HuggingFace and has no CUDA device. Expect the first
local run of those three to need a correction or two — the backend command in
`lipsync.json` is the one place to make it.

### Keeping one face across both shots

Generate the portrait once and reuse it. For the second shot, give the image
back to the generator and ask for the same person — do not write the
description again from scratch, or you get her sister. Front-facing, even
light, mouth closed, nothing across the jaw.

### Before this goes anywhere near an ad account

The narrator is not a member and must never speak as one. "Mujhe mera rishta
yahan mila" from a generated face is a fabricated testimonial — against Meta
and ASCI rules, and against the one thing this product sells. She narrates the
brand; she does not have a story. Meta's AI-generated-content toggle goes on.

## What this does not produce

No music — the cut ships with a silent track for Instagram to accept, and
`add-voice.py` will mix a file you supply. No photography of real people
either: there is no image model here, so faces come from OpenArt (prompts are
in the doc) or a camera. `espeak-ng` installs
here and speaks Hindi, but it is formant synthesis and sounds like a machine —
usable as a scratch track to lock timing, not as an ad's voice. The neural
options were checked and are out of reach from this environment: the proxy
allows package registries only, so the Edge, Google and HuggingFace endpoints
every good TTS depends on all answer 403. The photographic
version is a separate route: generate the six stills on OpenArt with the
prompts in the doc, then swap them in for the gradient backgrounds.
