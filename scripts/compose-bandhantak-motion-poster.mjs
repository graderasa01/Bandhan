import sharp from "sharp";
import path from "node:path";

const root = process.cwd();
const assetDir = path.join(root, "public", "ads", "reels", "premium-five-matches");
const background = path.join(assetDir, "premium-five-matches-background-v1.png");
const overlay = path.join(assetDir, "premium-five-matches-overlay-v1.svg");
const mark = path.join(root, "public", "brand", "bandhantak-header-mark.svg");
const output = path.join(assetDir, "premium-five-matches-poster-v1.png");
const overlayPng = path.join(assetDir, "premium-five-matches-overlay-v1.png");

const markPng = await sharp(mark).resize(70, 70).png().toBuffer();

await sharp(overlay)
  .composite([{ input: markPng, left: 178, top: 1471 }])
  .png()
  .toFile(overlayPng);

await sharp(background)
  .resize(1080, 1920, { fit: "cover" })
  .composite([
    { input: overlay, left: 0, top: 0 },
    { input: markPng, left: 178, top: 1471 },
  ])
  .png()
  .toFile(output);

console.log(output);
