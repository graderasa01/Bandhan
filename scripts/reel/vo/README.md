# Voice takes

Five files, named exactly as the cut expects:

```
story0.mp3  story1.mp3  story2.mp3  story3.mp3  story4.mp3
```

The lines they say are in `../make-vo-clips.py` (`STORY`), and which shot each
one plays under is the `vo=` field in `../build-story-ad.py` (`SHOTS`).

Make them either way:

- `python3 ../make-vo-clips.py --set story` with an ElevenLabs key set, or
- any TTS or a recorded human — only the filenames matter.

**Length is the thing to watch.** A line longer than the pictures under it
stretches its whole segment to fit, because a voice left talking over nothing
is worse than a shot held a beat too long. The script is written to about
2.5 words a second, ~41 words total, which lands the film near 19-21 seconds.
`build-story-ad.py` prints every segment it had to stretch — if it prints
several, the lines have grown, not the film.

Nothing is committed here on purpose: a placeholder voice in a repo is a
placeholder that eventually ships.
