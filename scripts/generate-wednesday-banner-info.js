"use strict";

const path = require("node:path");
const sharp = require("sharp");

const root = path.join(__dirname, "..", "assets", "schedule", "banners");

async function render(format, number) {
  const source = path.join(root, format, "wednesday", `wednesday-${number}.png`);
  const target = path.join(root, format, "wednesday", `wednesday-${number}-info.jpg`);
  const { width, height } = await sharp(source).metadata();
  const square = format === "square";
  const sizes = square ? [37, 33, 23] : [31, 28, 20];
  const baselines = square ? [height - 165, height - 119, height - 79] : [height - 185, height - 146, height - 109];
  const lines = ["Среда 18:00 мск", "Ребай 1000р", "Поздняя регистрация 12 уровней"];
  const text = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <g text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" paint-order="stroke fill">
      ${lines.map((line, index) => `<text x="${width / 2}" y="${baselines[index]}" font-size="${sizes[index]}" fill="#fffaf0" stroke="#13243b" stroke-opacity="0.8" stroke-width="3" stroke-linejoin="round">${line}</text>`).join("\n      ")}
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
