# Ad & story art (source assets — NOT served)

These are the source images behind the marketing reels and story ads. They
live here, outside `public/`, on purpose:

- **Nothing in the app references them.** No page, component or script reads
  `/ads/...`; they are handed to the ad platforms directly.
- **`public/` is shipped and served.** Everything under `public/` is copied
  into the deploy and reachable at a public URL. These 46 MB were being
  uploaded on every Railway deploy and were openly fetchable at `/ads/<file>`,
  for no benefit — the platforms already hold their own copies.

Moved out of `public/ads` on 2026-09-20. Git history is intact (`git log
--follow`). If a page ever genuinely needs one of these, import it through the
bundler (`import art from "@/assets/ads/..."`) rather than moving the folder
back — that way only the images actually used get shipped.
