// One-off (re-runnable) generator for the PWA raster icons, from public/icon.svg
// (P3-15). Run `node scripts/gen-icons.mjs` and commit the PNGs — they're static
// assets, not part of the build. Regenerate if the logo changes.
//
// - "any" icons keep the rounded-square logo as-is.
// - "maskable" + apple-touch use a full-bleed square (no transparent corners),
//   with the motif inside the safe zone, since the OS applies its own mask.
import sharp from "sharp";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const pub = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const rounded = readFileSync(join(pub, "icon.svg"));

const square = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">` +
    `<rect width="512" height="512" fill="#0D9488"/>` +
    `<g fill="none" stroke="#ffffff" stroke-width="30" stroke-linecap="round" stroke-linejoin="round" ` +
    `transform="translate(256 256) scale(0.82) translate(-256 -256)">` +
    `<path d="M116 190 L156 110 H356 L396 190"/>` +
    `<path d="M116 190 H396"/>` +
    `<path d="M136 190 V402 H376 V190"/>` +
    `<path d="M256 190 V402"/>` +
    `<path d="M196 260 V320 M316 260 V320"/>` +
    `</g></svg>`
);

async function png(svg, size, out) {
  await sharp(svg, { density: 512 }).resize(size, size).png({ compressionLevel: 9 }).toFile(join(pub, out));
  console.log("wrote", out, `${size}x${size}`);
}

await png(rounded, 192, "icon-192.png");
await png(rounded, 512, "icon-512.png");
await png(square, 192, "icon-maskable-192.png");
await png(square, 512, "icon-maskable-512.png");
await png(square, 180, "apple-touch-icon.png");
