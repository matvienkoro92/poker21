"use strict";

const path = require("node:path");
const sharp = require("sharp");

const root = path.join(__dirname, "..", "assets", "schedule", "banners");
const plaque = path.join(root, "info-plaque.png");

async function render(format, number) {
  const source = path.join(root, format, "wednesday", `wednesday-${number}.png`);
  const target = path.join(root, format, "wednesday", `wednesday-${number}-info.jpg`);
  const { width, height } = await sharp(source).metadata();
  const square = format === "square";
  const plaqueWidth = square ? 1130 : 850;
  const plaqueImage = await sharp(plaque).resize({ width: plaqueWidth }).png().toBuffer();
  const plaqueHeight = (await sharp(plaqueImage).metadata()).height;
  const left = Math.round((width - plaqueWidth) / 2);
  const top = height - plaqueHeight - (square ? 32 : 54);
  const line1 = square ? 55 : 43;
  const line2 = square ? 47 : 38;
  const line3 = square ? 30 : 24;
  const center = left + plaqueWidth / 2;
  const text = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <g text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" paint-order="stroke fill">
      <text x="${center}" y="${top + plaqueHeight * 0.35}" font-size="${line1}" fill="#ffe7a6" stroke="#09172c" stroke-width="2">Среда 18:00 мск</text>
      <text x="${center}" y="${top + plaqueHeight * 0.59}" font-size="${line2}" fill="#ffffff" stroke="#09172c" stroke-width="2">Ребай 1000р</text>
      <text x="${center}" y="${top + plaqueHeight * 0.79}" font-size="${line3}" fill="#e7edf8" stroke="#09172c" stroke-width="1">Поздняя регистрация 12 уровней</text>
    </g>
  </svg>`);
  await sharp(source)
    .composite([{ input: plaqueImage, left, top }, { input: text, left: 0, top: 0 }])
    .jpeg({ quality: 93, mozjpeg: true })
    .toFile(target);
}

(async () => {
  for (const format of ["square", "story"]) {
    for (let number = 1; number <= (format === "square" ? 5 : 4); number++) {
      await render(format, number);
    }
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
