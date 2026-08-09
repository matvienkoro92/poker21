const fs = require("fs");
const path = require("path");

const limitBytes = 50 * 1024;
const reportsRoot = path.join(__dirname, "..", "assets", "reports");
const oversized = [];

function walk(directory) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(fullPath);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".png")) {
      const bytes = fs.statSync(fullPath).size;
      if (bytes > limitBytes) oversized.push({ file: path.relative(reportsRoot, fullPath), bytes });
    }
  }
}

walk(reportsRoot);
if (oversized.length) {
  console.error(`Report PNG limit exceeded (${limitBytes} bytes):`, oversized);
  process.exit(1);
}
console.log(`Report PNG size check passed: every image is <= ${limitBytes} bytes.`);
