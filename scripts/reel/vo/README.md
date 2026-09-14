# Voice takes

Five files, named exactly as the cut expects:

```
story0.mp3  story1.mp3  story2.mp3  story3.mp3  story4.mp3
```

The lines they say are in `../make-vo-clips.py` (`STORY`), and which shot each
one plays under is the `vo=` field in `../build-story-ad.py` (`SHOTS`).

Make them either way:

```bash
export SARVAM_API_KEY=...
python3 ../make-vo-clips.py --audition            # one line in six voices
python3 ../make-vo-clips.py --set story --voice shreya
```

Sarvam is the default because its Hindi is the reason to pick it and the app
already talks to it — `make-vo-clips.py` sends the same request
`app/api/speech/tts/route.ts` sends, so there is one known-good way to call it
in this repo rather than two. `--provider elevenlabs` is there if you prefer
its read. Or record a human: only the filenames matter.

**On the voice.** `lib/speech/voiceCatalog.ts` records that the team listened to
priya / neha / kavya / shreya and chose **shreya** as the product's assistant
voice, so that is the default here too — the ad and the app sounding like one
company is worth more than a fresh opinion. `--audition` renders the shortlist
anyway, because a voice is chosen by ear or not at all.

**Length is the thing to watch.** A line longer than the pictures under it
stretches its whole segment to fit, because a voice left talking over nothing
is worse than a shot held a beat too long. The script is written to about
2.5 words a second, ~41 words total, which lands the film near 19-21 seconds.
`build-story-ad.py` prints every segment it had to stretch — if it prints
several, the lines have grown, not the film.

Nothing is committed here on purpose: a placeholder voice in a repo is a
placeholder that eventually ships.
