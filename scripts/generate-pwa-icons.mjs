import sharp from "sharp";
import path from "node:path";
import fs from "node:fs/promises";

/**
 * The PWA/favicon icon files under public/ were shipped with a placeholder
 * gold "B" monogram that was never swapped for the real identity once
 * `components/layout/BrandMark.tsx` (maroon seal, interlocking gold-foil
 * rings — "bandhan" = bond) was finalized. That mark already exists as a
 * standalone SVG at public/brand/bandhantak-header-mark.svg (used for the
 * Google OAuth consent icon and ad composition), so this script re-renders
 * every install/search-facing icon from that single source of truth instead
 * of hand-editing four separate PNGs that can drift again.
 *
 * Run after ANY change to bandhantak-header-mark.svg:
 *   node scripts/generate-pwa-icons.mjs
 */

const root = process.cwd();
const markPath = path.join(root, "public", "brand", "bandhantak-header-mark.svg");
const markSvg = await fs.readFile(markPath, "utf8");

const SEAL_BG = "#4a1119"; // matches the mark's own <rect> fill — see BrandMark.tsx

// 1) Plain icons: render the mark as-is (it already carries its own rounded
//    seal + transparent corners), just at each consumer's native size. This
//    mirrors exactly how the old (wrong-art) files were structured — only
//    the artwork changes.
async function renderPlain(outFile, size) {
  await sharp(Buffer.from(markSvg))
    .resize(size, size)
    .png()
    .toFile(path.join(root, "public", outFile));
}

await renderPlain("icon-192.png", 192);
await renderPlain("apple-touch-icon.png", 180);

// 2) icon-512.png: manifest.webmanifest reuses this ONE file for both
//    purpose "any" and purpose "maskable". A maskable icon must be a fully
//    opaque, edge-to-edge square with its real content inside the center
//    "safe zone" (~80% circle) — OS launchers crop to a circle/squircle and
//    would otherwise bite into the seal's corners. So: paint a full-bleed
//    seal-color canvas, then composite the mark at ~70% scale, centered.
{
  const size = 512;
  const markSize = Math.round(size * 0.7);
  const offset = Math.round((size - markSize) / 2);
  const markPng = await sharp(Buffer.from(markSvg)).resize(markSize, markSize).png().toBuffer();

  await sharp({
    create: { width: size, height: size, channels: 4, background: SEAL_BG },
  })
    .composite([{ input: markPng, left: offset, top: offset }])
    .flatten({ background: SEAL_BG }) // no transparency allowed in a maskable icon
    .png()
    .toFile(path.join(root, "public", "icon-512.png"));
}

// 3) icon-badge.png: the Web Push "badge" (public/sw.js) is the small glyph
//    Android draws in the status bar — Android strips color and uses only
//    the alpha channel as a silhouette, so a filled brand-color render would
//    just show as a solid blob. Previously this file was blank (fully
//    transparent), so no badge glyph showed at all. Render just the two
//    rings as a white silhouette on a transparent canvas instead.
{
  const size = 96;
  const badgeSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="${size}" height="${size}">
      <circle cx="16" cy="20" r="7.5" fill="none" stroke="#ffffff" stroke-width="3" />
      <circle cx="24" cy="20" r="7.5" fill="none" stroke="#ffffff" stroke-width="3" />
    </svg>`;
  await sharp(Buffer.from(badgeSvg)).resize(size, size).png().toFile(path.join(root, "public", "icon-badge.png"));
}

console.log("Regenerated icon-192.png, icon-512.png, apple-touch-icon.png, icon-badge.png from bandhantak-header-mark.svg");
