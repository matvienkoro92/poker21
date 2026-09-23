"use strict";

const path = require("node:path");
const sharp = require("sharp");

const root = path.join(__dirname, "..", "assets", "schedule", "banners");

async function render(format, number) {
  const source = path.join(root, format, "wednesday", `wednesday-${number}.png`);
  const target = path.join(root, format, "wednesday", `wednesday-${number}-info.jpg`);
  const { width, height } = await sharp(source).metadata();
  const square = format === "square";
  const panelWidth = square ? 790 : 770;
  const panelHeight = square ? 126 : 138;
  const panelX = (width - panelWidth) / 2;
  const panelY = height - panelHeight - (square ? 38 : 56);
  const mainSize = square ? 35 : 37;
  const detailSize = square ? 27 : 28;
  const text = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${panelX}" y="${panelY}" width="${panelWidth}" height="${panelHeight}" rx="24" fill="#10253b" fill-opacity="0.78" stroke="#f7dc9e" stroke-opacity="0.88" stroke-width="2"/>
    <g text-anchor="middle" font-family="Arial, Helvetica, sans-serif" fill="#fff8e9">
      <text x="${width / 2}" y="${panelY + 55}" font-size="${mainSize}" font-weight="700">Среда 18:00 мск  ·  Ребай 1000р</text>
      <text x="${width / 2}" y="${panelY + 96}" font-size="${detailSize}" font-weight="500" fill="#f3dfa8">Поздняя регистрация 12 уровней</text>
    </g>
  </svg>`);
  await sharp(source)
    .composite([{ input: text, left: 0, top: 0 }])
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
