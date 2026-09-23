"use strict";

const path = require("node:path");
const sharp = require("sharp");

const root = path.join(__dirname, "..", "assets", "schedule", "banners");

async function render(format, number) {
  const source = path.join(root, format, "wednesday", `wednesday-${number}.png`);
  const target = path.join(root, format, "wednesday", `wednesday-${number}-info.jpg`);
  const { width, height } = await sharp(source).metadata();
  const square = format === "square";
  const sizes = square ? [50, 43, 30] : [43, 37, 27];
  const baselines = square ? [height - 191, height - 130, height - 77] : [height - 207, height - 151, height - 99];
  const lines = ["Среда 18:00 мск", "Ребай 1000р", "Поздняя регистрация 12 уровней"];
  const text = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <g text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" paint-order="stroke fill">
      ${lines.map((line, index) => `<text x="${width / 2 + 2}" y="${baselines[index] + 3}" font-size="${sizes[index]}" fill="#0a172a" stroke="#0a172a" stroke-opacity="0.85" stroke-width="9" stroke-linejoin="round">${line}</text><text x="${width / 2}" y="${baselines[index]}" font-size="${sizes[index]}" fill="#fffaf0" stroke="#17263b" stroke-width="2" stroke-linejoin="round">${line}</text>`).join("\n      ")}
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
